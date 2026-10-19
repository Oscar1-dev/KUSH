// Shapes returned by the API's /web/workspace routes, and display labels.

import { services } from "./site-content";

export interface Commission {
  id: string;
  kind: "commission";
  status: CommissionStatus;
  title: string;
  details: string;
  category: string;
  approximateBudget: string | null;
  preferredTimeframe: string | null;
  serviceTier: "starter" | "standard" | "premium" | null;
  referenceLinks: string | null;
  contactPreference: string | null;
  origin: "website" | "discord";
  assigned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CommissionStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_customer"
  | "quoted"
  | "accepted"
  | "payment_pending"
  | "paid"
  | "in_progress"
  | "awaiting_review"
  | "revision_requested"
  | "completed"
  | "cancelled"
  | "refunded";

export interface Ticket {
  id: string;
  number: number;
  category: string;
  status: TicketStatus;
  priority: string;
  description: string;
  closureReason: string | null;
  assigned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export type TicketStatus =
  | "open"
  | "pending"
  | "in_progress"
  | "waiting_for_customer"
  | "resolved"
  | "closed"
  | "reopened";

export interface TicketMessage {
  id: string;
  kind: "reply";
  content: string;
  createdAt: string;
  fromYou: boolean;
}

/**
 * Commission categories when the live catalogue can't be read (the API's
 * catalogue is the source of truth; see lib/server/catalogue.ts).
 */
export const commissionCategories = services.map((service) => ({ key: service.slug, label: service.name }));

/** Label for any category, including ones from before the catalogue. */
export const categoryLabel = (key: string) =>
  commissionCategories.find((c) => c.key === key)?.label ??
  ({ website: "Website", software: "Software", creative: "Creative" } as Record<string, string>)[key] ??
  key;

/** The commission journey, in order, as customers see it. */
export const commissionStages: { status: CommissionStatus; label: string; text: string }[] = [
  { status: "submitted", label: "Enquiry received", text: "We have your brief." },
  { status: "reviewing", label: "Under review", text: "The team is scoping your project." },
  { status: "quoted", label: "Quote ready", text: "Review the quote we've sent you." },
  {
    status: "payment_pending",
    label: "Payment",
    text: "Quote accepted. Pay securely with Stripe to book your slot; work starts once it's paid.",
  },
  { status: "paid", label: "Paid", text: "Payment received. Your project is in the queue." },
  { status: "in_progress", label: "In progress", text: "We're building it." },
  { status: "awaiting_review", label: "Ready for your review", text: "Check the work and tell us what you think." },
  { status: "completed", label: "Delivered", text: "All done." },
];

export const commissionLabel: Record<CommissionStatus, string> = {
  submitted: "Enquiry received",
  reviewing: "Under review",
  awaiting_customer: "Waiting for you",
  quoted: "Quote ready",
  accepted: "Accepted",
  payment_pending: "Awaiting payment",
  paid: "Paid",
  in_progress: "In progress",
  awaiting_review: "Ready for your review",
  revision_requested: "Revision requested",
  completed: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const ticketLabel: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  in_progress: "In progress",
  waiting_for_customer: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

/** Statuses that need the customer to act. */
export const needsYou = (status: string) =>
  ["awaiting_customer", "quoted", "payment_pending", "awaiting_review", "waiting_for_customer"].includes(status);

export const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
export const dateOnly = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export interface Quote {
  id: string;
  amount: string;
  summary: string;
  timeframe: string | null;
  status: "proposed" | "accepted" | "declined" | "withdrawn";
  createdAt: string;
  decidedAt: string | null;
  declineReason: string | null;
  /** What the customer pays through Stripe, when the quote is payable. */
  amountPence: number | null;
  deliverables: string | null;
  revisions: number | null;
  optionalServices: string | null;
  expiresAt: string | null;
  expired: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "done";
  position: number;
  updatedAt: string;
}

export const milestoneLabel: Record<Milestone["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};
