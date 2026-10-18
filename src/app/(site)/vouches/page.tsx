import type { Metadata } from "next";

import { PageHero } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { kushApi } from "@/lib/server/kush-api";

import styles from "./vouches.module.css";

export const metadata: Metadata = {
  title: "Vouches",
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

export default async function VouchesPage() {
  const data = await kushApi<{ vouches: Vouch[]; count: number; average: number | null }>("/public/vouches?limit=50").catch(
    () => null,
  );

  return (
    <>
      <PageHero
        eyebrow="Vouches"
        title={["In their", "words."]}
        lede={
          <>
            Every vouch here is from a verified KUSH customer, posted in our Discord with <code>!vouch</code> and shown
            exactly as written.
          </>
        }
        aside={
          data && data.count > 0 && data.average !== null ? (
            <p className={styles.score}>
              <span className="rainbow">{data.average.toFixed(1)}</span>
              <span className="mono">
                out of 5 · {data.count} {data.count === 1 ? "vouch" : "vouches"}
              </span>
            </p>
          ) : null
        }
      />

      <section className={site.section}>
        <div className="container">
          {data === null ? (
            <p className={site.notice}>We can&apos;t load vouches right now. Give it a minute and refresh.</p>
          ) : data.vouches.length === 0 ? (
            <div className={site.notice} data-reveal>
              <strong style={{ color: "var(--text)" }}>No vouches yet.</strong> Bought something from KUSH? Be the first:
              type <code>!vouch</code> in our Discord.
            </div>
          ) : (
            <div className={styles.wall}>
              {data.vouches.map((v, i) => (
                <blockquote key={v.number} className={styles.vouch} data-reveal style={{ "--reveal-i": i % 6 } as React.CSSProperties}>
                  <span className={styles.stars} aria-label={`${v.rating} out of 5`}>
                    {"★".repeat(v.rating)}
                    <span>{"★".repeat(5 - v.rating)}</span>
                  </span>
                  <p>&ldquo;{v.body}&rdquo;</p>
                  <footer className="mono">
                    {v.authorName} · verified customer · {day.format(new Date(v.createdAt))}
                  </footer>
                </blockquote>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
