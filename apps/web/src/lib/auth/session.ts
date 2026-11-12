/** Product session cookie — issued by @legal/api after BHD callback/rebind. */
export const SESSION_COOKIE = "legal_session";

export function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() || "";
}

export function sessionCookieOptions(maxAgeSec = 12 * 3600) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
