/**
 * Public website copy and the service catalogue. Describes what KUSH
 * actually offers and how the real commission pipeline runs. No invented
 * clients, stats or reviews: vouches only come from the live vouch system,
 * and showcase images are labelled concepts.
 *
 * Services and prices come from the KUSH API's catalogue (staff edit them
 * there); this file only carries the built-in copy for when it can't be
 * read. Prices are starting points: every project gets a written quote
 * first, and no delivery time is promised before that.
 */

import { fallbackServices } from "./catalogue";

export type TierKey = "starter" | "standard" | "premium";

export interface Tier {
  key: TierKey;
  name: string;
  /** Indicative starting price, or null when it's always quoted. */
  from: string | null;
  /** Extra price note (e.g. a typical range), or the label when there's no price. */
  quote?: string;
  forWhat: string;
  includes: string[];
}

export interface Service {
  slug: string;
  index: string;
  name: string;
  /** One line for cards and menus. */
  summary: string;
  headline: [string, string];
  intro: string;
  offerings: { title: string; text: string }[];
  tiers: Tier[];
  /** Add-ons that can be quoted onto any tier. */
  options: string[];
  deliverables: string[];
  goodFit: string[];
  /** What we deliver ourselves today vs. what relies on a third party. */
  availability: { now: string[]; partner: string[] };
  faqs: { q: string; a: string }[];
}

/** The catalogue as built in (see lib/catalogue.ts); pages prefer the live API. */
export const services: Service[] = fallbackServices;

export const serviceBySlug = (slug: string) => services.find((service) => service.slug === slug);

/** Lowest "from" price across a service's tiers, for cards. */
export const startingPrice = (service: Service) => service.tiers.find((tier) => tier.from)?.from ?? null;

/** The real commission pipeline, stage for stage, as your account shows it. */
export const process = [
  {
    step: "01",
    title: "Request",
    text: "Pick a service and tell us what you need, on the website or in our Discord. A few minutes, a few details, any references.",
  },
  {
    step: "02",
    title: "Review & quote",
    text: "We check the scope, ask what we need to, and send a written quote: price, timeline, revisions and exactly what you get.",
  },
  {
    step: "03",
    title: "Approve & deposit",
    text: "Accept the quote in your account. We confirm the deposit with you directly before any work starts.",
  },
  {
    step: "04",
    title: "Build & milestones",
    text: "Work is split into milestones you can follow, with every message in one thread on the site and in Discord.",
  },
  {
    step: "05",
    title: "Deliver & support",
    text: "You review, we polish, then final payment and handover. Support and optional maintenance carry on after.",
  },
];

export const principles = [
  { title: "No templates.", text: "Every project gets its own identity. We don't reskin last month's work." },
  { title: "It has to work.", text: "A beautiful interface is pointless if the thing behind it breaks." },
  { title: "Details matter.", text: "Empty states, error messages, keyboard focus. The small stuff is the product." },
  { title: "Straight talk.", text: "Clear quotes, honest progress updates, and no made-up numbers. Here or in your project." },
];

export const faqs: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Commissions",
    items: [
      {
        q: "How do I start a project?",
        a: "Pick a service and send a commission request, from the website or from the commission panel in our Discord. Both create the same request, and we reply in one thread you can follow in either place.",
      },
      {
        q: "How much does it cost?",
        a: "Each service lists a starting price, from £10 for small jobs. Anything bigger gets a written quote after we've looked at the scope, and nothing begins until you accept it.",
      },
      {
        q: "How do I pay?",
        a: "Once you accept a quote, we'll confirm the deposit with you directly. Card payments on the site aren't switched on yet, so we'll never ask you to pay anywhere unexpected.",
      },
      {
        q: "Can I see how it's going?",
        a: "Yes. Projects are split into milestones you can follow in your account, and all the messages stay in one conversation.",
      },
      {
        q: "Who owns the finished work?",
        a: "Ownership and usage rights are written into your quote before you accept it, so you know exactly where you stand at handover.",
      },
    ],
  },
  {
    group: "Accounts & security",
    items: [
      {
        q: "Why sign in with Discord?",
        a: "It links your website account to the KUSH Discord, so tickets, roles and commissions stay in sync. We only get your Discord username and avatar, never your password.",
      },
      {
        q: "Can I lock my account down further?",
        a: "Yes. Turn on two-factor authentication with any authenticator app under Security. All KUSH staff have to use it.",
      },
      {
        q: "Where do I find my files?",
        a: "Anything delivered to you shows up in Downloads. Links are signed, expire after a few minutes, and your access is checked every time.",
      },
    ],
  },
  {
    group: "Support",
    items: [
      {
        q: "How do I get help?",
        a: "Open a support ticket from your account, or in the KUSH Discord. Either way it's the same private ticket, visible only to you and the staff handling it.",
      },
      {
        q: "What are vouches?",
        a: "Reviews from verified customers, posted in our Discord with !vouch. Only people who've actually bought from KUSH can leave one, and they show up here unedited.",
      },
      {
        q: "Are the showcase images real client work?",
        a: "No. They're KUSH concept designs, made to show what we can build, and labelled as concepts. Client work only appears once a client has agreed to it.",
      },
    ],
  },
];
