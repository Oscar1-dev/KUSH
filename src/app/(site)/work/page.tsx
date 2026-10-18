import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import SyncDemo from "@/components/site/sync-demo";

import styles from "./work.module.css";

export const metadata: Metadata = {
  title: "Work",
  description: "What KUSH has built so far, starting with the KUSH platform itself.",
};

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

// Everything listed here exists and runs today.
const built = [
  { area: "Website", items: ["This site, built from scratch", "Accounts with Discord sign-in", "Two-factor authentication", "Customer and staff dashboards"] },
  { area: "Discord", items: ["Private ticket channels", "Moderation cases and rule watch", "Vouches and role sync", "NDA signing in Discord"] },
  { area: "Back-end", items: ["One API behind both", "Commission quotes and milestones", "Signed, expiring downloads", "Audit logs and retrying jobs"] },
];

export default function WorkPage() {
  return (
    <>
      <PageHero
        eyebrow="Work"
        title={["Show,", "don't tell."]}
        lede="We're a new studio, so we won't pad this page with mock-ups and made-up clients. Here's the first real thing we built: our own platform."
      />

      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="Case study 01" title="The KUSH" accent="platform.">
            <p className={site.lede}>
              A website and a Discord server that behave like one product. Sign in once, and your tickets, projects,
              purchases and roles follow you between the two, in real time.
            </p>
          </SectionHead>
          <div data-reveal>
            <SyncDemo />
          </div>
          <div className={styles.built}>
            {built.map((column, i) => (
              <div key={column.area} data-reveal style={delay(i)}>
                <p className="eyebrow">{column.area}</p>
                <ul className={site.checkList} style={{ marginTop: 18 }}>
                  {column.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${site.sectionTight} ${site.sectionRule}`}>
        <div className={`container ${styles.soon}`} data-reveal>
          <p className="eyebrow">Client work</p>
          <p className={styles.soonText}>
            Client projects go up here once they&apos;re finished and the client&apos;s happy for us to show them. Want
            yours to be first?
          </p>
          <Link href="/commission" className={site.textLink}>
            Start a project <Arrow />
          </Link>
        </div>
      </section>

      <Cta />
    </>
  );
}
