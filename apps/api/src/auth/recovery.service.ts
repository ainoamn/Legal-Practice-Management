import {
  Injectable,
  Inject,
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { db, inTenant } from "../../../../packages/database/src/index.js";
import { hashToken } from "../security.js";
import { hashPassword } from "./password.js";
import { Mailer } from "./mail.js";
@Injectable()
export class RecoveryService {
  constructor(@Inject(Mailer) private readonly mailer: Mailer) {}
  capabilities() {
    return { passwordRecovery: this.mailer.configured() };
  }
  async forgot(email: string, slug: string) {
    if (!this.mailer.configured())
      throw new ServiceUnavailableException("RECOVERY_DISABLED");
    const user = await db.user.findUnique({ where: { email } }),
      office = await db.officeDirectory.findUnique({ where: { slug } });
    if (!user || !user.enabled || !office) return { ok: true };
    const member = await inTenant(office.tenantId, (tx) =>
      tx.membership.findFirst({
        where: { tenantId: office.tenantId, userId: user.id, active: true },
      }),
    );
    if (!member) return { ok: true };
    const token = randomBytes(32).toString("hex"),
      tokenHash = hashToken(token);
    await inTenant(office.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`identity:${user.id}`},0))`;
      await tx.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordReset.create({
        data: {
          tokenHash,
          userId: user.id,
          tenantId: office.tenantId,
          expiresAt: new Date(Date.now() + 1800000),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: office.tenantId,
          actorId: user.id,
          action: "password.reset.requested",
        },
      });
    });
    try {
      await this.mailer.sendPasswordReset(
        email,
        `${process.env.WEB_ORIGIN}/#reset=${token}`,
      );
    } catch {
      await db.passwordReset.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      });
      console.error(
        JSON.stringify({ event: "password_reset_delivery_failed" }),
      );
    }
    // Same response for unknown, suspended and valid accounts, including provider failure.
    return { ok: true };
  }
  async reset(token: string, password: string) {
    const tokenHash = hashToken(token),
      existing = await db.passwordReset.findUnique({ where: { tokenHash } });
    if (!existing || existing.usedAt || existing.expiresAt <= new Date())
      throw new BadRequestException("INVALID_RESET");
    const passwordHash = await hashPassword(password);
    return inTenant(existing.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`identity:${existing.userId}`},0))`;
      const current = await tx.passwordReset.findUniqueOrThrow({
        where: { tokenHash },
      });
      const member = await tx.membership.findFirst({
        where: {
          tenantId: current.tenantId,
          userId: current.userId,
          active: true,
        },
      });
      if (!member || current.usedAt || current.expiresAt <= new Date())
        throw new BadRequestException("INVALID_RESET");
      await tx.user.update({
        where: { id: current.userId },
        data: { passwordHash },
      });
      await tx.passwordReset.updateMany({
        where: { userId: current.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: current.tenantId,
          actorId: current.userId,
          action: "password.reset.completed",
        },
      });
      return { ok: true };
    });
  }
}
