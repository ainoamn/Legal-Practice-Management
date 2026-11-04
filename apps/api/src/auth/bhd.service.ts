import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { db, inTenant } from "../../../../packages/database/src/index.js";
import { AuthService } from "./auth.service.js";
import { hashPassword } from "./password.js";
import type { BhdIdClaims } from "./bhd-identity.js";
import { identitySessionMaxAgeSec } from "./bhd-identity.js";

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

  async issueForUser(userId: string, userAgent: string, slug?: string) {
    const memberships = await db.membership.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
      include: { tenant: true },
    });
    if (!memberships.length) {
      const err = new BadRequestException("NO_OFFICE_MEMBERSHIP");
      (err as Error & { code?: string }).code = "NO_OFFICE_MEMBERSHIP";
      throw err;
    }
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
