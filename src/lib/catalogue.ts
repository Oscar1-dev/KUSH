// Maps the API's catalogue into the website's Service shape. The API is the
// source of truth for services and prices; catalogue-fallback.json is the
// same data (generated from the API's seed) for when the API can't be read.

import type { CatalogueOffer, CatalogueService } from "./commerce";
import fallback from "./catalogue-fallback.json";
import type { Service, Tier, TierKey } from "./site-content";

interface Body {
  headline?: [string, string];
  intro?: string;
  offerings?: { title: string; text: string }[];
  deliverables?: string[];
  goodFit?: string[];
  availability?: { now: string[]; partner: string[] };
  faqs?: { q: string; a: string }[];
}

const amount = (label: string) => label.replace(/^from /, "");

function tierOf(offer: CatalogueOffer): Tier {
  const base = {
    key: (offer.tierKey ?? "standard") as TierKey,
    name: offer.name,
    forWhat: offer.description ?? "",
    includes: offer.includes ?? [],
  };
  if (offer.pricing === "quote" || offer.amountPence === null)
    return { ...base, from: null, quote: "Quoted individually" };
  if (offer.pricing === "range")
    return { ...base, from: amount(offer.priceLabel.split("–")[0]!), quote: `Usually ${offer.priceLabel}` };
  return { ...base, from: amount(offer.priceLabel) };
}

export function toService(service: CatalogueService, index: number): Service {
  const body = (service.body ?? {}) as Body;
  const tiers = service.offers.filter((offer) => offer.kind === "tier").map(tierOf);
  return {
    slug: service.slug,
    index: String(index + 1).padStart(2, "0"),
    name: service.name,
    summary: service.summary,
    headline: body.headline ?? [service.name, ""],
    intro: body.intro ?? service.summary,
    offerings: body.offerings ?? [],
    tiers,
    options: service.offers
      .filter((offer) => offer.kind === "addon")
      .map((offer) => (offer.pricing === "quote" ? offer.name : `${offer.name} (${offer.priceLabel})`)),
    deliverables: body.deliverables ?? [],
    goodFit: body.goodFit ?? [],
    availability: body.availability ?? { now: [], partner: [] },
    faqs: body.faqs ?? [],
  };
}

export const fallbackCatalogue = fallback as unknown as CatalogueService[];
export const fallbackServices: Service[] = fallbackCatalogue.map(toService);

const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
/** "Eight" for 8, so headings follow the catalogue instead of going stale. */
export const countWord = (n: number) => words[n] ?? String(n);
