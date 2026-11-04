import { NextResponse } from "next/server";
import {
  BHD_OAUTH_SCOPES,
  BHD_OAUTH_STATE_COOKIE,
  bhdIdentityIssuer,
  bhdOauthClientId,
  createPkce,
  encodeOauthStateCookie,
  isSafeReturnTo,
  randomUrlToken,
  requestOrigin,
} from "../../../../../lib/bhd/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = bhdIdentityIssuer();
  const clientId = bhdOauthClientId();
  if (!issuer || !clientId) {
    return NextResponse.redirect(new URL("/?error=bhd_not_configured", request.url));
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  const origin = requestOrigin(request);
  const redirectUri = `${origin}/api/auth/bhd/callback`;
  const state = randomUrlToken();
  const nonce = randomUrlToken();
  const { verifier, challenge } = createPkce();
  const safeReturn = isSafeReturnTo(returnTo) ? returnTo! : "/app";
  const secure = process.env.NODE_ENV === "production";

  const authorize = new URL("/oauth/authorize", `${issuer}/`);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", BHD_OAUTH_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorize);
  response.cookies.set({
    name: BHD_OAUTH_STATE_COOKIE,
    value: encodeOauthStateCookie({
      state,
      nonce,
      verifier,
      returnTo: safeReturn,
      redirectUri,
    }),
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
