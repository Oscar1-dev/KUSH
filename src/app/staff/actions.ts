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

// ------------------------------------------------------------- recruitment

export async function staffApplicationStatus(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  const note = text(form, "note");
  return call(
    `/web/staff/applications/${appId}/status`,
    { expectedVersion: version(form), status: text(form, "status"), ...(note ? { note } : {}) },
    `/staff/applications/${appId}`,
    "Status updated. The applicant has been notified.",
  );
}

export async function staffApplicationMessage(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  const kind = form.get("kind") === "note" ? "note" : "message";
  return call(
    `/web/staff/applications/${appId}/messages`,
    { requestId: text(form, "requestId"), kind, content: text(form, "content") },
    `/staff/applications/${appId}`,
    kind === "note" ? "Internal note added." : "Message sent to the applicant.",
  );
}

export async function staffApplicationNote(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  return call(
    `/web/staff/applications/${appId}/review-note`,
    { reviewNote: text(form, "reviewNote") || null },
    `/staff/applications/${appId}`,
    "Review note saved.",
  );
}

export async function staffIssueNda(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  return call(`/web/staff/applications/${appId}/issue-nda`, { expectedVersion: version(form) }, `/staff/applications/${appId}`, "NDA issued. The applicant has been sent a secure link.");
}

export async function staffApproveApplication(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  if (form.get("confirm") !== "yes") return { error: "Confirm you have verified the applicant's identity." };
  const note = text(form, "note");
  return call(
    `/web/staff/applications/${appId}/approve`,
    { expectedVersion: version(form), staffRole: text(form, "staffRole"), ...(note ? { note } : {}) },
    `/staff/applications/${appId}`,
    "Identity and role approved.",
  );
}

export async function staffActivateApplication(_p: ActionState, form: FormData) {
  const appId = id(form, "applicationId");
  if (!appId) return { error: "Application not found." };
  if (form.get("confirm") !== "yes") return { error: "Confirm the activation." };
  return call(`/web/staff/applications/${appId}/activate`, { expectedVersion: version(form) }, `/staff/applications/${appId}`, "Activated. The bot is granting the Discord role.");
}

export async function staffTemplateStatus(_p: ActionState, form: FormData) {
  const templateId = id(form, "templateId");
  if (!templateId) return { error: "Template not found." };
  const status = text(form, "status") === "retired" ? "retired" : "active";
  if (status === "active" && form.get("confirm") !== "yes")
    return { error: "Confirm you have reviewed this text and approve it for signing." };
  return call(`/web/staff/agreement-templates/${templateId}/status`, { status }, "/staff/agreements", status === "active" ? "This version can now be issued." : "Version retired.");
}

export async function staffRetryJob(_p: ActionState, form: FormData) {
  const jobId = id(form, "jobId");
  if (!jobId) return { error: "Job not found." };
  return call(`/web/staff/operations/jobs/${jobId}/retry`, {}, "/staff/operations", "Queued for another attempt.");
}

// ------------------------------------------------------ commission workflow

export async function staffProposeQuote(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  if (!requestId) return { error: "Commission not found." };
  const amountPence = pence(text(form, "price"));
  if (!amountPence) return { error: "Enter the price in pounds, e.g. 120 or 120.50." };
  const revisions = text(form, "revisions");
  const expires = text(form, "expiresInDays");
  return call(
    `/web/staff/commissions/${requestId}/quotes`,
    {
      amount: pounds(amountPence),
      amountPence,
      summary: text(form, "summary"),
      timeframe: text(form, "timeframe") || null,
      deliverables: text(form, "deliverables") || null,
      revisions: revisions ? Number(revisions) : null,
      optionalServices: text(form, "optionalServices") || null,
      expiresInDays: expires ? Number(expires) : null,
    },
    `/staff/commissions/${requestId}`,
    "Quote sent. The customer can accept and pay it from their account.",
  );
}

/** "120", "£120.50" → pence; null if it isn't a price. */
function pence(value: string) {
  const match = /^£?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0")) : null;
}
const pounds = (p: number) => `£${(p / 100).toFixed(p % 100 === 0 ? 0 : 2)}`;

