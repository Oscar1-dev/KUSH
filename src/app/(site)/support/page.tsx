import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, PageHero } from "@/components/site/blocks";
import pages from "@/components/site/pages.module.css";
import site from "@/components/site/site.module.css";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with an order, a product, a commission or your account.",
};

const routes = [
  {
    title: "A problem with an order or download",
    text: "Open a ticket from your account and include the order number. Receipts are on your orders page.",
    href: "/account/support/new",
    cta: "Open a ticket",
  },
  {
    title: "A question about your commission",
    text: "Every commission has its own conversation with the team, on the website and in a private Discord channel.",
    href: "/account/commissions",
    cta: "Your commissions",
  },
  {
    title: "Something new you'd like made",
    text: "Tell us what you need. You'll get a written quote before anything is charged.",
    href: "/commission",
    cta: "Start a project",
  },
  {
    title: "Can't sign in, or 2FA trouble",
    text: "Sign-in uses your Discord account. Lost your 2FA device? Use a recovery code, or ask in our Discord's support channel.",
    href: "/faq",
    cta: "Account FAQ",
  },
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title={["Here", "to help."]}
        lede="Real people, not a chatbot. Tickets reach the team on the website and in Discord at the same time."
      >
        <Link href="/account/support/new" className={site.button} data-magnetic>
          Open a ticket <Arrow />
        </Link>
      </PageHero>
      <section className={site.section}>
        <div className="container" style={{ maxWidth: 980 }}>
          {routes.map((route) => (
            <div key={route.title} className={pages.priceRow} data-reveal>
              <span className={pages.priceRowName}>{route.title}</span>
              <span className={pages.priceRowMeta}>{route.text}</span>
              <span className={pages.priceValue}>
                <Link href={route.href} className={site.textLink}>
                  {route.cta} <Arrow />
                </Link>
              </span>
            </div>
          ))}
          <p className={pages.updated} style={{ marginTop: 40 }}>
            In Discord, type <span className="mono">/ticket create</span> or press the button in #create-ticket. Policies:{" "}
            <Link href="/terms">terms</Link> · <Link href="/privacy">privacy</Link> · <Link href="/refunds">refunds</Link>
          </p>
        </div>
      </section>
    </>
  );
}
