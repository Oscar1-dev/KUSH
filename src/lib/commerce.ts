// Shapes returned by the API's order, credit and referral routes, and labels.
// Prices and payment state always come from the API; never compute them here.

export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "partially_refunded";

export interface Payment {
  provider: "stripe" | "store_credit" | "offline";
  amountPence: number;
  refundedPence: number;
  receiptUrl: string | null;
  note: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  number: number;
  kind: "product" | "commission";
  description: string;
  status: OrderStatus;
  currency: string;
  subtotalPence: number;
  creditAppliedPence: number;
  totalPence: number;
  refundedPence: number;
  commissionId: string | null;
  paidAt: string | null;
  createdAt: string;
  payments?: Payment[];
  customerName?: string;
}

export interface CreditEntry {
  id: string;
  amountPence: number;
  kind: "reward" | "purchase" | "purchase_release" | "refund" | "adjustment";
  reference: string | null;
  note: string | null;
  balanceAfterPence: number;
  createdAt: string;
}

export interface ReferralSummary {
  linked: boolean;
  code?: string;
  qualified?: number;
  pending?: number;
  underReview?: number;
  disqualified?: number;
  rewards?: {
    milestone: number;
    type: string;
    valuePence: number | null;
    status: string;
    issuedAt: string | null;
  }[];
  milestones?: { count: number; label: string }[];
  next?: { count: number; label: string; remaining: number } | null;
  rules?: { minAccountAgeDays: number; minMembershipDays: number };
}

export interface CatalogueOffer {
  id: string;
  name: string;
  kind: "tier" | "addon";
  tierKey: string | null;
  description: string | null;
  includes: string[] | null;
  pricing: "fixed" | "from" | "range" | "quote";
  amountPence: number | null;
  maxPence: number | null;
  priceLabel: string;
  deliveryEstimate: string | null;
}

export interface CatalogueService {
  id: string;
  slug: string;
  category: string;
  name: string;
  summary: string;
  body: string | null;
  /** "partner_dependent": delivered with a vetted partner (customers are told). */
  fulfilment: string | null;
  startingPrice: string | null;
  offers: CatalogueOffer[];
}

export interface Product {
  slug: string;
  name: string;
  description: string;
  category: string | null;
  imageUrl: string | null;
  pricePence: number;
  currency: string;
}

export const money = (pence: number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);

export const orderLabel: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled",
  expired: "Checkout expired",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export const providerLabel: Record<Payment["provider"], string> = {
  stripe: "Card (Stripe)",
  store_credit: "Store credit",
  offline: "Recorded by KUSH",
};

export const creditLabel: Record<CreditEntry["kind"], string> = {
  reward: "Referral reward",
  purchase: "Used at checkout",
  purchase_release: "Returned (checkout not completed)",
  refund: "Refund",
  adjustment: "Adjustment by KUSH",
};
