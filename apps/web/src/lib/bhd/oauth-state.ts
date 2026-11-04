import { createHash, createHmac, randomBytes } from "node:crypto";

export const BHD_OAUTH_STATE_COOKIE = "bhd_oauth_state";
export const BHD_OAUTH_SCOPES = "openid profile email";

export type BhdOauthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  redirectUri: string;
};

function cleanEnv(value: string | undefined) {
  return (value ?? "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/[\r\n]+/g, "")
    .trim();
}

export function bhdIdentityIssuer() {
  return (
    cleanEnv(process.env.BHD_IDENTITY_ISSUER) || "https://id.bhd-om.com"
  ).replace(/\/$/, "");
}

export function bhdOauthClientId() {
  return cleanEnv(process.env.BHD_OAUTH_CLIENT_ID) || "bhd-legal";
}

export function bhdOauthClientSecret() {
  return cleanEnv(process.env.BHD_OAUTH_CLIENT_SECRET);
}

export function isSafeReturnTo(value: string | null | undefined) {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return false;
  if (value.includes("://") || value.includes("\\")) return false;
  return value.length <= 512;
}

export function randomUrlToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function createPkce() {
  const verifier = randomUrlToken(48);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

function stateSecret() {
  return (
    cleanEnv(process.env.AUTH_SECRET) ||
    cleanEnv(process.env.MFA_ENCRYPTION_KEY) ||
    "legal-dev-bhd-state"
  );
}

function signPayload(payload: string) {
  return createHmac("sha256", stateSecret()).update(payload).digest("hex");
}

export function encodeOauthStateCookie(data: BhdOauthState) {
  const payload = JSON.stringify(data);
  return Buffer.from(
    JSON.stringify({ p: payload, s: signPayload(payload) }),
  ).toString("base64url");
}

export function decodeOauthStateCookie(raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { p?: string; s?: string };
    if (!parsed.p || !parsed.s || signPayload(parsed.p) !== parsed.s)
      return null;
    const data = JSON.parse(parsed.p) as BhdOauthState;
    if (
      typeof data.state !== "string" ||
      typeof data.nonce !== "string" ||
      typeof data.verifier !== "string" ||
      typeof data.returnTo !== "string" ||
      typeof data.redirectUri !== "string"
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function requestOrigin(request: Request) {
  const configured =
    cleanEnv(process.env.WEB_ORIGIN) ||
    cleanEnv(process.env.NEXT_PUBLIC_WEB_ORIGIN);
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function internalApiUrl() {
  return (
    cleanEnv(process.env.INTERNAL_API_URL) || "http://127.0.0.1:4311"
  ).replace(/\/$/, "");
}
