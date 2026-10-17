import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { ApiError, kushApi } from "./kush-api";

/**
 * Cookies are HttpOnly (no JavaScript access) and SameSite=Lax (not sent on
 * cross-site POSTs). In production they are Secure with the `__Host-` prefix,
 * which also pins them to this exact host. Local http development cannot use
 * Secure cookies, so the prefix is dropped there.
 */
const secure =
  process.env.NODE_ENV === "production" ||
  process.env.KUSH_SECURE_COOKIES === "true";
const prefix = secure ? "__Host-" : "";
export const SESSION_COOKIE = `${prefix}kush_session`;
export const OAUTH_COOKIE = `${prefix}kush_oauth`;
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export interface Account {
  id: string;
  displayName: string | null;
  createdAt: string;
  discord: { id: string; username: string; avatar: string | null } | null;
  mfa: { enabled: boolean; recoveryCodesLeft: number };
  session: { id: string; mfaVerified: boolean };
}

export async function sessionToken() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

/** The signed-in account, checked against the API on every request. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const token = await sessionToken();
  if (!token) return null;
  try {
    return await kushApi<Account>("/web/account", { token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/**
 * Pages call this. Accounts with MFA must pass it on this session before
 * seeing anything else.
 */
export async function requireAccount(options: { allowUnverified?: boolean } = {}) {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");
  if (account.mfa.enabled && !account.session.mfaVerified && !options.allowUnverified)
    redirect("/sign-in/verify");
  return { account, token: (await sessionToken())! };
}

// ---------------------------------------------------------- rate limiting

const buckets = new Map<string, { start: number; count: number }>();

/** The visitor's address. Proxy headers are only trusted when configured. */
export async function visitorKey() {
  const list = await headers();
  // Without a trusted proxy every visitor shares one bucket (local dev).
  if (process.env.KUSH_TRUST_PROXY === "true") {
    const forwarded =
      list.get("cf-connecting-ip") ??
      list.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "direct";
}

/** Fixed-window, in-memory. Enough for one website server. */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000)
    for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/**
 * Absolute URL on the public site. Redirects must use the configured public
 * origin: behind a proxy (or even locally, where Next reports `localhost` for
 * `127.0.0.1`) the request URL can name a different host, and cookies set
 * for one host are not sent to another.
 */
export function siteUrl(path: string) {
  const origin = process.env.KUSH_SITE_URL;
  if (!origin) throw new Error("KUSH_SITE_URL is not configured");
  return new URL(path, origin);
}
