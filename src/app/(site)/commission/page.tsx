import type { Metadata } from "next";
import Link from "next/link";

import { Arrow, PageHero, SectionHead } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";
import { currentAccount } from "@/lib/server/session";
import { process, services } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Send KUSH a commission request and get a quote in your account.",
};
export const dynamic = "force-dynamic";

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;
const formPath = "/account/commissions/new";

export default async function CommissionPage() {
  // Signed-in visitors go straight to the form; everyone else signs in first
  // and lands back on it.
  const account = await currentAccount().catch(() => null);
  const start = account ? formPath : `/sign-in?next=${encodeURIComponent(formPath)}`;

  return (
    <>
      <PageHero
        eyebrow="Start a project"
        title={["Let's build", "something."]}
        lede="Requests are free. Tell us what you're after and we'll come back with questions or a quote, right in your account."
      >
        <Link href={start} className={site.button} data-magnetic>
          {account ? "Open the request form" : "Sign in & start"} <Arrow />
        </Link>
        <Link href="/faq" className={site.buttonGhost} data-magnetic>
          Questions first?
        </Link>
      </PageHero>

      <section className={site.section}>
        <div className={`container ${site.twoCol}`}>
          <div data-reveal>
            <p className="eyebrow">Worth including</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              <li>What you want made, in a sentence or two</li>
              <li>Who it&apos;s for and what it needs to do</li>
              <li>Links or files for anything you like the look of</li>
              <li>Any deadline you&apos;re working towards</li>
              <li>A rough budget, if you have one in mind</li>
            </ul>
          </div>
          <div data-reveal style={delay(1)}>
            <p className="eyebrow">We can help with</p>
            <ul className={site.checkList} style={{ marginTop: 20 }}>
              {services.map((service) => (
                <li key={service.slug}>
                  <Link href={`/services/${service.slug}`}>{service.name}</Link>
                </li>
              ))}
            </ul>
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
          <div className={site.heroActions} style={{ marginTop: 48 }} data-reveal>
            <Link href={start} className={site.button} data-magnetic>
              {account ? "Open the request form" : "Sign in & start"} <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
