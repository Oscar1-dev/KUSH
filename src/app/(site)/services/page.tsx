import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import Marquee from "@/components/site/marquee";
import ServiceList from "@/components/site/service-list";
import site from "@/components/site/site.module.css";
import { countWord } from "@/lib/catalogue";
import { loadServices } from "@/lib/server/catalogue";
import { process } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Services",
  description: "Custom development, websites and web apps, desktop software, UI/UX design and branding from KUSH.",
};

export const revalidate = 60;

export default async function ServicesPage() {
  const services = await loadServices();
  return (
    <>
      <PageHero
        eyebrow="Services"
        title={[`${countWord(services.length)} things,`, "done properly."]}
        lede="Websites, apps, Discord bots, software, game servers, tech support, design and automation. Most projects use more than one, and that's the point: it's the same small team doing all of it."
      >
        <Link href="/commission" className={site.button} data-magnetic>
          Start a project <Arrow />
        </Link>
        <Link href="/work" className={site.buttonGhost} data-magnetic>
          See our work
        </Link>
      </PageHero>

      <section className={site.section}>
        <div className="container">
          <ServiceList services={services} />
        </div>
      </section>

      <Marquee words={["Design", "Build", "Launch", "Support"]} />

      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="Every project" title="Same process," accent="every time.">
            <p className={site.lede}>Whatever you&apos;re after, it runs through your KUSH account the same way.</p>
          </SectionHead>
          <ol className={site.process}>
            {process.map((step, i) => (
              <li key={step.step} className={site.processStep} data-reveal style={{ "--reveal-i": i } as React.CSSProperties}>
                <span className={`mono ${site.processNumber}`}>{step.step}</span>
                <h3 className={site.processTitle}>{step.title}</h3>
                <p className={site.processText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Cta />
    </>
  );
}
