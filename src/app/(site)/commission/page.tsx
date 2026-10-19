import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, PageHero, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { currentAccount } from "@/lib/server/session";
import { loadServices } from "@/lib/server/catalogue";
import { process, startingPrice, type TierKey } from "@/lib/site-content";

import styles from "./commission.module.css";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Pick a KUSH service and send a commission request. You'll get a written quote before anything starts.",
};
export const dynamic = "force-dynamic";

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;
const tiers: TierKey[] = ["starter", "standard", "premium"];

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; tier?: string }>;
}) {
  const params = await searchParams;
  const services = await loadServices();
  const chosen = params.service ? services.find((service) => service.slug === params.service) : undefined;
  const tier = tiers.includes(params.tier as TierKey) ? (params.tier as TierKey) : undefined;
  const account = await currentAccount().catch(() => null);

  // Signed-in visitors go straight to the form; everyone else signs in first
  // and lands back on it, with their choice kept.
  const formPath = (slug?: string, key?: TierKey) =>
    `/account/commissions/new${slug ? `?service=${slug}${key ? `&tier=${key}` : ""}` : ""}`;
  const start = (slug?: string, key?: TierKey) =>
    account ? formPath(slug, key) : `/sign-in?next=${encodeURIComponent(formPath(slug, key))}`;
  const chosenTier = chosen && tier ? chosen.tiers.find((t) => t.key === tier) : undefined;

  return (
    <>
      <PageHero
        eyebrow="Start a project"
        title={["Let's build", "something."]}
        lede="Pick a service and tell us what you need. Asking is free: you'll get questions or a written quote back in your account, and nothing starts until you accept it."
      >
        <Link href={start(chosen?.slug, tier)} className={site.button} data-magnetic>
          {chosen ? `Request ${chosen.name}` : account ? "Open the request form" : "Sign in & start"} <Arrow />
        </Link>
        <Link href="/faq" className={site.buttonGhost} data-magnetic>
          Questions first?
        </Link>
      </PageHero>

      {chosen ? (
        <section className={site.sectionTight}>
          <div className={`container ${styles.chosen}`} data-reveal>
            <p className="eyebrow">You picked</p>
            <p className={styles.chosenName}>
              {chosen.name}
              {chosenTier ? <span> · {chosenTier.name}</span> : null}
            </p>
            <p className={styles.chosenPrice}>
              {chosenTier
                ? chosenTier.from
                  ? `From ${chosenTier.from}${chosenTier.quote ? ` (${chosenTier.quote.toLowerCase()})` : ""}`
                  : chosenTier.quote
                : startingPrice(chosen)
                  ? `From ${startingPrice(chosen)}`
                  : "Quoted individually"}
            </p>
            <Link href={`/services/${chosen.slug}`} className={site.textLink}>
              Back to {chosen.name} <Arrow />
            </Link>
          </div>
        </section>
      ) : null}

      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="Services" title="Choose a" accent="service.">
            <p className={site.lede}>Starting prices for small jobs. Bigger projects are quoted once we understand them.</p>
          </SectionHead>
          <div className={styles.grid}>
            {services.map((service, i) => (
              <article key={service.slug} className={styles.card} data-reveal style={delay(i)} data-active={chosen?.slug === service.slug}>
                <div className={styles.cardHead}>
                  <span className="mono">{service.index}</span>
                  <span className={styles.price}>{startingPrice(service) ? `from ${startingPrice(service)}` : "quoted"}</span>
                </div>
                <h3>{service.name}</h3>
                <p>{service.summary}</p>
                <div className={styles.cardActions}>
                  <Link href={start(service.slug)} className={site.button}>
                    Request <Arrow />
                  </Link>
                  <Link href={`/services/${service.slug}`} className={site.textLink}>
                    Details
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${site.section} ${site.sectionRule}`}>
        <div className={`container ${site.twoCol}`}>
          <div data-reveal>
            <p className="eyebrow">Worth including</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              <li>What you want made, in a sentence or two</li>
              <li>Who it&apos;s for and what it needs to do</li>
              <li>Links or files for anything you like the look of</li>
              <li>Any deadline you&apos;re working towards</li>
              <li>A rough budget, if you have one in mind</li>
              <li>How you&apos;d like us to reach you</li>
            </ul>
          </div>
          <div data-reveal style={delay(1)}>
            <p className="eyebrow">Prefer Discord?</p>
            <p className={site.lede} style={{ marginTop: 20 }}>
              Use the commission panel in our Discord&apos;s <strong>#commission-enquiries</strong> channel. It creates the
              same request, so you can follow it in either place.
            </p>
          </div>
        </div>
      </section>

      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="After you send it" title="What" accent="happens next." />
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
    </>
  );
}
