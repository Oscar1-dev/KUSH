import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import Marquee from "@/components/site/marquee";
import site from "@/components/site/site.module.css";
import { principles } from "@/lib/site-content";

import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "KUSH is a small, independent creative technology studio, founded in 2026.",
};

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title={["Small studio.", "Big standards."]}
        lede="KUSH started in 2026 with a simple idea: design and engineering shouldn't live in different buildings. So we do both, in the same room."
      />

      <section className={site.section}>
        <div className={`container ${styles.story}`}>
          <p className={styles.big} data-reveal>
            We build software, websites and brands. We care how they look, but we care more that they{" "}
            <span className="holo">actually work</span>, keep working, and still make sense to the person who picks
            them up next year.
          </p>
          <div className={styles.side} data-reveal style={delay(1)}>
            <p>
              We&apos;re independent, which means no account managers and no hand-offs between departments. The people
              you talk to are the people doing the work.
            </p>
            <p>
              We also run our own community on Discord. It&apos;s where support happens, where vouches get posted, and
              where you can see how we work before you hire us.
            </p>
          </div>
        </div>
      </section>

      <Marquee words={["Independent", "Est. 2026", "Built different"]} />

      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="What we stand for" title="House" accent="rules." />
          <div className={site.featureGrid}>
            {principles.map((item, i) => (
              <article key={item.title} className={site.feature} data-reveal style={delay(i)}>
                <h3 className={site.featureTitle}>{item.title}</h3>
                <p className={site.featureText}>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${site.sectionTight} ${site.sectionRule}`}>
        <div className={`container ${styles.join}`} data-reveal>
          <div>
            <p className="eyebrow">Join us</p>
            <p className={styles.joinText}>Build, design or help people for a living? See what&apos;s open.</p>
          </div>
          <Link href="/careers" className={site.buttonGhost} data-magnetic>
            Open positions <Arrow />
          </Link>
        </div>
      </section>

      <Cta />
    </>
  );
}
