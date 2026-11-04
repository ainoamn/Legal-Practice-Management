import { NextRequest, NextResponse } from "next/server";
import {
  BHD_OAUTH_STATE_COOKIE,
  bhdIdentityIssuer,
  bhdOauthClientId,
  bhdOauthClientSecret,
  decodeOauthStateCookie,
  isSafeReturnTo,
  requestOrigin,
} from "../../../../../lib/bhd/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const api = (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4311").replace(
      /\/$/,
      "",
    );
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

    const dest = isSafeReturnTo(saved.returnTo) ? saved.returnTo : "/app";
    const response = NextResponse.redirect(new URL(dest, origin));
    clearState(response, secure);

    const setCookies =
      typeof rebind.headers.getSetCookie === "function"
        ? rebind.headers.getSetCookie()
        : [];
    if (setCookies.length) {
      for (const item of setCookies) response.headers.append("Set-Cookie", item);
    } else {
      const single = rebind.headers.get("set-cookie");
      if (single) response.headers.append("Set-Cookie", single);
    }
    return response;
  } catch {
    return fail(request, "bhd_callback", secure);
  }
}
