"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Order } from "@/lib/commerce";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { allow, sessionToken, visitorKey } from "@/lib/server/session";

import type { ActionState } from "./actions";

/*
 * Payments. The website never sees card details or decides a price: it asks
 * the API for a Stripe Checkout session and sends the browser there. Each
 * form carries a requestId from when the page rendered, so a double-click
 * reuses one order instead of creating two.
 */

const UUID = /^[0-9a-f-]{36}$/;

/** Only ever send people to Stripe's own checkout pages. */
const STRIPE_CHECKOUT = /^https:\/\/checkout\.stripe\.com\//;

async function token() {
  const value = await sessionToken();
  if (!value) redirect("/sign-in");
  return value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function failure(error: unknown): ActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/sign-in");
    if (error.status === 403 && /Two-factor/.test(error.message)) redirect("/sign-in/verify");
    if (error.status === 400) return { error: "Please check the form and try again." };
    return { error: error.message };
  }
  throw error;
}

async function limited() {
  return !allow(`checkout:${await visitorKey()}`, 10, 60_000);
}

/** Sends the browser to Stripe, or to the order if credit covered it all. */
function finish(result: { order: Order; checkoutUrl: string | null }): never {
  if (result.checkoutUrl) {
    if (!STRIPE_CHECKOUT.test(result.checkoutUrl)) throw new Error("Unexpected checkout address");
    redirect(result.checkoutUrl);
  }
  redirect(`/account/orders/${result.order.id}${result.order.status === "paid" ? "?checkout=success" : ""}`);
}

export async function payQuote(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many attempts. Wait a minute and try again." };
  const commissionId = text(form, "commissionId");
  const quoteId = text(form, "quoteId");
  const requestId = text(form, "requestId");
  if (![commissionId, quoteId, requestId].every((id) => UUID.test(id))) return { error: "Quote not found." };
  let result: { order: Order; checkoutUrl: string | null };
  try {
    result = await kushApi(`/web/workspace/commissions/${commissionId}/quotes/${quoteId}/checkout`, {
      method: "POST",
      token: await token(),
      body: { requestId, useCredit: form.get("useCredit") === "yes" },
    });
  } catch (error) {
    return failure(error);
  }
  finish(result);
}

export async function buyProduct(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many attempts. Wait a minute and try again." };
  const productSlug = text(form, "productSlug");
  const requestId = text(form, "requestId");
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(productSlug) || !UUID.test(requestId)) return { error: "Product not found." };
  let result: { order: Order; checkoutUrl: string | null };
  try {
    result = await kushApi("/web/workspace/checkout/product", {
      method: "POST",
      token: await token(),
      body: { productSlug, requestId, useCredit: form.get("useCredit") !== "no" },
    });
  } catch (error) {
    return failure(error);
  }
  finish(result);
}

export async function resumeOrder(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (await limited()) return { error: "Too many attempts. Wait a minute and try again." };
  const orderId = text(form, "orderId");
  if (!UUID.test(orderId)) return { error: "Order not found." };
  let checkoutUrl: string;
  try {
    ({ checkoutUrl } = await kushApi<{ checkoutUrl: string }>(`/web/workspace/orders/${orderId}/resume`, {
      method: "POST",
      token: await token(),
    }));
  } catch (error) {
    return failure(error);
  }
  if (!STRIPE_CHECKOUT.test(checkoutUrl)) throw new Error("Unexpected checkout address");
  redirect(checkoutUrl);
}

export async function requestRevision(_previous: ActionState, form: FormData): Promise<ActionState> {
  const commissionId = text(form, "commissionId");
  if (!UUID.test(commissionId)) return { error: "Commission not found." };
  try {
    await kushApi(`/web/workspace/commissions/${commissionId}/revision`, { method: "POST", token: await token() });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/account/commissions/${commissionId}`);
  return { success: "Revision requested. Tell the team what to change in the conversation below." };
}
