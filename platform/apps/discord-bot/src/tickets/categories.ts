/**
 * Canonical ticket categories. Keys must match the support tenant's
 * configured category keys (the API rejects unknown keys).
 * `queue: "reports"` tickets are routed to the REPORTS category, which
 * support staff cannot see.
 */
export const ticketCategories = [
  {
    key: "general-support",
    label: "General support",
    queue: "support",
    emoji: "💬",
    style: "primary",
  },
  {
    key: "purchase",
    label: "Purchase assistance",
    queue: "support",
    emoji: "🛒",
    style: "success",
  },
  {
    key: "installation",
    label: "Installation help",
    queue: "support",
    emoji: "🧩",
    style: "primary",
  },
  {
    key: "technical",
    label: "Technical issue",
    queue: "support",
    emoji: "🔧",
    style: "secondary",
  },
  {
    key: "product-bug",
    label: "Product bug",
    queue: "support",
    emoji: "🐞",
    style: "danger",
  },
  {
    key: "billing",
    label: "Billing",
    queue: "support",
    emoji: "💳",
    style: "success",
  },
  {
    key: "commission",
    label: "Commission enquiry",
    queue: "support",
    emoji: "✏️",
    style: "primary",
  },
  {
    key: "partnership",
    label: "Partnership enquiry",
    queue: "support",
    emoji: "🤝",
    style: "secondary",
  },
  {
    key: "seller-application",
    label: "Seller application",
    queue: "support",
    emoji: "🏪",
    style: "secondary",
  },
  {
    key: "member-report",
    label: "Member report",
    queue: "reports",
    emoji: "🚩",
    style: "danger",
  },
  {
    key: "other",
    label: "Other",
    queue: "support",
    emoji: "📝",
    style: "secondary",
  },
] as const;

export type TicketCategoryKey = (typeof ticketCategories)[number]["key"];

export const ticketCategory = (key: string) =>
  ticketCategories.find((category) => category.key === key);
