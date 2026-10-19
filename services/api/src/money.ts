/** Money is integer minor units (pence). Never floats. */

export const formatMoney = (pence: number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);

/** Parses "12", "12.5" or "12.50" (pounds) into pence; null if invalid. */
export const parsePounds = (value: string): number | null => {
  const match = /^\s*£?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
};

export interface Priced {
  pricing: "fixed" | "from" | "range" | "quote";
  amountPence: number | null;
  maxPence: number | null;
  currency: string;
}

/** Human price label: "£40", "from £40", "£300–£700", "Quoted individually". */
export const priceLabel = (offer: Priced) => {
  if (offer.pricing === "quote" || offer.amountPence === null)
    return "Quoted individually";
  const amount = formatMoney(offer.amountPence, offer.currency);
  if (offer.pricing === "fixed") return amount;
  if (offer.pricing === "from") return `from ${amount}`;
  return `${amount}–${formatMoney(offer.maxPence ?? offer.amountPence, offer.currency)}`;
};
