import { NextRequest, NextResponse } from "next/server";
import { internalApiUrl } from "@/lib/bhd/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Isolation-facing /api/auth/me — returns BHD sub as user.id so Silent SSO
 * can match BhdIdentity.me() without comparing local UUIDs.
 */
export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const response = await fetch(`${internalApiUrl()}/api/v1/auth/me`, {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    const body = (await response.json()) as {
      user?: {
        id?: string;
        email?: string;
        fullName?: string;
        bhdSub?: string | null;
      };
    };
    const email = body.user?.email?.trim() || "";
    const bhdSub = body.user?.bhdSub?.trim() || "";
    if (!email || !bhdSub) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: bhdSub,
        email,
        name: body.user?.fullName?.trim() || email,
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
