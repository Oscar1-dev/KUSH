import Link from "next/link";

import { Arrow, Cta, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { principles, process, services } from "@/lib/site-content";

import styles from "./home.module.css";

export const dynamic = "force-dynamic";

interface VouchWall {
  vouches: { number: number; authorName: string; rating: number; body: string; createdAt: string }[];
  count: number;
  average: number | null;
}

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

export default async function Home() {
  // Only real vouches are shown; the section disappears if there are none.
  const wall = await kushApi<VouchWall>("/public/vouches?limit=3").catch(() => null);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className={styles.hero}>
        <div className={`hex-mesh ${styles.heroMesh}`} aria-hidden="true" />
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroMeta} data-intro>
            <span className="eyebrow">
              <b>KUSH</b> Independent creative technology studio
            </span>
            <span className="eyebrow">Est. 2026</span>
          </div>

          <h1 className={`display ${styles.heroTitle}`}>
            <span className={styles.heroLine} data-intro style={delay(1)}>
              Built
              <span className={styles.leafWrap} aria-hidden="true">
                <span className={styles.leaf} />
              </span>
            </span>
            <span className={`rainbow ${styles.heroAccent}`} data-intro style={delay(2)}>
              different.
            </span>
          </h1>

          <div className={styles.heroFoot}>
            <div data-intro style={delay(3)}>
              <p className={styles.heroLede}>
                We design and build custom software, websites, web applications and creative work, with the
                engineering done as carefully as the visuals.
              </p>
              <div className={site.heroActions}>
                <Link href="/commission" className={site.button}>
                  Start a project <Arrow />
                </Link>
                <Link href="/services" className={site.buttonGhost}>
                  What we do
                </Link>
              </div>
            </div>
            <nav className={styles.heroIndex} aria-label="Services" data-intro style={delay(4)}>
              {services.map((service) => (
                <Link key={service.slug} href={`/services/${service.slug}`}>
                  <span className="mono">{service.index}</span>
                  {service.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- services */}
      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="01 — Services" title="What we" accent="make.">
            <p className={site.lede}>
              Five disciplines under one roof, so the design, the build and the brand come from the same people and fit
              together.
            </p>
          </SectionHead>
          <ul className={site.serviceList}>
            {services.map((service, i) => (
              <li key={service.slug} className={site.serviceItem} data-reveal style={delay(i)}>
                <Link href={`/services/${service.slug}`} className={site.serviceLink}>
                  <span className={`mono ${site.serviceIndex}`}>{service.index}</span>
                  <h3 className={site.serviceName}>{service.name}</h3>
                  <p className={site.serviceSummary}>{service.summary}</p>
                  <span className={site.serviceArrow}>
                    <Arrow up size={20} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- process */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="02 — Process" title="How it" accent="works.">
            <p className={site.lede}>
              This isn&apos;t a diagram for the website. It&apos;s the exact flow your project follows in your KUSH
              account, from request to delivery.
            </p>
          </SectionHead>
          <ol className={site.process}>
            {process.map((step, i) => (
              <li key={step.step} className={site.processStep} data-reveal style={delay(i)}>
                <span className={`mono ${site.processNumber}`}>{step.step}</span>
                <h3 className={site.processTitle}>{step.title}</h3>
                <p className={site.processText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- platform */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className={`container ${styles.platformInner}`}>
          <div>
            <p className="eyebrow" data-reveal>
              03 — Platform
            </p>
            <h2 className={`display ${site.sectionTitle}`} data-reveal>
              One account.
              <br />
              <em className="holo">Two front doors.</em>
            </h2>
            <p className={site.lede} data-reveal style={{ marginTop: 24 }}>
              Work with KUSH from the website or from our Discord. Behind both is one system, so nothing has to be said
              twice.
            </p>
            <dl className={styles.platformList}>
              {[
                { title: "One sign-in", text: "Your KUSH account and the KUSH Discord are the same identity. Roles, tickets and purchases stay in sync." },
                { title: "Commissions you can follow", text: "Quotes, milestones and one conversation per project, all in your account." },
                { title: "Private support", text: "Open a ticket on the website or in Discord. Both are the same private ticket." },
                { title: "Secure delivery", text: "Signed, short-lived download links, with access re-checked every time." },
              ].map((item, i) => (
                <div key={item.title} data-reveal style={delay(i)}>
                  <dt>{item.title}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Illustration of the real account UI; no customer data. */}
          <figure className={styles.mock} data-reveal aria-label="Illustration of a commission in a KUSH account">
            <div className={styles.mockBar}>
              <span />
              <span />
              <span />
              <p className="mono">kush / account / commissions</p>
            </div>
            <div className={styles.mockBody}>
              <p className="eyebrow">Commission · Illustration</p>
              <p className={styles.mockTitle}>Your project</p>
              <div className={styles.mockQuote}>
                <span className="mono">Quote</span>
                <span className={styles.mockPill}>Accepted</span>
              </div>
              <ol className={styles.mockSteps}>
                <li data-state="done">Discovery &amp; scope</li>
                <li data-state="done">Design</li>
                <li data-state="now">Build</li>
                <li>Review &amp; delivery</li>
              </ol>
              <div className={styles.mockMessage}>
                <span className={styles.mockAvatar}>K</span>
                <p>Milestone updates and files arrive here, in one thread with your messages.</p>
              </div>
            </div>
            <figcaption className="mono">Illustrative. Your account shows your real project.</figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------ principles */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="04 — Principles" title="How we" accent="hold ourselves." />
          <div className={styles.principles}>
            {principles.map((item, i) => (
              <article key={item.title} className={styles.principle} data-reveal style={delay(i)}>
                <span className="mono">/{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- vouches */}
      {wall && wall.count > 0 ? (
        <section className={`${site.section} ${site.sectionRule}`}>
          <div className="container">
            <SectionHead eyebrow="05 — Vouches" title="In their" accent="words.">
              <p className={site.lede}>
                From verified customers, posted in our Discord and shown here unedited.
                {wall.average !== null ? ` ${wall.average.toFixed(1)} out of 5 across ${wall.count}.` : ""}
              </p>
            </SectionHead>
            <div className={styles.vouches}>
              {wall.vouches.map((vouch, i) => (
                <blockquote key={vouch.number} className={styles.vouch} data-reveal style={delay(i)}>
                  <span className={styles.stars} aria-label={`${vouch.rating} out of 5`}>
                    {"★".repeat(vouch.rating)}
                    <span>{"★".repeat(5 - vouch.rating)}</span>
                  </span>
                  <p>&ldquo;{vouch.body}&rdquo;</p>
                  <footer className="mono">{vouch.authorName} · Verified customer</footer>
                </blockquote>
              ))}
            </div>
            <Link href="/vouches" className={site.textLink} style={{ marginTop: 32 }}>
              All vouches <Arrow />
            </Link>
          </div>
        </section>
      ) : null}

      <Cta />
    </>
  );
}
