import Link from "next/link";

import { Arrow, Cta, SectionHead } from "@/components/site/blocks";
import fx from "@/components/site/effects.module.css";
import Marquee from "@/components/site/marquee";
import Scramble from "@/components/site/scramble";
import ServiceList from "@/components/site/service-list";
import site from "@/components/site/site.module.css";
import SplitText from "@/components/site/split-text";
import SyncDemo from "@/components/site/sync-demo";
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
      <section className={styles.hero} data-scroll>
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroMeta} data-intro>
            <span className="eyebrow">
              <b>KUSH</b> Independent creative technology studio
            </span>
            <span className="eyebrow">Est. 2026</span>
          </div>

          <h1 className={`display ${styles.heroTitle}`}>
            <span className="sr-only">Built different.</span>
            <span data-intro style={delay(1)} aria-hidden="true">
              <span className={styles.heroLine}>
                Built
                <span className={styles.leafWrap}>
                  <span className={styles.leaf} />
                </span>
              </span>
            </span>
            <span data-intro style={delay(2)} aria-hidden="true">
              <span className={`rainbow ${styles.heroAccent}`}>different.</span>
            </span>
          </h1>

          <div className={styles.heroFoot}>
            <div data-intro style={delay(3)}>
              <p className={styles.heroLede}>
                We&apos;re a small, independent studio building software, websites and brands for people who want
                something that&apos;s actually theirs.
              </p>
              <div className={site.heroActions}>
                <Link href="/commission" className={site.button} data-magnetic>
                  Start a project <Arrow />
                </Link>
                <Link href="/services" className={site.buttonGhost} data-magnetic>
                  See what we do
                </Link>
              </div>
            </div>
            <nav className={styles.heroIndex} aria-label="Services" data-intro style={delay(4)}>
              {services.map((service) => (
                <Link key={service.slug} href={`/services/${service.slug}`}>
                  <span className="mono">{service.index}</span>
                  {service.name}
                  <Arrow size={13} />
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <a href="#services" className={styles.scrollCue} aria-label="Scroll to services">
          <span className="mono">Scroll</span>
          <span className={styles.scrollLine} />
        </a>
      </section>

      <Marquee words={["Software", "Websites", "Web apps", "Desktop", "UI/UX", "Branding", "Discord bots"]} />

      {/* -------------------------------------------------------- services */}
      <section className={site.section} id="services">
        <div className="container">
          <SectionHead eyebrow="01 — What we do" title="What we" accent="make.">
            <p className={site.lede}>
              Five things, done properly. Because design, code and brand all come from the same small team, they
              actually fit together.
            </p>
          </SectionHead>
          <ServiceList services={services} />
        </div>
      </section>

      {/* --------------------------------------------- process (pinned) */}
      <section className={fx.pin} data-pin aria-labelledby="process-title">
        <div className={`container ${fx.pinStage}`}>
          <div>
            <Scramble className="eyebrow" text="02 — How it works" />
            <h2 id="process-title" className={`display ${site.sectionTitle}`}>
              Idea to <em className="holo">delivery.</em>
            </h2>
            <div className={fx.pinCounter} aria-hidden="true">
              {process.map((step, i) => (
                <span
                  key={step.step}
                  className={`rainbow ${fx.pinNumber}`}
                  style={{ "--i": i, "--end": i === process.length - 1 ? 9 : i + 1 } as React.CSSProperties}
                >
                  {step.step}
                </span>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <span className={fx.pinRail} aria-hidden="true" />
            <ol className={fx.pinSteps}>
              {process.map((step, i) => (
                <li key={step.step} className={fx.pinStep} style={{ "--i": i } as React.CSSProperties}>
                  <span className="mono">Step {step.step}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- platform */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="03 — The platform" title="One account." accent="Two front doors.">
            <p className={site.lede}>
              Talk to us on the website or in our Discord. It&apos;s one system underneath, so a reply in one place
              shows up in the other. Here&apos;s a support ticket doing exactly that.
            </p>
          </SectionHead>
          <div data-reveal>
            <SyncDemo />
          </div>
          <dl className={styles.platformList}>
            {[
              { title: "One sign-in", text: "Your KUSH account and your Discord are the same identity. Roles and purchases follow you." },
              { title: "Tickets both ways", text: "Open one on the site or in Discord and reply from either. It's the same private ticket." },
              { title: "Projects you can follow", text: "Quotes, milestones and the whole conversation, all in your account." },
              { title: "Safe downloads", text: "Signed links that expire in minutes, with your access checked every time." },
            ].map((item, i) => (
              <div key={item.title} data-reveal style={delay(i)}>
                <dt>{item.title}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Marquee reverse words={["Design", "Code", "Culture", "Built different"]} />

      {/* ------------------------------------------------------ principles */}
      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="04 — How we work" title="House" accent="rules." />
          <div className={styles.principles}>
            {principles.map((item, i) => (
              <article key={item.title} className={styles.principle} data-reveal style={delay(i)}>
                <span className="mono">/{String(i + 1).padStart(2, "0")}</span>
                <h3>
                  <SplitText text={item.title} />
                </h3>
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
            <SectionHead eyebrow="05 — Vouches" title="Don't take" accent="our word.">
              <p className={site.lede}>
                Straight from verified customers in our Discord, shown here exactly as they wrote them.
                {wall.average !== null ? ` ${wall.average.toFixed(1)} out of 5 from ${wall.count}.` : ""}
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
              Read them all <Arrow />
            </Link>
          </div>
        </section>
      ) : null}

      <Cta />
    </>
  );
}
