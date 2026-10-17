"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { ApiError, kushApi } from "@/lib/server/kush-api";
import {
  SESSION_COOKIE,
  allow,
  cookieOptions,
  safeNext,
  sessionToken,
  visitorKey,
} from "@/lib/server/session";

/*
 * Server actions. Next.js rejects actions whose Origin does not match this
 * host, and the session cookie is SameSite=Lax, which together stop CSRF.
 * Every action re-authenticates with the API; nothing here trusts the form.
 */

export type ActionState = {
  error?: string;
  success?: string;
  recoveryCodes?: string[];
  setup?: { secret: string; qr: string };
};

async function token() {
  const value = await sessionToken();
  if (!value) redirect("/sign-in");
  return value;
}

async function attempt(work: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/sign-in");
      return { error: error.message };
    }
    // redirect() throws; let Next handle it.
    throw error;
  }
}

const sixDigits = (value: FormDataEntryValue | null) =>
  String(value ?? "").replace(/\s+/g, "");

async function throttled() {
  return !allow(`mfa:${await visitorKey()}`, 10, 5 * 60_000);
}

export async function signOut(scope: "this" | "others" | "all") {
  const session = await token();
  await kushApi("/web/account/logout", {
    method: "POST",
    token: session,
    body: { scope },
  }).catch(() => undefined);
  if (scope === "others") {
    revalidatePath("/account/sessions");
    return;
  }
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
  redirect("/sign-in?signed-out=1");
}

export async function revokeSession(sessionId: string) {
  const session = await token();
  await kushApi(`/web/account/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: "POST",
    token: session,
  }).catch(() => undefined);
  revalidatePath("/account/sessions");
}

export async function updateDisplayName(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = String(form.get("displayName") ?? "").trim();
  return attempt(async () => {
    await kushApi("/web/account", {
      method: "PATCH",
      token: await token(),
      body: { displayName: name === "" ? null : name },
    });
    revalidatePath("/account", "layout");
    return { success: "Saved." };
  });
}

export async function beginTotp(): Promise<ActionState> {
  return attempt(async () => {
    const { secret, otpauthUrl } = await kushApi<{ secret: string; otpauthUrl: string }>(
      "/web/account/mfa/totp/setup",
      { method: "POST", token: await token() },
    );
    const qr = await QRCode.toDataURL(otpauthUrl, {
      margin: 0,
      width: 384,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0b0d", light: "#efede6" },
    });
    return { setup: { secret, qr } };
  });
}

export async function enableTotp(
  previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (await throttled()) return { ...previous, error: "Too many attempts. Wait a few minutes." };
  const code = sixDigits(form.get("code"));
  return attempt(async () => {
    try {
      const { recoveryCodes } = await kushApi<{ recoveryCodes: string[] }>(
        "/web/account/mfa/totp/enable",
        { method: "POST", token: await token(), body: { code } },
      );
      // No revalidation here: that would re-render the page as "2FA on" and
      // hide the recovery codes before they are saved. The panel refreshes
      // when the visitor presses Done.
      return { recoveryCodes, success: "Two-factor authentication is on." };
    } catch (error) {
      // Keep the QR code on screen so the visitor can try again.
      if (error instanceof ApiError && error.status !== 401)
        return { ...previous, error: error.message };
      throw error;
    }
  });
}

export async function verifyMfa(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (await throttled()) return { error: "Too many attempts. Wait a few minutes." };
  const raw = String(form.get("code") ?? "").trim();
  const body = /^[0-9\s]{6,8}$/.test(raw)
    ? { code: raw.replace(/\s+/g, "") }
    : { recoveryCode: raw.toUpperCase() };
  const result = await attempt(async () => {
    await kushApi("/web/account/mfa/verify", {
      method: "POST",
      token: await token(),
      body,
    });
    return { success: "verified" };
  });
  if (result.success) redirect(safeNext(String(form.get("next") ?? "")) ?? "/account");
  return result;
}

export async function disableTotp(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (await throttled()) return { error: "Too many attempts. Wait a few minutes." };
  return attempt(async () => {
    await kushApi("/web/account/mfa/totp/disable", {
      method: "POST",
      token: await token(),
      body: { code: sixDigits(form.get("code")) },
    });
    revalidatePath("/account", "layout");
    return { success: "Two-factor authentication is off. Other devices were signed out." };
  });
}

export async function regenerateRecoveryCodes(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (await throttled()) return { error: "Too many attempts. Wait a few minutes." };
  return attempt(async () => {
    const { recoveryCodes } = await kushApi<{ recoveryCodes: string[] }>(
      "/web/account/mfa/recovery-codes",
      { method: "POST", token: await token(), body: { code: sixDigits(form.get("code")) } },
    );
    return { recoveryCodes, success: "New recovery codes created. The old ones no longer work." };
  });
}
