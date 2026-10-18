import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { serviceBySlug, services } from "@/lib/site-content";

import styles from "../services.module.css";

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const service = serviceBySlug((await params).slug);
  return service ? { title: service.name, description: service.summary } : {};
}

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const service = serviceBySlug((await params).slug);
  if (!service) notFound();
  const at = services.indexOf(service);
  const next = services[(at + 1) % services.length]!;

  return (
    <>
      <PageHero eyebrow={`Service ${service.index} / 0${services.length}`} title={service.headline} lede={service.intro}>
        <Link href="/commission" className={site.button} data-magnetic>
          Start a project <Arrow />
        </Link>
        <Link href="/services" className={site.buttonGhost} data-magnetic>
          All services
        </Link>
      </PageHero>

      <section className={site.section}>
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
        </div>
      </section>

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

      <section className={`${site.sectionRule}`}>
        <Link href={`/services/${next.slug}`} className={`container ${styles.next}`}>
          <span className="eyebrow">Next service</span>
          <span className={`display ${styles.nextName}`}>
            {next.name} <Arrow size={40} />
          </span>
        </Link>
      </section>

      <Cta />
    </>
  );
}
