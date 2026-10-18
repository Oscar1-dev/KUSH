// Shapes returned by the API's /web/workspace routes, and display labels.

export interface Commission {
  id: string;
  kind: "commission";
  status: CommissionStatus;
  title: string;
  details: string;
  category: string;
  approximateBudget: string | null;
  preferredTimeframe: string | null;
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
  | "in_progress"
  | "awaiting_review"
  | "completed"
  | "cancelled";

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

export const commissionCategories = [
  { key: "website", label: "Website" },
  { key: "software", label: "Software" },
  { key: "creative", label: "Creative" },
] as const;

/** The commission journey, in order, as customers see it. */
export const commissionStages: { status: CommissionStatus; label: string; text: string }[] = [
  { status: "submitted", label: "Enquiry received", text: "We have your brief." },
  { status: "reviewing", label: "Under review", text: "The team is scoping your project." },
  { status: "quoted", label: "Quote ready", text: "Review the quote we've sent you." },
  { status: "accepted", label: "Accepted", text: "Work is scheduled." },
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
  in_progress: "In progress",
  awaiting_review: "Ready for your review",
  completed: "Delivered",
  cancelled: "Cancelled",
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
  ["awaiting_customer", "quoted", "awaiting_review", "waiting_for_customer"].includes(status);

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
