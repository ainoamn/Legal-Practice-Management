import { NextRequest, NextResponse } from "next/server";
import {
  BHD_OAUTH_STATE_COOKIE,
  bhdIdentityIssuer,
  bhdOauthClientId,
  bhdOauthClientSecret,
  decodeOauthStateCookie,
  internalApiUrl,
  isSafeReturnTo,
  requestOrigin,
} from "../../../../../lib/bhd/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "legal_session";

function clearState(response: NextResponse, secure: boolean) {
  response.cookies.set({
    name: BHD_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function fail(request: NextRequest, code: string, secure: boolean) {
  const response = NextResponse.redirect(new URL(`/?error=${code}`, request.url));
  clearState(response, secure);
  return response;
}

export async function GET(request: NextRequest) {
  const secure = process.env.NODE_ENV === "production";
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookie = request.cookies.get(BHD_OAUTH_STATE_COOKIE)?.value;
  const saved = decodeOauthStateCookie(cookie);

  if (oauthError) return fail(request, `bhd_${oauthError}`, secure);
  if (!saved || !code || !state || saved.state !== state)
    return fail(request, "bhd_state", secure);

  const secret = bhdOauthClientSecret();
  if (!secret) return fail(request, "bhd_not_configured", secure);

  try {
    const tokenResp = await fetch(`${bhdIdentityIssuer()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: saved.redirectUri,
        client_id: bhdOauthClientId(),
        client_secret: secret,
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenResp.ok) return fail(request, "bhd_token", secure);
    const tokens = (await tokenResp.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(request, "bhd_token", secure);

    const api = internalApiUrl();
    const origin = requestOrigin(request);
    const rebind = await fetch(`${api}/api/v1/auth/bhd/rebind`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!rebind.ok) {
      if (rebind.status === 400) return fail(request, "bhd_no_office", secure);
      return fail(request, "bhd_callback", secure);
    }

    const payload = (await rebind.json()) as {
      ok?: boolean;
      sessionToken?: string;
      expiresAt?: string;
      maxAgeSec?: number;
    };
    if (!payload.sessionToken) return fail(request, "bhd_callback", secure);

    const dest = isSafeReturnTo(saved.returnTo) ? saved.returnTo : "/app";
    const response = NextResponse.redirect(new URL(dest, origin));
    clearState(response, secure);

    const maxAge =
      typeof payload.maxAgeSec === "number" && payload.maxAgeSec >= 3600
        ? payload.maxAgeSec
        : 12 * 3600;
    response.cookies.set({
      name: SESSION_COOKIE,
      value: payload.sessionToken,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
      expires: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
    });
    return response;
  } catch {
    return fail(request, "bhd_callback", secure);
  }
}
