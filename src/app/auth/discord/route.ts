import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { ApiError, kushApi } from "@/lib/server/kush-api";
import {
  OAUTH_COOKIE,
  allow,
  cookieOptions,
  siteUrl,
  visitorKey,
} from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Starts "Sign in with Discord". A random binding is kept in an HttpOnly
 * cookie; the API only accepts the callback from the browser holding it
 * (stops someone tricking a visitor into finishing *their* sign-in).
 */
export async function GET() {
  const failed = (reason: string) =>
    NextResponse.redirect(siteUrl(`/sign-in?error=${reason}`));
  if (!allow(`oauth-start:${await visitorKey()}`, 10, 60_000))
    return failed("busy");
  const binding = randomBytes(32).toString("base64url");
  try {
    const { authorizeUrl } = await kushApi<{ authorizeUrl: string }>(
      "/web/auth/discord/start",
      { method: "POST", body: { binding } },
    );
    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(OAUTH_COOKIE, binding, cookieOptions(10 * 60));
    return response;
  } catch (error) {
    return failed(
      error instanceof ApiError && error.status === 503 && /configured/.test(error.message)
        ? "unconfigured"
        : "unavailable",
    );
  }
}
