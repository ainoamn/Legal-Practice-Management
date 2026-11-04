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
    const existing = await db.membership.findFirst({
      where: { userId, active: true },
      select: { id: true },
    });
    if (existing) return;

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
      await tx.membership.create({
        data: {
          tenantId,
          userId,
          roleId: ownerRoleId,
          branchId: branch.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "office.provisioned.bhd",
          resourceId: tenantId,
        },
      });
    });
  }

  async issueForUser(userId: string, userAgent: string, slug?: string) {
    await this.ensurePersonalOffice(userId);
    const memberships = await db.membership.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
      include: { tenant: true },
    });
    if (!memberships.length) throw new UnauthorizedException("OFFICE_PROVISION_FAILED");
    const preferred = slug
      ? memberships.find((item) => item.tenant.slug === slug)
      : undefined;
    const member = preferred ?? memberships[0]!;
    const maxAgeSec = await identitySessionMaxAgeSec();
    return inTenant(member.tenantId, async (tx) => {
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
        offices: memberships.map((item) => ({
          slug: item.tenant.slug,
          name: item.tenant.name,
        })),
      };
    });
  }

  async rebind(userId: string, userAgent: string) {
    return this.issueForUser(userId, userAgent);
  }
}
