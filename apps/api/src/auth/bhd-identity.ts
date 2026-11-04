import { createHash, createHmac, randomBytes } from "node:crypto";
import * as jose from "jose";

export const BHD_OAUTH_STATE_COOKIE = "bhd_oauth_state";
export const BHD_OAUTH_SCOPES = "openid profile email";
export const BHD_CLIENT_ID_DEFAULT = "bhd-legal";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BhdOauthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  redirectUri: string;
};

export type BhdIdClaims = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

/** يكفي لبدء تحويل OAuth (authorize). */
export function isBhdAuthorizeReady() {
  return Boolean(bhdIdentityIssuer() && bhdOauthClientId());
}

/** يلزم سر العميل لتبادل الرمز وإصدار جلسة المنتج. */
export function isBhdIdentityReady() {
  return Boolean(isBhdAuthorizeReady() && bhdOauthClientSecret());
}

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
  return cleanEnv(process.env.BHD_OAUTH_CLIENT_ID) || BHD_CLIENT_ID_DEFAULT;
}

export function bhdOauthClientSecret() {
  return cleanEnv(process.env.BHD_OAUTH_CLIENT_SECRET);
}

export function bhdRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/bhd/callback`;
}

export function bhdPostLogoutRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/`;
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
    process.env.AUTH_SECRET?.trim() ||
    process.env.MFA_ENCRYPTION_KEY?.trim() ||
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

export function oauthStateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 300,
  };
}

export function bhdAuthorizeUrl(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}) {
  const url = new URL("/oauth/authorize", `${input.issuer}/`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", BHD_OAUTH_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function bhdEndSessionUrl(input: {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  all?: boolean;
}) {
  const url = new URL("/oauth/end-session", `${input.issuer}/`);
  url.searchParams.set("post_logout_redirect_uri", input.postLogoutRedirectUri);
  url.searchParams.set("client_id", input.clientId);
  if (input.all) url.searchParams.set("all", "1");
  return url.toString();
}

let cachedJwks: {
  uri: string;
  jwks: ReturnType<typeof jose.createRemoteJWKSet>;
  loadedAt: number;
} | null = null;

function jwksFor(issuer: string) {
  const uri = `${issuer}/oauth/jwks.json`;
  const now = Date.now();
  if (cachedJwks && cachedJwks.uri === uri && now - cachedJwks.loadedAt < 600000)
    return cachedJwks.jwks;
  const jwks = jose.createRemoteJWKSet(new URL(uri));
  cachedJwks = { uri, jwks, loadedAt: now };
  return jwks;
}

function assertClaims(
  payload: jose.JWTPayload,
  expected: { issuer: string; audience: string; nonce: string },
): BhdIdClaims {
  if (payload.iss !== expected.issuer) throw new Error("invalid_issuer");
  const aud = payload.aud;
  const audienceOk = Array.isArray(aud)
    ? aud.includes(expected.audience)
    : aud === expected.audience;
  if (!audienceOk) throw new Error("invalid_audience");
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now())
    throw new Error("token_expired");
  if (payload.nonce !== expected.nonce) throw new Error("invalid_nonce");
  if (typeof payload.sub !== "string" || !UUID_RE.test(payload.sub))
    throw new Error("invalid_sub");
  if (typeof payload.email !== "string" || !payload.email.includes("@"))
    throw new Error("invalid_email");
  if (payload.email_verified !== true && payload.email_verified !== "true")
    throw new Error("email_unverified");
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

export async function verifyBhdIdToken(
  idToken: string,
  expected: { issuer: string; audience: string; nonce: string },
  accessToken?: string,
) {
  const header = jose.decodeProtectedHeader(idToken);
  let payload: jose.JWTPayload;
  if (header.alg === "RS256") {
    payload = (
      await jose.jwtVerify(idToken, jwksFor(expected.issuer), {
        issuer: expected.issuer,
        audience: expected.audience,
        algorithms: ["RS256"],
      })
    ).payload;
  } else if (header.alg === "HS256") {
    const secret = process.env.BHD_IDENTITY_TOKEN_SECRET?.trim();
    if (secret) {
      payload = (
        await jose.jwtVerify(idToken, new TextEncoder().encode(secret), {
          issuer: expected.issuer,
          audience: expected.audience,
          algorithms: ["HS256"],
        })
      ).payload;
    } else if (accessToken) {
      const infoResp = await fetch(`${expected.issuer}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!infoResp.ok) throw new Error("userinfo_failed");
      const info = (await infoResp.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string | null;
      };
      const decoded = jose.decodeJwt(idToken);
      if (!info.sub || decoded.sub !== info.sub)
        throw new Error("userinfo_sub_mismatch");
      payload = {
        ...decoded,
        email: info.email ?? decoded.email,
        email_verified: info.email_verified ?? decoded.email_verified,
        name: info.name ?? decoded.name,
        picture: info.picture ?? decoded.picture,
      };
    } else throw new Error("missing_hs256_secret");
  } else throw new Error("unsupported_alg");
  return assertClaims(payload, expected);
}

export async function identitySessionMaxAgeSec() {
  try {
    const response = await fetch(`${bhdIdentityIssuer()}/api/bhd/runtime`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return 3456000;
    const body = (await response.json()) as {
      session?: { maxAgeSec?: number };
    };
    const value = Number(body.session?.maxAgeSec);
    return Number.isFinite(value) && value >= 86400 ? value : 3456000;
  } catch {
    return 3456000;
  }
}

export function requestOrigin(req: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const configured = process.env.WEB_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return `${proto}://${host}`.replace(/\/$/, "");
}
