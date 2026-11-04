import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import {
  platformDatabase,
  type Tx,
} from "../../../../packages/database/src/index.js";
import { hashToken } from "../security.js";
import { hashPassword } from "../auth/password.js";
import {
  base32Encode,
  encryptSecret,
  decryptSecret,
  matchCounter,
  mfaConfigured,
} from "../auth/totp.js";
import type { AdminActor } from "./platform.security.js";
import type { PlatformPermission } from "../../../../packages/contracts/src/platform.js";
let dummy: Promise<string> | undefined;
@Injectable()
export class PlatformAuthService {
  get db() {
    return platformDatabase();
  }
  async audit(
    tx: Tx,
    adminId: string | null,
    action: string,
    targetId?: string,
  ) {
    return tx.platformAudit.create({ data: { adminId, action, targetId } });
  }
  async session(tx: Tx, actor: AdminActor) {
    const session = await tx.platformSession.findFirst({
      where: {
        id: actor.sessionId,
        adminId: actor.adminId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { admin: true },
    });
    if (!session || !session.admin.active)
      throw new UnauthorizedException("UNAUTHENTICATED");
    return session;
  }
  async run<T>(
    actor: AdminActor,
    permission: PlatformPermission,
    work: (tx: Tx) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const session = await this.session(tx, actor);
        if (!session.verified || !session.admin.encryptedSecret)
          throw new ForbiddenException("MFA_ENROLLMENT_REQUIRED");
        if (!session.admin.permissions.includes(permission))
          throw new ForbiddenException("FORBIDDEN");
        return work(tx);
      },
      { timeout: 15000 },
    );
  }
  async login(email: string, password: string, factor?: string) {
    const admin = await this.db.platformAdmin.findUnique({ where: { email } });
    dummy ??= hashPassword(randomBytes(24).toString("hex"));
    const valid = await argon2.verify(
      admin?.passwordHash ?? (await dummy),
      password,
    );
    if (!admin || !admin.active || !valid) {
      await this.db.platformAudit.create({
        data: { action: "admin.login.failed" },
      });
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${admin.id}`},0))`;
      const current = await tx.platformAdmin.findUniqueOrThrow({
        where: { id: admin.id },
      });
      if (!current.active || current.passwordHash !== admin.passwordHash)
        throw new UnauthorizedException("INVALID_CREDENTIALS");
      if (current.encryptedSecret) {
        if (!factor) throw new UnauthorizedException("MFA_REQUIRED");
        const counter = matchCounter(
          decryptSecret(current.encryptedSecret, current.id),
          factor,
          current.lastCounter,
        );
        if (counter === null) throw new UnauthorizedException("MFA_INVALID");
        await tx.platformAdmin.update({
          where: { id: current.id },
          data: { lastCounter: counter },
        });
      }
      const token = randomBytes(32).toString("hex"),
        expiresAt = new Date(Date.now() + 7200000);
      await tx.platformSession.create({
        data: {
          adminId: admin.id,
          tokenHash: hashToken(token),
          verified: Boolean(current.encryptedSecret),
          expiresAt,
        },
      });
      await this.audit(tx, admin.id, "admin.login");
      return { token, expiresAt };
    });
  }
  async me(actor: AdminActor) {
    return this.db.$transaction(async (tx) => {
      const session = await this.session(tx, actor);
      return {
        id: session.admin.id,
        name: session.admin.name,
        email: session.admin.email,
        kind: session.admin.kind,
        permissions: session.admin.permissions,
        mfaReady: session.verified && Boolean(session.admin.encryptedSecret),
        mfaConfigured: mfaConfigured(),
      };
    });
  }
  async logout(actor: AdminActor) {
    return this.db.$transaction(async (tx) => {
      await tx.platformSession.updateMany({
        where: { id: actor.sessionId, adminId: actor.adminId },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, actor.adminId, "admin.logout");
      return { ok: true };
    });
  }
  async revokeOthers(actor: AdminActor) {
    return this.db.$transaction(async (tx) => {
      const session = await this.session(tx, actor);
      if (!session.verified)
        throw new ForbiddenException("MFA_ENROLLMENT_REQUIRED");
      await tx.platformSession.updateMany({
        where: {
          adminId: actor.adminId,
          id: { not: actor.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, actor.adminId, "admin.sessions.others.revoked");
      return { ok: true };
    });
  }
  async setup(actor: AdminActor, password: string) {
    if (!mfaConfigured())
      throw new ServiceUnavailableException("MFA_NOT_CONFIGURED");
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${actor.adminId}`},0))`;
      const session = await this.session(tx, actor);
      if (session.admin.encryptedSecret)
        throw new ConflictException("MFA_ALREADY_ENABLED");
      if (!(await argon2.verify(session.admin.passwordHash, password)))
        throw new UnauthorizedException("INVALID_CREDENTIALS");
      const secret = base32Encode(randomBytes(20));
      await tx.platformAdmin.update({
        where: { id: actor.adminId },
        data: {
          pendingSecret: encryptSecret(secret, actor.adminId),
          pendingExpiresAt: new Date(Date.now() + 600000),
        },
      });
      return { secret };
    });
  }
  async confirm(actor: AdminActor, code: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${actor.adminId}`},0))`;
      const session = await this.session(tx, actor),
        admin = session.admin;
      if (
        admin.encryptedSecret ||
        !admin.pendingSecret ||
        !admin.pendingExpiresAt ||
        admin.pendingExpiresAt < new Date()
      )
        throw new BadRequestException("MFA_SETUP_EXPIRED");
      const counter = matchCounter(
        decryptSecret(admin.pendingSecret, admin.id),
        code,
      );
      if (counter === null) throw new UnauthorizedException("MFA_INVALID");
      await tx.platformAdmin.update({
        where: { id: admin.id },
        data: {
          encryptedSecret: admin.pendingSecret,
          pendingSecret: null,
          pendingExpiresAt: null,
          lastCounter: counter,
        },
      });
      await tx.platformSession.update({
        where: { id: actor.sessionId },
        data: { verified: true },
      });
      await tx.platformSession.updateMany({
        where: { adminId: admin.id, id: { not: actor.sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, admin.id, "admin.mfa.enabled");
      return { ok: true };
    });
  }
}
