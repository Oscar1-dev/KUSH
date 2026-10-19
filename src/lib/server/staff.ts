import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ApiError, kushApi } from "./kush-api";
import { sessionToken } from "./session";

export type StaffRole = "support" | "developer" | "moderator" | "manager" | "administrator" | "owner";
export type Permission =
  | "tickets.assigned"
  | "tickets.queue"
  | "tickets.all"
  | "tickets.billing"
  | "tickets.assign"
  | "reports.handle"
  | "commissions.assigned"
  | "commissions.all"
  | "commissions.manage"
  | "commissions.assign"
  | "team.view"
  | "audit.view"
  | "applications.review"
  | "applications.decide"
  | "agreements.manage"
  | "customers.view"
  | "operations.view"
  | "moderation.view"
  | "vouches.manage"
  | "team.offboard"
  | "catalogue.manage"
  | "products.manage"
  | "orders.view"
  | "payments.manage"
  | "refunds.manage"
  | "credit.adjust"
  | "referrals.review"
  | "stats.view";

export interface StaffMe {
  roles: StaffRole[];
  permissions: Permission[];
  overview: {
    assignedTickets: number;
    queuedTickets: number;
    openReports: number;
    activeCommissions: number;
  };
}

export type StaffGate =
  | { ok: true; me: StaffMe; token: string }
  | { ok: false; reason: "not_staff" | "not_linked" | "mfa_setup_required" | "discord_unavailable" | "error"; message: string };

/**
 * Asks the API, which checks live Discord roles and 2FA, whether this
 * session is staff. The website never decides this itself; the role and
 * permission lists it gets back are only used to choose what to display.
 */
export const staffGate = cache(async (): Promise<StaffGate> => {
  const token = await sessionToken();
  if (!token) redirect("/sign-in?next=/staff");
  try {
    return { ok: true, me: await kushApi<StaffMe>("/web/staff/me", { token }), token };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) redirect("/sign-in?next=/staff");
    // 2FA not yet passed on this session, or passed too long ago for staff.
    if (error.reason === "mfa_required" || /Two-factor verification/.test(error.message))
      redirect("/sign-in/verify?next=/staff");
    const reason =
      error.reason === "not_staff" ||
      error.reason === "not_linked" ||
      error.reason === "mfa_setup_required" ||
      error.reason === "discord_unavailable"
        ? error.reason
        : "error";
    return { ok: false, reason, message: error.message };
  }
});

/**
 * For staff pages. When access is refused the layout shows why, so pages
 * simply render nothing (returns null).
 */
export async function requireStaff() {
  const gate = await staffGate();
  return gate.ok ? gate : null;
}

export const has = (me: StaffMe, permission: Permission) => me.permissions.includes(permission);

export const roleLabel: Record<StaffRole, string> = {
  support: "Support",
  developer: "Developer",
  moderator: "Moderator",
  manager: "Manager",
  administrator: "Administrator",
  owner: "Owner",
};
