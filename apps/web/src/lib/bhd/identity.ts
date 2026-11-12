import { createHash, randomBytes } from "crypto";
import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";

export const BHD_OAUTH_STATE_COOKIE = "bhd_oauth_state";

export type BhdOAuthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  redirectUri: string;
};

export function identityIssuer(): string {
  return (process.env.BHD_IDENTITY_ISSUER?.trim() || DEFAULT_IDENTITY_ISSUER).replace(
    /\/$/,
    "",
  );
}

export function oauthClientId(): string {
  return process.env.BHD_OAUTH_CLIENT_ID?.trim() || "bhd-legal";
}

export function oauthClientSecret(): string {
  return process.env.BHD_OAUTH_CLIENT_SECRET?.trim() || "";
}

export function isSsoConfigured(): boolean {
  return Boolean(oauthClientId());
}

export function oauthRedirectUri(origin: string): string {
  const fromRequest = `${origin.replace(/\/$/, "")}/api/auth/bhd/callback`;
  const configured = process.env.BHD_OAUTH_REDIRECT_URI?.trim();
  if (!configured) return fromRequest;
  try {
    if (new URL(configured).origin === new URL(origin).origin) return configured;
  } catch {
    /* ignore */
  }
  return fromRequest;
}

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://"))
    return false;
  return true;
}

export function safeReturnPath(value: string | null | undefined): string {
  return isSafeNextPath(value) ? value : "/app";
}

export function oauthStateCookieOptions(maxAge = 5 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function endSessionUrl(origin: string): string {
  const url = new URL("/oauth/end-session", identityIssuer());
  url.searchParams.set("post_logout_redirect_uri", `${origin.replace(/\/$/, "")}/`);
  const clientId = oauthClientId();
  if (clientId) url.searchParams.set("client_id", clientId);
  return url.toString();
}
