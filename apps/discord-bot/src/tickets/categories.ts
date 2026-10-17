/**
 * Canonical ticket categories. Keys must match the support tenant's
 * configured category keys (the API rejects unknown keys).
 * `queue: "reports"` tickets are routed to the REPORTS category, which
 * support staff cannot see.
 */
export const ticketCategories = [
  { key: "general-support", label: "General support", queue: "support" },
  { key: "purchase", label: "Purchase assistance", queue: "support" },
  { key: "installation", label: "Installation help", queue: "support" },
  { key: "technical", label: "Technical issue", queue: "support" },
  { key: "product-bug", label: "Product bug", queue: "support" },
  { key: "billing", label: "Billing", queue: "support" },
  { key: "commission", label: "Commission enquiry", queue: "support" },
  { key: "partnership", label: "Partnership enquiry", queue: "support" },
  { key: "seller-application", label: "Seller application", queue: "support" },
  { key: "member-report", label: "Member report", queue: "reports" },
  { key: "other", label: "Other", queue: "support" },
] as const;

export type TicketCategoryKey = (typeof ticketCategories)[number]["key"];

export const ticketCategory = (key: string) =>
  ticketCategories.find((category) => category.key === key);
