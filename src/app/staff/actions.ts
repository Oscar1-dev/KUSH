"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/account/actions";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { allow, sessionToken, visitorKey } from "@/lib/server/session";

/*
 * Staff actions only forward to the API. The API re-checks live Discord
 * roles, 2FA and the specific permission on every call; nothing here grants
 * or assumes access.
 */

const id = (form: FormData, name: string) => {
  const value = String(form.get(name) ?? "");
  return /^[0-9a-f-]{36}$/.test(value) ? value : null;
};
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const version = (form: FormData) => Number(form.get("expectedVersion"));

async function call(path: string, body: unknown, revalidate: string, success: string): Promise<ActionState> {
  const token = await sessionToken();
  if (!token) redirect("/sign-in?next=/staff");
  if (!allow(`staff:${await visitorKey()}`, 60, 60_000)) return { error: "Slow down a little and try again." };
  try {
    await kushApi(path, { method: "POST", token, body });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) redirect("/sign-in?next=/staff");
    if (error.reason === "mfa_required" || /Two-factor verification/.test(error.message))
      redirect("/sign-in/verify?next=/staff");
    if (error.status === 409) return { error: `${error.message}. Refresh to see the latest.` };
    return { error: error.message };
  }
  revalidatePath(revalidate);
  return { success };
}

export async function staffMessage(_p: ActionState, form: FormData) {
  const ticketId = id(form, "ticketId");
  if (!ticketId) return { error: "Ticket not found." };
  const kind = form.get("kind") === "note" ? "note" : "reply";
  return call(
    `/web/staff/tickets/${ticketId}/messages`,
    { requestId: text(form, "requestId"), expectedVersion: version(form), kind, content: text(form, "content") },
    `/staff/tickets/${ticketId}`,
    kind === "note" ? "Internal note added." : "Reply sent to the customer.",
  );
}

export async function staffTicketStatus(_p: ActionState, form: FormData) {
  const ticketId = id(form, "ticketId");
  if (!ticketId) return { error: "Ticket not found." };
  const reason = text(form, "reason");
  return call(
    `/web/staff/tickets/${ticketId}/status`,
    { expectedVersion: version(form), status: text(form, "status"), ...(reason ? { reason } : {}) },
    `/staff/tickets/${ticketId}`,
    "Status updated.",
  );
}

export async function staffClaim(_p: ActionState, form: FormData) {
  const ticketId = id(form, "ticketId");
  if (!ticketId) return { error: "Ticket not found." };
  return call(`/web/staff/tickets/${ticketId}/claim`, { expectedVersion: version(form) }, `/staff/tickets/${ticketId}`, "Ticket claimed. It's yours.");
}

export async function staffAssignTicket(_p: ActionState, form: FormData) {
  const ticketId = id(form, "ticketId");
  if (!ticketId) return { error: "Ticket not found." };
  return call(
    `/web/staff/tickets/${ticketId}/assign`,
    { expectedVersion: version(form), userId: id(form, "userId") },
    `/staff/tickets/${ticketId}`,
    "Assignment updated.",
  );
}

export async function staffCommissionUpdate(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  if (!requestId) return { error: "Commission not found." };
  const status = text(form, "status");
  const body: Record<string, unknown> = { expectedVersion: version(form) };
  if (status) body.status = status;
  if (form.has("reviewNote")) body.reviewNote = text(form, "reviewNote") || null;
  return call(`/web/staff/commissions/${requestId}`, body, `/staff/commissions/${requestId}`, "Commission updated.");
}

export async function staffAssignCommission(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  if (!requestId) return { error: "Commission not found." };
  return call(
    `/web/staff/commissions/${requestId}/assign`,
    { expectedVersion: version(form), userId: id(form, "userId") },
    `/staff/commissions/${requestId}`,
    "Assignment updated.",
  );
}