export async function staffOfflinePayment(_p: ActionState, form: FormData) {
  const commissionId = id(form, "commissionId");
  const quoteId = id(form, "quoteId");
  const requestId = id(form, "requestId");
  if (!commissionId || !quoteId || !requestId) return { error: "Quote not found." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm the money has actually arrived." };
  const amountPence = pence(text(form, "price"));
  if (!amountPence) return { error: "Enter the amount received, e.g. 120." };
  return call(
    `/web/staff/commissions/${commissionId}/quotes/${quoteId}/offline-payment`,
    { amountPence, note: text(form, "note"), requestId },
    `/staff/commissions/${commissionId}`,
    "Payment recorded. The commission is now paid.",
  );
}

export async function staffRefund(_p: ActionState, form: FormData) {
  const orderId = id(form, "orderId");
  const requestId = id(form, "requestId");
  if (!orderId || !requestId) return { error: "Order not found." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm the refund." };
  const amountPence = pence(text(form, "price"));
  if (!amountPence) return { error: "Enter the amount to refund, e.g. 15 or 7.50." };
  return call(
    `/web/staff/orders/${orderId}/refund`,
    { amountPence, reason: text(form, "reason"), requestId },
    `/staff/orders/${orderId}`,
    "Refund sent.",
  );
}

export async function staffSaveProduct(_p: ActionState, form: FormData) {
  const productId = text(form, "productId");
  const pricePence = pence(text(form, "price"));
  if (!pricePence) return { error: "Enter the price in pounds, e.g. 15." };
  const body = {
    name: text(form, "name"),
    description: text(form, "description"),
    category: text(form, "category") || null,
    imageUrl: text(form, "imageUrl") || null,
    pricePence,
    visibility: text(form, "visibility") || "public",
    status: text(form, "status") || "draft",
    rewardEligible: form.get("rewardEligible") === "yes",
  };
  if (productId) {
    if (!/^[0-9a-f-]{36}$/.test(productId)) return { error: "Product not found." };
    return call(`/web/staff/products/${productId}`, body, "/staff/products", "Product saved.");
  }
  return call("/web/staff/products", { ...body, slug: text(form, "slug").toLowerCase() }, "/staff/products", "Product created.");
}

export async function staffSaveOffer(_p: ActionState, form: FormData) {
  const offerId = id(form, "offerId");
  if (!offerId) return { error: "Price not found." };
  const pricing = text(form, "pricing");
  const amount = text(form, "price");
  const max = text(form, "max");
  const amountPence = pricing === "quote" ? null : pence(amount);
  if (pricing !== "quote" && !amountPence) return { error: "Enter a price, or choose “Quoted individually”." };
  return call(
    `/web/staff/catalogue/offers/${offerId}`,
    {
      pricing,
      amountPence,
      maxPence: pricing === "range" ? pence(max) : null,
      status: text(form, "status"),
    },
    "/staff/catalogue",
    "Price saved. The website updates within a minute.",
  );
}

export async function staffReviewReferral(_p: ActionState, form: FormData) {
  const referralId = id(form, "referralId");
  if (!referralId) return { error: "Referral not found." };
  const decision = text(form, "decision") === "approve" ? "approve" : "disqualify";
  return call(
    `/web/staff/referrals/${referralId}/review`,
    { decision, reason: text(form, "reason") },
    "/staff/referrals",
    decision === "approve" ? "Approved: it counts once the membership rules are met." : "Referral disqualified.",
  );
}

export async function staffRedeemReward(_p: ActionState, form: FormData) {
  const rewardId = id(form, "rewardId");
  if (!rewardId) return { error: "Reward not found." };
  return call(
    `/web/staff/referrals/rewards/${rewardId}/redeem`,
    { note: text(form, "note") },
    "/staff/referrals",
    "Reward marked as delivered.",
  );
}

export async function staffWithdrawQuote(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  const quoteId = id(form, "quoteId");
  if (!requestId || !quoteId) return { error: "Quote not found." };
  return call(`/web/staff/commissions/${requestId}/quotes/${quoteId}/withdraw`, {}, `/staff/commissions/${requestId}`, "Quote withdrawn.");
}

export async function staffAddMilestone(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  if (!requestId) return { error: "Commission not found." };
  return call(`/web/staff/commissions/${requestId}/milestones`, { title: text(form, "title") }, `/staff/commissions/${requestId}`, "Milestone added.");
}

export async function staffSetMilestone(_p: ActionState, form: FormData) {
  const requestId = id(form, "requestId");
  const milestoneId = id(form, "milestoneId");
  if (!requestId || !milestoneId) return { error: "Milestone not found." };
  return call(
    `/web/staff/commissions/${requestId}/milestones/${milestoneId}`,
    { status: text(form, "status") },
    `/staff/commissions/${requestId}`,
    "Milestone updated.",
  );
}

// ------------------------------------------------- Discord parity actions

export async function staffHideVouch(_p: ActionState, form: FormData) {
  const number = Number(form.get("number"));
  if (!Number.isInteger(number) || number < 1) return { error: "Vouch not found." };
  return call(`/web/staff/vouches/${number}/hide`, {}, "/staff/moderation", `Vouch #${number} removed. The bot is deleting it from Discord.`);
}

export async function staffOffboard(_p: ActionState, form: FormData) {
  const userId = id(form, "userId");
  const reason = text(form, "reason");
  if (!userId) return { error: "Team member not found." };
  if (reason.length < 3) return { error: "Add a short reason; it's kept on their record." };
  return call(
    `/web/staff/team/${userId}/offboard`,
    { reason },
    "/staff/team",
    "Offboarded. The bot is removing their Discord roles and letting them know.",
  );
}
