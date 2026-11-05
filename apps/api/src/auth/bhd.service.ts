import {
  Injectable,
  Inject,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { db, inTenant } from "../../../../packages/database/src/index.js";
import { initialRoles } from "../../../../packages/contracts/src/index.js";
import { AuthService } from "./auth.service.js";
import { hashPassword } from "./password.js";
import type { BhdIdClaims } from "./bhd-identity.js";
import { identitySessionMaxAgeSec } from "./bhd-identity.js";

function officeSlugFromIdentity(email: string, fullName: string) {
  const local = email.split("@")[0] ?? "office";
  const raw = `${fullName}-${local}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = raw.length >= 3 ? raw : `office-${local.replace(/[^a-z0-9]/g, "").slice(0, 20) || "bhd"}`;
  return base.slice(0, 48);
}

@Injectable()
export class BhdService {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async linkOrCreate(claims: BhdIdClaims) {
    const bySub = await db.user.findFirst({ where: { bhdSub: claims.sub } });
    if (bySub) {
      await db.user.update({
        where: { id: bySub.id },
        data: {
          fullName: claims.name || bySub.fullName,
          email: claims.email,
        },
      });
      return bySub.id;
    }
    const byEmail = await db.user.findUnique({
      where: { email: claims.email },
    });
    if (byEmail) {
      if (byEmail.bhdSub && byEmail.bhdSub !== claims.sub)
        throw new UnauthorizedException("EMAIL_LINKED_ELSEWHERE");
      await db.user.update({
        where: { id: byEmail.id },
        data: {
          bhdSub: claims.sub,
          fullName: claims.name || byEmail.fullName,
        },
      });
      return byEmail.id;
    }
    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    const created = await db.user.create({
      data: {
        email: claims.email,
        fullName: claims.name || claims.email.split("@")[0] || "BHD User",
        passwordHash,
        bhdSub: claims.sub,
      },
    });
    return created.id;
  }

  /** First SSO visit: open a personal office so the user can enter the workspace. */
  private async ensurePersonalOffice(userId: string) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const country =
      (await db.country.findFirst({ where: { code: "OM", enabled: true } })) ??
      (await db.country.findFirst({ where: { enabled: true } }));
    if (!country) throw new UnauthorizedException("COUNTRY_UNAVAILABLE");

    const officeName = `${user.fullName} — مكتب قانوني`.slice(0, 120);
    let slug = officeSlugFromIdentity(user.email, user.fullName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
      const taken = await db.officeDirectory.findUnique({
        where: { slug: candidate },
      });
      if (!taken) {
        slug = candidate;
        break;
      }
      if (attempt === 7) slug = `office-${randomUUID().slice(0, 8)}`;
    }

    const tenantId = randomUUID();
    let membershipId = "";
    await inTenant(tenantId, async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenantId,
          name: officeName,
          slug,
          countryCode: country.code,
          currency: country.currency,
          timezone: country.timezone,
        },
      });
      await tx.officeDirectory.create({ data: { tenantId, slug } });
      const branch = await tx.branch.create({
        data: { tenantId, name: officeName },
      });
      let ownerRoleId = "";
      for (const role of initialRoles) {
        const created = await tx.role.create({ data: { tenantId, ...role } });
        if (role.key === "OWNER") ownerRoleId = created.id;
      }
      const member = await tx.membership.create({
        data: {
          tenantId,
          userId,
          roleId: ownerRoleId,
          branchId: branch.id,
        },
      });
      membershipId = member.id;
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "office.provisioned.bhd",
          resourceId: tenantId,
        },
      });
    });
    return { tenantId, membershipId };
  }

  async issueForUser(userId: string, userAgent: string, slug?: string) {
    const prior = await db.session.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true, membershipId: true },
    });
    const office = prior ?? (await this.ensurePersonalOffice(userId));

    const maxAgeSec = await identitySessionMaxAgeSec();
    return inTenant(office.tenantId, async (tx) => {
      const member = await tx.membership.findFirst({
        where: {
          id: office.membershipId,
          userId,
          active: true,
          ...(slug ? { tenant: { slug } } : {}),
        },
        include: { tenant: true },
      });
      if (!member) throw new UnauthorizedException("OFFICE_PROVISION_FAILED");
      const session = await this.auth.issueSession(
        tx,
        {
          userId,
          tenantId: member.tenantId,
          membershipId: member.id,
        },
        userAgent,
        maxAgeSec,
      );
      return {
        ...session,
        tenantSlug: member.tenant.slug,
        offices: [{ slug: member.tenant.slug, name: member.tenant.name }],
      };
    });
  }

  async rebind(userId: string, userAgent: string) {
    return this.issueForUser(userId, userAgent);
  }
}
