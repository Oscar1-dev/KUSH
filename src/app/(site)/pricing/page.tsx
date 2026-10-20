import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";

import { BuyProductForm } from "@/components/account/commerce-forms";
import { Arrow, Cta, PageHero, SectionHead } from "@/components/site/blocks";
import pages from "@/components/site/pages.module.css";
import site from "@/components/site/site.module.css";
import { fallbackCatalogue } from "@/lib/catalogue";
import { money } from "@/lib/commerce";
import { loadCatalogue, loadProducts } from "@/lib/server/catalogue";
import { currentAccount } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starting prices for every KUSH service, and products you can buy today.",
};

const fulfilmentTag: Record<string, string | null> = {
  in_house: null,
  partner_dependent: "With a partner",
  quote_only: "Quote only",
};

export default async function PricingPage() {
  const [live, shop, account] = await Promise.all([
    loadCatalogue(),
    loadProducts(),
    currentAccount().catch(() => null),
  ]);
  const catalogue = live?.length ? live : fallbackCatalogue;
  const products = shop?.products ?? [];

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={["Clear prices,", "no surprises."]}
        lede="Starting prices for everything we do. Every commission gets a written quote before any work or payment, and you only pay once you've accepted it."
      >
        <Link href="/commission" className={site.button} data-magnetic>
          Start a project <Arrow />
        </Link>
      </PageHero>

      {products.length ? (
        <section className={site.section}>
          <div className="container">
            <SectionHead eyebrow="Ready-made" title="Buy" accent="today." />
            <div className={pages.products}>
              {products.map((product) => (
                <article key={product.slug} className={pages.product} data-reveal>
                  <h3>{product.name}</h3>
                  {product.description ? <p>{product.description}</p> : null}
                  <p className={pages.productPrice}>{money(product.pricePence, product.currency)}</p>
                  {account ? (
                    <BuyProductForm
                      productSlug={product.slug}
                      requestId={randomUUID()}
                      label={`BUY · ${money(product.pricePence, product.currency)}`}
                    />
                  ) : (
                    <Link href="/sign-in?next=/account/orders" className={site.buttonGhost}>
                      Sign in to buy <Arrow />
                    </Link>
                  )}
                </article>
              ))}
            </div>
            <p className={pages.updated} style={{ marginTop: 18 }}>
              Card payments are handled by Stripe; KUSH never sees your card.
            </p>
          </div>
        </section>
      ) : null}

      <section className={site.section}>
        <div className="container">
          <SectionHead eyebrow="Commissions" title="Made" accent="for you." />
          {catalogue.map((service) => {
            const tag = fulfilmentTag[service.fulfilment ?? "in_house"];
            return (
              <div key={service.slug} className={pages.priceGroup} data-reveal>
                <div className={pages.priceHead}>
                  <div>
                    <h3 className={pages.priceName}>
                      {service.name}
                      {tag ? <span className={pages.tag}>{tag}</span> : null}
                    </h3>
                    <p className={pages.priceSummary}>{service.summary}</p>
                  </div>
                  <Link href={`/services/${service.slug}`} className={site.textLink}>
                    Details <Arrow />
                  </Link>
                </div>
                {service.offers.map((offer) => (
                  <div key={offer.id} className={pages.priceRow}>
                    <span className={pages.priceRowName}>
                      {offer.kind === "addon" ? "+ " : ""}
                      {offer.name}
                    </span>
                    {offer.description || offer.deliveryEstimate ? (
                      <span className={pages.priceRowMeta}>
                        {offer.description}
                        {offer.deliveryEstimate ? ` · usually ${offer.deliveryEstimate}` : ""}
                      </span>
                    ) : null}
                    <span className={pages.priceValue}>{offer.priceLabel}</span>
                  </div>
                ))}
              </div>
            );
          })}
          <p className={pages.updated}>
            Prices are in GBP. &quot;From&quot; prices are where most projects start; your quote reflects the actual scope.
            Third-party costs (domains, hosting, game server rental, stock assets) are paid to the provider. See the{" "}
            <Link href="/refunds">refund policy</Link> and <Link href="/terms">terms</Link>.
          </p>
        </div>
      </section>

      <Cta />
    </>
  );
}
