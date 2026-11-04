import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import {
  db,
  inTenant,
  type Tx,
} from "../../../../packages/database/src/index.js";
import { type Actor, hashToken } from "../security.js";
import {
  base32Encode,
  encryptSecret,
  decryptSecret,
  matchCounter,
  mfaConfigured,
} from "./totp.js";
@Injectable()
export class MfaService {
  async lock(tx: Tx, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`identity:${userId}`},0))`;
  }
  async assertSession(tx: Tx, actor: Actor) {
    const session = await tx.session.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        tenantId: actor.tenantId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) throw new UnauthorizedException("UNAUTHENTICATED");
  }
  async password(tx: Tx, userId: string, password: string) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, password)))
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    return user;
  }
  async status(actor: Actor) {
    const config = await db.mFAConfiguration.findUnique({
      where: { userId: actor.userId },
      select: { enabled: true },
    });
    return { enabled: config?.enabled ?? false, configured: mfaConfigured() };
  }
  async setup(actor: Actor, password: string) {
    if (!mfaConfigured())
      throw new ServiceUnavailableException("MFA_NOT_CONFIGURED");
    return inTenant(actor.tenantId, async (tx) => {
      await this.lock(tx, actor.userId);
      await this.assertSession(tx, actor);
      const user = await this.password(tx, actor.userId, password);
      const previous = await tx.mFAConfiguration.findUnique({
        where: { userId: actor.userId },
      });
      if (previous?.enabled) throw new ConflictException("MFA_ALREADY_ENABLED");
      const secret = base32Encode(randomBytes(20));
      const pendingSecret = encryptSecret(secret, actor.userId),
        pendingExpiresAt = new Date(Date.now() + 600000);
      await tx.mFAConfiguration.upsert({
        where: { userId: actor.userId },
        create: {
          userId: actor.userId,
          pendingSecret,
          pendingExpiresAt,
          recoveryHashes: [],
        },
        update: { pendingSecret, pendingExpiresAt },
      });
      return {
        secret,
        uri: `otpauth://totp/${encodeURIComponent(`LEGAL OFFICE AI:${user.email}`)}?secret=${secret}&issuer=LEGAL%20OFFICE%20AI&algorithm=SHA1&digits=6&period=30`,
      };
    });
  }
  async confirm(actor: Actor, code: string) {
    return inTenant(actor.tenantId, async (tx) => {
      await this.lock(tx, actor.userId);
      await this.assertSession(tx, actor);
      const config = await tx.mFAConfiguration.findUnique({
        where: { userId: actor.userId },
      });
      if (
        !config ||
        config.enabled ||
        !config.pendingSecret ||
        !config.pendingExpiresAt ||
        config.pendingExpiresAt < new Date()
      )
        throw new BadRequestException("MFA_SETUP_EXPIRED");
      const counter = matchCounter(
        decryptSecret(config.pendingSecret, actor.userId),
        code,
      );
      if (counter === null) throw new UnauthorizedException("MFA_INVALID");
      const recoveryCodes = Array.from({ length: 10 }, () =>
        randomBytes(8).toString("hex"),
      );
      await tx.mFAConfiguration.update({
        where: { userId: actor.userId },
        data: {
          enabled: true,
          encryptedSecret: config.pendingSecret,
          pendingSecret: null,
          pendingExpiresAt: null,
          lastCounter: counter,
          recoveryHashes: recoveryCodes.map(hashToken),
        },
      });
      await tx.session.updateMany({
        where: { userId: actor.userId, id: { not: actor.sessionId } },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "mfa.enabled",
        },
      });
      return { recoveryCodes };
    });
  }
  // Must run under a user advisory lock in the same transaction as issuing a session.
  async verifyFactor(tx: Tx, userId: string, factor?: string) {
    await this.lock(tx, userId);
    const config = await tx.mFAConfiguration.findUnique({ where: { userId } });
    if (!config?.enabled) return;
    if (!factor) throw new UnauthorizedException("MFA_REQUIRED");
    const hash = hashToken(factor.toLowerCase());
    if (config.recoveryHashes.includes(hash)) {
      await tx.mFAConfiguration.update({
        where: { userId },
        data: {
          recoveryHashes: config.recoveryHashes.filter((h) => h !== hash),
        },
      });
      return;
    }
    if (!config.encryptedSecret) throw new UnauthorizedException("MFA_INVALID");
    const counter = matchCounter(
      decryptSecret(config.encryptedSecret, userId),
      factor,
      config.lastCounter,
    );
    if (counter === null) throw new UnauthorizedException("MFA_INVALID");
    await tx.mFAConfiguration.update({
      where: { userId },
      data: { lastCounter: counter },
    });
  }
  async disable(actor: Actor, password: string, factor: string) {
    return inTenant(actor.tenantId, async (tx) => {
      await this.lock(tx, actor.userId);
      await this.assertSession(tx, actor);
      await this.password(tx, actor.userId, password);
      const config = await tx.mFAConfiguration.findUnique({
        where: { userId: actor.userId },
      });
      if (!config?.enabled) throw new BadRequestException("MFA_NOT_ENABLED");
      await this.verifyFactor(tx, actor.userId, factor);
      await tx.mFAConfiguration.update({
        where: { userId: actor.userId },
        data: {
          enabled: false,
          encryptedSecret: null,
          pendingSecret: null,
          pendingExpiresAt: null,
          recoveryHashes: [],
          lastCounter: -1n,
        },
      });
      await tx.session.updateMany({
        where: { userId: actor.userId, id: { not: actor.sessionId } },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "mfa.disabled",
        },
      });
      return { ok: true };
    });
  }
}
