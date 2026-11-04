import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { platformDatabase } from "../../../../packages/database/src/index.js";
import { hashToken } from "../security.js";
export const ADMIN_COOKIE = "legal_platform_session";
export type AdminActor = { adminId: string; sessionId: string };
export type AdminRequest = Request & { adminActor: AdminActor };
@Injectable()
export class PlatformGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const token: unknown = req.cookies?.[ADMIN_COOKIE];
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("UNAUTHENTICATED");
    const session = await platformDatabase().platformSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { admin: { select: { active: true } } },
    });
    if (
      !session ||
      !session.admin.active ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("UNAUTHENTICATED");
    req.adminActor = { adminId: session.adminId, sessionId: session.id };
    return true;
  }
}
