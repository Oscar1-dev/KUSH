import { NextResponse, type NextRequest } from "next/server";

import { ApiError, kushApi } from "@/lib/server/kush-api";
import {
  NEXT_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  allow,
  cookieOptions,
  safeNext,
  siteUrl,
  visitorKey,
} from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Discord redirects here. The API validates state, PKCE and the binding. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const finish = (path: string) => {
    const response = NextResponse.redirect(siteUrl(path));
    response.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
    response.cookies.set(NEXT_COOKIE, "", cookieOptions(0));
    return response;
  };
  if (!allow(`oauth-callback:${await visitorKey()}`, 10, 60_000))
    return finish("/sign-in?error=busy");
  // The visitor pressed "Cancel" on Discord.
  if (params.get("error")) return finish("/sign-in?error=cancelled");

  const state = params.get("state");
  const code = params.get("code");
  const binding = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!state || !code || !binding) return finish("/sign-in?error=expired");

  try {
    const result = await kushApi<{
      token: string;
      mfaEnabled: boolean;
    }>("/web/auth/discord/callback", {
      method: "POST",
      body: {
        state,
        code,
        binding,
        userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? "",
      },
    });
    // A brand-new session cookie on every sign-in (no session fixation).
    const next = safeNext(request.cookies.get(NEXT_COOKIE)?.value);
    const response = finish(
      result.mfaEnabled
        ? `/sign-in/verify${next ? `?next=${encodeURIComponent(next)}` : ""}`
        : (next ?? "/account"),
    );
    response.cookies.set(SESSION_COOKIE, result.token, cookieOptions(SESSION_MAX_AGE));
    return response;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    return finish(
      `/sign-in?error=${status === 400 ? "expired" : status === 403 ? "disabled" : "unavailable"}`,
    );
  }
}
