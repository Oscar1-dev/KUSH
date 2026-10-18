import type { Metadata } from "next";
import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";

export const metadata: Metadata = {
  title: "Vouches — KUSH®",
  description: "Reviews from verified KUSH customers.",
};
export const dynamic = "force-dynamic";

interface Vouch {
  number: number;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
}

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

export default async function VouchesPage() {
  let data: { vouches: Vouch[]; count: number; average: number | null } | null = null;
  try {
    data = await kushApi("/public/vouches?limit=50");
  } catch {
    data = null;
  }

  return (
    <main className={styles.signIn} style={{ placeItems: "start center" }}>
      <div className={styles.signInOrbit} aria-hidden="true" />
      <section style={{ position: "relative", width: "min(1080px, 100%)", padding: "40px 0" }} aria-labelledby="vouches-title">
        <Link href="/" className={styles.brand} aria-label="KUSH home">
          K<span>U</span>SH
        </Link>
        <p className={styles.kicker} style={{ marginTop: 40 }}>
          VOUCHES
        </p>
        <h1 id="vouches-title" className={styles.title}>
          In their <em>words.</em>
        </h1>
        <p className={styles.lede}>
          Every vouch comes from a verified KUSH customer, posted in our Discord with <code>!vouch</code>.
          {data && data.count > 0 && data.average !== null
            ? ` ${data.average.toFixed(1)} out of 5 across ${data.count} ${data.count === 1 ? "vouch" : "vouches"}.`
            : ""}
        </p>

        {data === null ? (
          <p className={`${styles.notice} ${styles.noticeError}`}>Vouches can&apos;t be loaded right now. Please try again shortly.</p>
        ) : data.vouches.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No vouches yet</p>
            <p className={styles.emptyText}>Bought from KUSH? Leave the first one in our Discord with !vouch.</p>
          </div>
        ) : (
          <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {data.vouches.map((v) => (
              <article key={v.number} className={styles.card}>
                <p className={styles.cardLabel} aria-label={`${v.rating} out of 5`}>
                  {stars(v.rating)}
                </p>
                <p className={styles.cardText} style={{ whiteSpace: "pre-line" }}>
                  &ldquo;{v.body}&rdquo;
                </p>
                <p className={styles.rowMeta} style={{ marginTop: 10 }}>
                  {v.authorName} · verified customer · {day.format(new Date(v.createdAt))}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
