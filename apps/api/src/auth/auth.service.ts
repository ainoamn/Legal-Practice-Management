import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import {
  db,
  inTenant,
  type Tx,
} from "../../../../packages/database/src/index.js";
import {
  initialRoles,
  type RegisterInput,
  type LoginInput,
} from "../../../../packages/contracts/src/index.js";
import { hashToken, type Actor } from "../security.js";
import { MfaService } from "./mfa.service.js";

import { hashPassword } from "./password.js";
let dummyHash: Promise<string> | undefined;
@Injectable()
export class AuthService {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}
  async register(
    input: RegisterInput,
    userAgent: string,
    platformProvisioning = false,
  ) {
    const settings = await db.platformSettings.findUnique({
      where: { id: "default" },
    });
    if (!platformProvisioning && settings && !settings.registrationOpen)
      throw new ForbiddenException("REGISTRATION_CLOSED");
    const country = await db.country.findFirst({
      where: { code: input.countryCode, enabled: true },
    });
    if (!country) throw new BadRequestException("INVALID_COUNTRY");
    const passwordHash = await hashPassword(input.password),
      tenantId = randomUUID();
    return inTenant(tenantId, async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, fullName: input.fullName, passwordHash },
      });
      await tx.tenant.create({
        data: {
          id: tenantId,
          name: input.officeName,
          slug: input.slug,
          countryCode: country.code,
          currency: country.currency,
          timezone: country.timezone,
        },
      });
      await tx.officeDirectory.create({ data: { tenantId, slug: input.slug } });
      const branch = await tx.branch.create({
        data: { tenantId, name: input.officeName },
      });
      let ownerRoleId = "";
      for (const role of initialRoles) {
        const created = await tx.role.create({ data: { tenantId, ...role } });
        if (role.key === "OWNER") ownerRoleId = created.id;
      }
      const member = await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          roleId: ownerRoleId,
          branchId: branch.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: platformProvisioning ? null : user.id,
          action: platformProvisioning
            ? "office.provisioned"
            : "office.registered",
          resourceId: tenantId,
        },
      });
      if (platformProvisioning)
        return { token: "", expiresAt: new Date(), tenantId };
      return this.issueSession(
        tx,
        { userId: user.id, tenantId, membershipId: member.id },
        userAgent,
      );
    });
  }
  async login(input: LoginInput, userAgent: string) {
    const user = await db.user.findUnique({ where: { email: input.email } });
    dummyHash ??= hashPassword(randomBytes(24).toString("hex"));
    const valid = await argon2.verify(
      user?.passwordHash ?? (await dummyHash),
      input.password,
    );
    if (!user || !user.enabled || !valid)
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    const office = await db.officeDirectory.findUnique({
      where: { slug: input.slug },
    });
    const tenantId = office?.tenantId;
    if (!tenantId) throw new UnauthorizedException("INVALID_CREDENTIALS");
    return inTenant(tenantId, async (tx) => {
      const member = await tx.membership.findFirst({
        where: { tenantId, userId: user.id, active: true },
      });
      if (!member) throw new UnauthorizedException("INVALID_CREDENTIALS");
      await this.mfa.lock(tx, user.id);
      const currentUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (
        !currentUser.enabled ||
        currentUser.passwordHash !== user.passwordHash
      )
        throw new UnauthorizedException("INVALID_CREDENTIALS");
      await this.mfa.verifyFactor(tx, user.id, input.factor);
      return this.issueSession(
        tx,
        { userId: user.id, tenantId, membershipId: member.id },
        userAgent,
      );
    });
  }
  async issueSession(
    tx: Tx,
    actor: Omit<Actor, "sessionId">,
    userAgent: string,
  ) {
    const token = randomBytes(32).toString("hex");
    const hours = Number(process.env.SESSION_HOURS ?? 12);
    const expiresAt = new Date(Date.now() + hours * 3600000);
    await tx.session.create({
      data: {
        ...actor,
        tokenHash: hashToken(token),
        userAgent: userAgent.slice(0, 300),
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        action: "session.created",
      },
    });
    return { token, expiresAt };
  }
  async me(actor: Actor) {
    return inTenant(actor.tenantId, async (tx) => {
      const member = await tx.membership.findFirstOrThrow({
        where: { id: actor.membershipId, tenantId: actor.tenantId },
        include: {
          role: true,
          branch: true,
          user: { select: { id: true, email: true, fullName: true } },
          tenant: { include: { country: true } },
        },
      });
      return {
        user: member.user,
        membership: {
          id: member.id,
          branchId: member.branchId,
          roleId: member.roleId,
        },
        role: member.role,
        tenant: member.tenant,
        branch: member.branch,
      };
    });
  }
  async logout(actor: Actor) {
    return inTenant(actor.tenantId, async (tx) => {
      await tx.session.updateMany({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          tenantId: actor.tenantId,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "session.logout",
          resourceId: actor.sessionId,
        },
      });
      return { ok: true };
    });
  }
  async sessions(actor: Actor) {
    return db.session.findMany({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async revoke(actor: Actor, id?: string) {
    return inTenant(actor.tenantId, async (tx) => {
      const result = await tx.session.updateMany({
        where: {
          userId: actor.userId,
          tenantId: actor.tenantId,
          ...(id ? { id } : { id: { not: actor.sessionId } }),
        },
        data: { revokedAt: new Date() },
      });
      if (id && result.count === 0)
        throw new ConflictException("SESSION_NOT_FOUND");
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "session.revoked",
          resourceId: id,
        },
      });
      return { ok: true };
    });
  }
}
