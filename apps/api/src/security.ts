import "reflect-metadata";
import { randomUUID, createHash } from "node:crypto";
import {
  Catch,
  HttpException,
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  type ArgumentsHost,
  type CanActivate,
  type ExecutionContext,
  type ExceptionFilter,
} from "@nestjs/common";
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { db, inTenant } from "../../../packages/database/src/index.js";
import { Redis } from "ioredis";
import { z } from "zod";

export const COOKIE = "legal_session";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export type Actor = {
  userId: string;
  tenantId: string;
  membershipId: string;
  sessionId: string;
};
export type AuthRequest = Request & { actor: Actor; requestId: string };
export const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:9", {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
async function rateCount(bucket: string) {
  if (process.env.RATE_LIMIT_STORE === "postgres") {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateBucket" ("key","count","expiresAt")
      VALUES (${bucket}, 1, now() + make_interval(secs => 600))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateBucket"."expiresAt" <= now() THEN 1 ELSE "RateBucket"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateBucket"."expiresAt" <= now() THEN now() + make_interval(secs => 600) ELSE "RateBucket"."expiresAt" END
      RETURNING "count"`;
    return Number(rows[0]?.count ?? 0);
  }
  const script =
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
  return Number(await redis.eval(script, 1, bucket, 600));
}
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException("VALIDATION_ERROR");
  return result.data;
}
export function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  (req as AuthRequest).requestId = randomUUID();
  res.setHeader("X-Request-Id", (req as AuthRequest).requestId);
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.headers.origin !== process.env.WEB_ORIGIN) {
      res.status(403).json({
        error: {
          code: "ORIGIN_REJECTED",
          message: "ORIGIN_REJECTED",
          requestId: (req as AuthRequest).requestId,
        },
      });
      return;
    }
    const documentUpload =
      req.method === "POST" &&
      /^\/api\/v1\/practice\/documents\/[a-f0-9-]{36}\/files$/.test(req.path) &&
      req.is("multipart/form-data");
    if (
      req.method !== "DELETE" &&
      !req.is("application/json") &&
      !documentUpload
    ) {
      res.status(415).json({
        error: {
          code: "JSON_REQUIRED",
          message: "JSON_REQUIRED",
          requestId: (req as AuthRequest).requestId,
        },
      });
      return;
    }
  }
  next();
}
// Normalize parser errors before Nest's adapter replaces SyntaxError and loses its type.
// Parser diagnostics can include submitted text; only stable codes reach the client.
export const bodyParserErrors: ErrorRequestHandler = (
  error: unknown,
  _req,
  _res,
  next,
) => {
  const type =
    typeof error === "object" && error !== null && "type" in error
      ? error.type
      : undefined;
  if (type === "entity.parse.failed")
    return next(new HttpException("INVALID_JSON", 400));
  if (type === "entity.too.large")
    return next(new HttpException("REQUEST_TOO_LARGE", 413));
  next(error);
};
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      req = ctx.getRequest<AuthRequest>(),
      res = ctx.getResponse<Response>();
    let status = 500,
      code = "INTERNAL_ERROR";
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      status = 413;
      code = "REQUEST_TOO_LARGE";
    } else if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      status = 400;
      code = "INVALID_JSON";
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = error.message;
      if (!/^[A-Z][A-Z0-9_]{1,100}$/.test(code))
        code =
          status === 400
            ? "BAD_REQUEST"
            : status === 404
              ? "NOT_FOUND"
              : "HTTP_ERROR";
    } else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      status = 409;
      code = "CONFLICT";
    } else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    ) {
      status = 400;
      code = "INVALID_REFERENCE";
    }
    if (status === 500)
      console.error(
        JSON.stringify({
          requestId: req.requestId,
          kind: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    res
      .status(status)
      .json({ error: { code, message: code, requestId: req.requestId } });
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("UNAUTHENTICATED");
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { enabled: true } } },
    });
    if (
      !session ||
      !session.user.enabled ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("UNAUTHENTICATED");
    const member = await inTenant(session.tenantId, (tx) =>
      tx.membership.findFirst({
        where: {
          id: session.membershipId,
          tenantId: session.tenantId,
          userId: session.userId,
          active: true,
        },
      }),
    );
    if (!member) throw new UnauthorizedException("UNAUTHENTICATED");
    req.actor = {
      userId: session.userId,
      tenantId: session.tenantId,
      membershipId: member.id,
      sessionId: session.id,
    };
    return true;
  }
}
@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const bucket = `rate:${req.method}:${req.path}:${hashToken(req.ip ?? "unknown")}`;
    const count = await rateCount(bucket);
    if (count > 40) throw new HttpException("RATE_LIMITED", 429);
    const email: unknown = req.body?.email;
    if (typeof email === "string") {
      const accountCount = await rateCount(
        `rate:email:${hashToken(email.toLowerCase())}`,
      );
      if (accountCount > 20) throw new HttpException("RATE_LIMITED", 429);
    }
    return true;
  }
}
export { Inject, ForbiddenException };
