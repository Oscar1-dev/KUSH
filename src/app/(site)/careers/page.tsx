import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, PageHero } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import type { Position } from "@/lib/recruitment";
import { kushApi } from "@/lib/server/kush-api";

import styles from "./careers.module.css";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the KUSH team. Open staff positions and how applying works.",
};
export const dynamic = "force-dynamic";

const steps = [
  { title: "Apply", text: "Sign in with Discord and fill in the form. It only takes a few minutes." },
  { title: "Chat", text: "You get a private Discord channel with the team, so we can ask questions both ways." },
  { title: "Sign", text: "Roles above Moderator sign an NDA, on the website or right inside Discord." },
  { title: "Start", text: "We give you your roles and you show up on the team. That's it." },
];

export default async function CareersPage() {
  let positions: Position[] = [];
  let unavailable = false;
  try {
    positions = (await kushApi<{ positions: Position[] }>("/web/careers/positions")).positions;
  } catch {
    unavailable = true;
  }

  return (
    <>
      <PageHero
        eyebrow="Careers"
        title={["Build it", "with us."]}
        lede="We're a small team that cares about doing things properly. If that sounds like you, the whole process happens in your KUSH account and a private Discord channel."
      />

      <section className={site.section}>
        <div className="container">
          {unavailable ? (
            <p className={site.notice}>We can&apos;t load the open positions right now. Give it a minute and refresh.</p>
          ) : positions.length === 0 ? (
            <div className={site.notice} data-reveal>
              <strong style={{ color: "var(--text)" }}>Nothing open right now.</strong> Keep an eye on announcements in
              the KUSH Discord.
            </div>
          ) : (
            <div className={styles.grid}>
              {positions.map((p, i) => (
                <article key={p.key} className={styles.role} data-reveal style={{ "--reveal-i": i } as React.CSSProperties}>
                  <p className="eyebrow">{p.staffRole.replace(/-/g, " ")}</p>
                  <h2 className={styles.title}>{p.title}</h2>
                  <p className={styles.summary}>{p.summary}</p>
                  {p.responsibilities ? (
                    <ul className={site.checkList}>
                      {p.responsibilities.split("\n").filter(Boolean).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {p.requirements ? (
                    <p className={styles.needs}>
                      <strong>You&apos;ll need:</strong> {p.requirements.split("\n").filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(`/account/applications/new?position=${p.key}`)}`}
                    className={site.button}
                    style={{ alignSelf: "flex-start", marginTop: "auto" }}
                    data-magnetic
                  >
                    Apply <Arrow />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <p className="eyebrow" data-reveal>
            How applying works
          </p>
          <ol className={site.process} style={{ marginTop: 28 }}>
            {steps.map((step, i) => (
              <li key={step.title} className={site.processStep} data-reveal style={{ "--reveal-i": i } as React.CSSProperties}>
                <span className={`mono ${site.processNumber}`}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={site.processTitle}>{step.title}</h3>
                <p className={site.processText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
