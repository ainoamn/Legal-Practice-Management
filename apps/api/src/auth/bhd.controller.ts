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
    if (!isBhdIdentityReady()) return res.redirect("/");
    const origin = requestOrigin(req);
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
    @Res({ passthrough: true }) res: Response,
    @Headers("authorization") authorization?: string,
  ) {
    if (!isBhdIdentityReady()) throw new HttpException("BHD_NOT_READY", 503);
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (!bearer) throw new HttpException("UNAUTHENTICATED", 401);

    const issuer = bhdIdentityIssuer();
    let sub = "";
    let email = "";
    let name: string | null = null;

    const userinfoResp = await fetch(`${issuer}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (userinfoResp.ok) {
      const info = (await userinfoResp.json()) as {
        sub?: string;
        email?: string;
        name?: string;
      };
      sub = info.sub?.trim() || "";
      email = info.email?.trim().toLowerCase() || "";
      name = info.name?.trim() || null;
    } else {
      const meResp = await fetch(`${issuer}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!meResp.ok) throw new HttpException("UNAUTHENTICATED", 401);
      const body = (await meResp.json()) as {
        user?: { id?: string; email?: string; name?: string };
      };
      sub = body.user?.id?.trim() || "";
      email = body.user?.email?.trim().toLowerCase() || "";
      name = body.user?.name?.trim() || null;
    }
    if (!sub || !email) throw new HttpException("UNAUTHENTICATED", 401);

    const userId = await this.bhd.linkOrCreate({
      sub,
      email,
      name,
      picture: null,
    });
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
    return {
      ok: true,
      tenantSlug: session.tenantSlug,
      maxAgeSec,
      // Used by Next callback on a different host to mint the first-party session cookie.
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}
