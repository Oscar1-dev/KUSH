"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, kushApi } from "@/lib/server/kush-api";
import { allow, sessionToken, visitorKey } from "@/lib/server/session";
import type { Commission, Ticket } from "@/lib/workspace";

import type { ActionState } from "./actions";

/*
 * Commission and ticket actions. Each form carries a requestId generated
 * when the page rendered, so a double-click or retry creates one record,
 * not two (the API is idempotent on it).
 */

async function token() {
  const value = await sessionToken();
  if (!value) redirect("/sign-in");
  return value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name) || null;

function failure(error: unknown): ActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/sign-in");
    if (error.status === 403 && /Two-factor/.test(error.message)) redirect("/sign-in/verify");
    if (error.status === 400) return { error: "Please check the form and try again." };
    if (error.status === 409)
      return { error: "This was updated in the meantime. Refresh the page and try again." };
    return { error: error.message };
  }
  throw error;
}

async function limited() {
  return !allow(`workspace:${await visitorKey()}`, 20, 60_000);
}

export async function createCommission(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many requests. Wait a minute and try again." };
  let created: Commission;
  try {
    created = (
      await kushApi<{ commission: Commission }>("/web/workspace/commissions", {
        method: "POST",
        token: await token(),
        body: {
          requestId: text(form, "requestId"),
          category: text(form, "category"),
          title: text(form, "title"),
          details: text(form, "details"),
          approximateBudget: optional(form, "approximateBudget"),
          preferredTimeframe: optional(form, "preferredTimeframe"),
        },
      })
    ).commission;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/account/commissions");
  redirect(`/account/commissions/${created.id}?new=1`);
}

export async function createTicket(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many requests. Wait a minute and try again." };
  let created: Ticket;
  try {
    created = (
      await kushApi<{ ticket: Ticket }>("/web/workspace/tickets", {
        method: "POST",
        token: await token(),
        body: {
          requestId: text(form, "requestId"),
          category: text(form, "category"),
          description: text(form, "description"),
        },
      })
    ).ticket;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/account/support");
  redirect(`/account/support/${created.id}?new=1`);
}

export async function replyToTicket(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many requests. Wait a minute and try again." };
  const ticketId = text(form, "ticketId");
  if (!/^[0-9a-f-]{36}$/.test(ticketId)) return { error: "Ticket not found." };
  try {
    await kushApi(`/web/workspace/tickets/${ticketId}/replies`, {
      method: "POST",
      token: await token(),
      body: {
        requestId: text(form, "requestId"),
        expectedVersion: Number(form.get("expectedVersion")),
        content: text(form, "content"),
      },
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/account/support/${ticketId}`);
  return { success: "Reply sent." };
}
