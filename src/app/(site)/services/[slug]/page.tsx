import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { conceptsFor } from "@/lib/showcase";
import { loadServices } from "@/lib/server/catalogue";
import { process, services as builtIn, startingPrice } from "@/lib/site-content";

import styles from "../services.module.css";

// Prices are edited by staff in the API; pages refresh within a minute.
export const revalidate = 60;

export function generateStaticParams() {
  return builtIn.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = (await loadServices()).find((item) => item.slug === slug);
  return service ? { title: service.name, description: service.summary } : {};
}

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;
const request = (slug: string, tier?: string) => `/commission?service=${slug}${tier ? `&tier=${tier}` : ""}`;

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const services = await loadServices();
  const service = services.find((item) => item.slug === slug);
  if (!service) notFound();
  const at = services.indexOf(service);
  const next = services[(at + 1) % services.length]!;
  const from = startingPrice(service);
  const concepts = conceptsFor(service.slug);

  return (
    <>
      <PageHero
        eyebrow={`Service ${service.index} / ${String(services.length).padStart(2, "0")}`}
        title={service.headline}
        lede={service.intro}
        aside={
          from ? (
            <p className={styles.from}>
              <span className="mono">Starting from</span>
              <span className="rainbow">{from}</span>
            </p>
          ) : null
        }
      >
        <Link href={request(service.slug)} className={site.button} data-magnetic>
          Request this <Arrow />
        </Link>
        <a href="#pricing" className={site.buttonGhost} data-magnetic>
          See pricing
        </a>
      </PageHero>

      {/* ------------------------------------------------------------ tiers */}
      <section className={site.section} id="pricing">
        <div className="container">
          <SectionHead eyebrow="Pricing" title="Pick a" accent="starting point.">
            <p className={site.lede}>
              Prices are where each tier starts. Every request gets a scope check and a written quote before anything
              begins, so you&apos;ll know the real price first.
            </p>
          </SectionHead>
          <div className={styles.tiers}>
            {service.tiers.map((tier, i) => (
              <article key={tier.key} className={`${styles.tier} ${tier.key === "premium" ? styles.tierPremium : ""}`} data-reveal style={delay(i)}>
                <p className="eyebrow">{tier.key === "starter" ? "Starter" : tier.key === "standard" ? "Standard" : "Premium"}</p>
                <h3 className={styles.tierName}>{tier.name}</h3>
                <p className={styles.tierPrice}>
                  {tier.from ? (
                    <>
                      <span className="mono">from</span> {tier.from}
                    </>
                  ) : (
                    tier.quote
                  )}
                </p>
                {tier.from && tier.quote ? <p className={`mono ${styles.tierNote}`}>{tier.quote}</p> : null}
                <p className={styles.tierFor}>{tier.forWhat}</p>
                <ul className={site.checkList}>
                  {tier.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link href={request(service.slug, tier.key)} className={tier.key === "premium" ? site.button : site.buttonGhost} style={{ marginTop: "auto" }}>
                  Request {tier.key === "premium" ? "a quote" : "this"} <Arrow />
                </Link>
              </article>
            ))}
          </div>
          <p className={`mono ${styles.small}`}>
            Indicative prices in GBP. Third-party costs (hosting, domains, certificates) are billed by the provider and
            listed separately in your quote.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- concepts */}
      {concepts.length ? (
        <section className={`${site.section} ${site.sectionRule}`}>
          <div className="container">
            <SectionHead eyebrow="Concept showcase" title="What it could" accent="look like.">
              <p className={site.lede}>
                Original KUSH concept designs, made to show the kind of work this service produces. They&apos;re not
                client projects.
              </p>
            </SectionHead>
            <div className={styles.concepts}>
              {concepts.map((concept, i) => (
                <figure key={concept.id} className={styles.concept} data-reveal style={delay(i)}>
                  <div className={styles.conceptFrame}>
                    <Image src={concept.image} alt={`${concept.title} (concept design)`} width={1600} height={1000} sizes="(max-width: 900px) 100vw, 50vw" />
                    <span className={`mono ${styles.conceptTag}`}>Concept</span>
                  </div>
                  <figcaption>
                    <span className="eyebrow">{concept.tier}</span>
                    <strong>{concept.title}</strong>
                    <span>{concept.caption}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- offerings */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="What's included" title="What we" accent="do here." />
          <div className={site.featureGrid}>
            {service.offerings.map((offering, i) => (
              <article key={offering.title} className={site.feature} data-reveal style={delay(i)}>
                <span className={`mono ${styles.featureIndex}`}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={site.featureTitle}>{offering.title}</h3>
                <p className={site.featureText}>{offering.text}</p>
              </article>
            ))}
          </div>
          <div className={styles.options} data-reveal>
            <p className="eyebrow">Add-ons we can quote for</p>
            <ul>
              {service.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- deliverables + fit */}
      <section className={`${site.sectionTight} ${site.sectionRule}`}>
        <div className={`container ${site.twoCol}`}>
          <div data-reveal>
            <p className="eyebrow">You get</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              {service.deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div data-reveal style={delay(1)}>
            <p className="eyebrow">A good fit if</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              {service.goodFit.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- stages */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container">
          <SectionHead eyebrow="How it runs" title="Request to" accent="handover." />
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

      {/* ---------------------------------------------------- availability */}
      <section className={`${site.sectionTight} ${site.sectionRule}`}>
        <div className={`container ${site.twoCol}`}>
          <div data-reveal>
            <p className="eyebrow">We deliver this ourselves</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              {service.availability.now.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div data-reveal style={delay(1)}>
            <p className="eyebrow">Depends on a third party</p>
            <ul className={`${site.checkList} ${styles.partner}`} style={{ marginTop: 20 }}>
              {service.availability.partner.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ faqs */}
      <section className={`${site.section} ${site.sectionRule}`}>
        <div className="container" style={{ maxWidth: 980 }}>
          <p className="eyebrow" data-reveal>
            Questions
          </p>
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line-2)" }} data-reveal>
            {service.faqs.map((item) => (
              <details key={item.q} className={site.faqItem}>
                <summary>{item.q}</summary>
                <p className={site.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={site.sectionRule}>
        <Link href={`/services/${next.slug}`} className={`container ${styles.next}`}>
          <span className="eyebrow">Next service</span>
          <span className={`display ${styles.nextName}`}>
            {next.name} <Arrow size={40} />
          </span>
        </Link>
      </section>

      <Cta title={["Sound like", "your project?"]} text="Send a request. Asking costs nothing, and you'll get a written quote before anything starts." />
    </>
  );
}
