import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, PageHero } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { faqs } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about working with KUSH, your account, security and support.",
};

export default function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title={["Good", "questions."]} lede="The things people ask us most. Can't see yours? Just ask.">
        <Link href="/contact" className={site.buttonGhost} data-magnetic>
          Ask us something <Arrow />
        </Link>
      </PageHero>
      <section className={site.section}>
        <div className="container" style={{ maxWidth: 980 }}>
          {faqs.map((group) => (
            <div key={group.group} className={site.faqGroup} data-reveal>
              <p className="eyebrow">{group.group}</p>
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-2)" }}>
                {group.items.map((item) => (
                  <details key={item.q} className={site.faqItem}>
                    <summary>{item.q}</summary>
                    <p className={site.faqAnswer}>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
