import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Headers,
  Inject,
  HttpException,
} from "@nestjs/common";
import { ApiTags, ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { BhdService } from "./bhd.service.js";
import { COOKIE, hashToken } from "../security.js";
import { db } from "../../../../packages/database/src/index.js";
import {
  BHD_OAUTH_STATE_COOKIE,
  bhdAuthorizeUrl,
  bhdEndSessionUrl,
  bhdIdentityIssuer,
  bhdOauthClientId,
  bhdOauthClientSecret,
  bhdPostLogoutRedirectUri,
  bhdRedirectUri,
  createPkce,
  decodeOauthStateCookie,
  encodeOauthStateCookie,
  identitySessionMaxAgeSec,
  isBhdAuthorizeReady,
  isBhdIdentityReady,
  isSafeReturnTo,
  oauthStateCookieOptions,
  randomUrlToken,
  requestOrigin,
  verifyBhdIdToken,
} from "./bhd-identity.js";

@ApiExcludeController()
@ApiTags("BHD Identity")
@Controller("auth/bhd")
export class BhdController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(BhdService) private readonly bhd: BhdService,
  ) {}

  @Get("ready")
  ready() {
    return {
      ready: isBhdIdentityReady(),
      authorizeReady: isBhdAuthorizeReady(),
      issuer: bhdIdentityIssuer(),
      clientId: bhdOauthClientId(),
    };
  }

  @Get("start")
  start(
    @Req() req: Request,
    @Res() res: Response,
    @Query("returnTo") returnTo?: string,
  ) {
    if (!isBhdAuthorizeReady()) {
      return res.redirect("/?error=bhd_not_configured");
    }
    const origin = requestOrigin(req);
    const redirectUri = bhdRedirectUri(origin);
    const state = randomUrlToken();
    const nonce = randomUrlToken();
    const { verifier, challenge } = createPkce();
    const safeReturn = isSafeReturnTo(returnTo) ? returnTo! : "/app";
    const secure = process.env.NODE_ENV === "production";
    res.cookie(
      BHD_OAUTH_STATE_COOKIE,
      encodeOauthStateCookie({
        state,
        nonce,
        verifier,
        returnTo: safeReturn,
        redirectUri,
      }),
      oauthStateCookieOptions(secure),
    );
    return res.redirect(
      bhdAuthorizeUrl({
        issuer: bhdIdentityIssuer(),
        clientId: bhdOauthClientId(),
        redirectUri,
        state,
        nonce,
        challenge,
      }),
    );
  }

  @Get("callback")
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ) {
    const secure = process.env.NODE_ENV === "production";
    const saved = decodeOauthStateCookie(
      req.cookies?.[BHD_OAUTH_STATE_COOKIE] as string | undefined,
    );
    res.clearCookie(BHD_OAUTH_STATE_COOKIE, { path: "/" });
    if (!isBhdIdentityReady()) return res.redirect("/?error=bhd_not_configured");
    if (error) return res.redirect(`/?error=bhd_${error}`);
    if (!saved || !code || !state || saved.state !== state)
      return res.redirect("/?error=bhd_state");
    try {
      const tokenResp = await fetch(`${bhdIdentityIssuer()}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: saved.redirectUri,
          client_id: bhdOauthClientId(),
          client_secret: bhdOauthClientSecret(),
          code_verifier: saved.verifier,
        }),
      });
      if (!tokenResp.ok) return res.redirect("/?error=bhd_token");
      const tokens = (await tokenResp.json()) as {
        id_token?: string;
        access_token?: string;
      };
      if (!tokens.id_token) return res.redirect("/?error=bhd_id_token");
      const claims = await verifyBhdIdToken(
        tokens.id_token,
        {
          issuer: bhdIdentityIssuer(),
          audience: bhdOauthClientId(),
          nonce: saved.nonce,
        },
        tokens.access_token,
      );
      const userId = await this.bhd.linkOrCreate(claims);
      try {
        const session = await this.bhd.issueForUser(
          userId,
          req.headers["user-agent"] ?? "",
        );
        res.cookie(COOKIE, session.token, {
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
          expires: session.expiresAt,
        });
        const dest = isSafeReturnTo(saved.returnTo) ? saved.returnTo : "/app";
        return res.redirect(dest);
      } catch (err) {
        const payload =
          err instanceof HttpException ? err.getResponse() : null;
        const text =
          typeof payload === "string"
            ? payload
            : payload &&
                typeof payload === "object" &&
                "message" in payload
              ? String(
                  Array.isArray(
                    (payload as { message?: unknown }).message,
                  )
                    ? (payload as { message: unknown[] }).message.join(" ")
                    : (payload as { message?: unknown }).message ?? "",
                )
              : err instanceof Error
                ? err.message
                : String(err ?? "");
        if (text.includes("NO_OFFICE_MEMBERSHIP")) {
          return res.redirect(
            `/?error=bhd_no_office&email=${encodeURIComponent(claims.email)}`,
          );
        }
        throw err;
      }
    } catch {
      return res.redirect("/?error=bhd_callback");
    }
  }

  @Get("logout")
  async logout(
    @Req() req: Request,
    @Res() res: Response,
    @Query("all") all?: string,
    @Query("continue") cont?: string,
  ) {
    const token = req.cookies?.[COOKIE];
    if (typeof token === "string" && token) {
      const session = await db.session.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (session && !session.revokedAt) {
        await db.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
      }
    }
    res.clearCookie(COOKIE, { path: "/" });
    const origin = requestOrigin(req);
    if (typeof cont === "string" && cont) {
      if (cont.startsWith("http://") || cont.startsWith("https://")) {
        return res.redirect(303, cont);
      }
      if (isSafeReturnTo(cont)) {
        return res.redirect(303, new URL(cont, origin).toString());
      }
    }
    if (!isBhdIdentityReady()) return res.redirect("/");
    return res.redirect(
      bhdEndSessionUrl({
        issuer: bhdIdentityIssuer(),
        clientId: bhdOauthClientId(),
        postLogoutRedirectUri: bhdPostLogoutRedirectUri(origin),
        all: all === "1",
      }),
    );
  }

  @Post("rebind")
  async rebind(
    @Req() req: Request,
    @Res() res: Response,
    @Headers("authorization") authorization?: string,
  ) {
    if (!isBhdIdentityReady()) throw new HttpException("BHD_NOT_READY", 503);

    const body = (req.body ?? {}) as {
      idToken?: string;
      nonce?: string;
      token?: string;
      returnTo?: string;
    };
    const accept = req.headers.accept || "";
    const wantsJson = accept.includes("application/json");
    const returnTo = isSafeReturnTo(body.returnTo) ? body.returnTo! : "/app";
    const origin = requestOrigin(req);

    const headerBearer = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    const bodyToken =
      typeof body.token === "string" ? body.token.trim() : "";
    const idToken = typeof body.idToken === "string" ? body.idToken : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : "";

    let claims: Awaited<ReturnType<typeof verifyBhdIdToken>>;

    if (idToken && nonce) {
      if (!headerBearer) throw new HttpException("UNAUTHENTICATED", 401);
      try {
        claims = await verifyBhdIdToken(
          idToken,
          {
            issuer: bhdIdentityIssuer(),
            audience: bhdOauthClientId(),
            nonce,
          },
          headerBearer,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : "verify_failed";
        console.error("bhd_rebind_verify", reason);
        throw new HttpException("UNAUTHENTICATED", 401);
      }
    } else {
      const windowToken = bodyToken || headerBearer;
      if (!windowToken || windowToken.length < 20) {
        if (wantsJson) {
          return res.status(401).json({ ok: false, error: "token" });
        }
        return res.redirect(
          303,
          new URL(
            `/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`,
            origin,
          ).toString(),
        );
      }
      try {
        claims = await profileFromWindowToken(windowToken);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "me_failed";
        console.error("bhd_rebind_window", reason);
        if (wantsJson) {
          res.clearCookie(COOKIE, { path: "/" });
          return res.status(401).json({ ok: false, error: "rebind" });
        }
        return res.redirect(
          303,
          new URL(
            `/api/auth/bhd/logout?continue=${encodeURIComponent(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`)}`,
            origin,
          ).toString(),
        );
      }
    }

    const existingCookie =
      typeof req.cookies?.[COOKIE] === "string" ? req.cookies[COOKIE] : "";
    if (existingCookie) {
      const existing = await db.session.findUnique({
        where: { tokenHash: hashToken(existingCookie) },
        include: { user: { select: { bhdSub: true, email: true, fullName: true } } },
      });
      if (
        existing &&
        !existing.revokedAt &&
        existing.expiresAt > new Date() &&
        existing.user.bhdSub === claims.sub
      ) {
        if (wantsJson) {
          return res.status(200).json({
            ok: true,
            unchanged: true,
            user: {
              id: claims.sub,
              email: existing.user.email,
              name: existing.user.fullName,
            },
          });
        }
        const target = new URL(returnTo, origin);
        target.searchParams.set("au", claims.sub);
        return res.redirect(303, target.toString());
      }
    }

    let userId: string;
    try {
      userId = await this.bhd.linkOrCreate(claims);
    } catch {
      throw new HttpException("UNAUTHENTICATED", 401);
    }

    const session = await this.bhd.issueForUser(
      userId,
      req.headers["user-agent"] ?? "",
    );
    const maxAgeSec = await identitySessionMaxAgeSec();
    res.cookie(COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
      maxAge: maxAgeSec,
    });

    const userPayload = {
      id: claims.sub,
      email: claims.email,
      name: claims.name || claims.email,
    };

    if (wantsJson || (idToken && nonce)) {
      return res.status(200).json({
        ok: true,
        user: userPayload,
        tenantSlug: session.tenantSlug,
        maxAgeSec,
        sessionToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
      });
    }

    const target = new URL(returnTo, origin);
    target.searchParams.set("au", claims.sub);
    target.searchParams.set("_bhd", String(Date.now()));
    return res.redirect(303, target.toString());
  }
}

async function profileFromWindowToken(token: string) {
  const response = await fetch(`${bhdIdentityIssuer()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`me_${response.status}`);
  const body = (await response.json()) as {
    user?: { id?: string; email?: string; name?: string; picture?: string } | null;
  };
  const user = body.user;
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const sub = typeof user?.id === "string" ? user.id.trim() : "";
  if (!sub || !email) throw new Error("claims");
  return {
    sub,
    email,
    name: typeof user?.name === "string" && user.name.trim() ? user.name.trim() : email,
    picture: typeof user?.picture === "string" ? user.picture : null,
  };
}
