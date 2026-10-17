import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import styles from "@/components/account/account.module.css";
import type { Position } from "@/lib/recruitment";
import { kushApi } from "@/lib/server/kush-api";

export const metadata: Metadata = {
  title: "Careers — KUSH®",
  description: "Join the KUSH team: open staff positions.",
};
export const dynamic = "force-dynamic";

export default async function CareersPage() {
  let positions: Position[] = [];
  let unavailable = false;
  try {
    positions = (await kushApi<{ positions: Position[] }>("/web/careers/positions")).positions;
  } catch {
    unavailable = true;
  }

  return (
    <main className={styles.signIn} style={{ placeItems: "start center" }}>
      <div className={styles.signInOrbit} aria-hidden="true" />
      <section style={{ position: "relative", width: "min(1080px, 100%)", padding: "40px 0" }} aria-labelledby="careers-title">
        <Link href="/" className={styles.brand} aria-label="KUSH home">
          K<span>U</span>SH
        </Link>
        <p className={styles.kicker} style={{ marginTop: 40 }}>
          CAREERS
        </p>
        <h1 id="careers-title" className={styles.title}>
          Build it <em>with us.</em>
        </h1>
        <p className={styles.lede}>
          KUSH is a small, independent studio. We&apos;re looking for people who care about doing things properly.
          Apply with your Discord account; the whole process, from application to onboarding, happens in your KUSH
          account and a private Discord channel.
        </p>

        {unavailable ? (
          <p className={`${styles.notice} ${styles.noticeError}`}>Positions can&apos;t be loaded right now. Please try again shortly.</p>
        ) : positions.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No open positions right now</p>
            <p className={styles.emptyText}>Check back soon, or follow announcements in the KUSH Discord.</p>
          </div>
        ) : (
          <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {positions.map((p) => (
              <article key={p.key} className={styles.card} style={{ display: "flex", flexDirection: "column" }}>
                <p className={styles.cardLabel}>{p.staffRole.toUpperCase()}</p>
                <h2 className={styles.cardValue}>{p.title}</h2>
                <p className={styles.cardText}>{p.summary}</p>
                {p.responsibilities ? (
                  <ul className={styles.cardText} style={{ paddingLeft: 18 }}>
                    {p.responsibilities.split("\n").map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {p.requirements ? (
                  <p className={styles.rowMeta} style={{ marginTop: 6 }}>
                    <strong style={{ color: "var(--cream)" }}>You&apos;ll need:</strong> {p.requirements.split("\n").join(" · ")}
                  </p>
                ) : null}
                <Link
                  href={`/account/applications/new?position=${p.key}`}
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  style={{ marginTop: "auto", alignSelf: "flex-start", marginBlockStart: 22 }}
                >
                  APPLY
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
