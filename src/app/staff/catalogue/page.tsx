import Link from "next/link";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import type { CatalogueOffer, CatalogueService } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";

type StaffOffer = CatalogueOffer & { status: "published" | "archived" };
type StaffService = Omit<CatalogueService, "offers"> & { status: string; offers: StaffOffer[] };

const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toString());

export default async function StaffCatalogue() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "catalogue.manage")) return <p className={styles.lede}>Prices are managed by managers and administrators.</p>;
  const { services } = await kushApi<{ services: StaffService[] }>("/web/staff/catalogue", { token: gate.token });

  return (
    <>
      <p className={styles.kicker}>SERVICES &amp; PRICES</p>
      <h1 className={styles.title}>
        The price <em>list.</em>
      </h1>
      <p className={styles.lede}>
        These prices are what the website, <Link href="/pricing">pricing page</Link> and Discord show. Changes appear
        within a minute. They&apos;re starting prices: each commission still gets its own quote.
      </p>

      {services.map((service) => (
        <section key={service.id} className={styles.section}>
          <div className={styles.headerRow}>
            <h2 className={styles.sectionTitle}>{service.name}</h2>
            <span className={styles.rowMeta}>
              {service.status} · {service.fulfilment === "partner_dependent" ? "with a partner" : service.fulfilment === "quote_only" ? "quote only" : "in house"}
            </span>
          </div>
          {service.offers.map((offer) => (
            <details key={offer.id} className={styles.card} style={{ marginBottom: 10, opacity: offer.status === "archived" ? 0.55 : 1 }}>
              <summary className={styles.headerRow} style={{ cursor: "pointer", listStyle: "none" }}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {offer.kind === "addon" ? "+ " : ""}
                    {offer.name}
                  </p>
                  <p className={styles.rowMeta}>{offer.kind === "tier" ? `${offer.tierKey ?? ""} tier` : "add-on"}</p>
                </div>
                <span className={styles.badge}>{offer.status === "archived" ? "HIDDEN" : offer.priceLabel.toUpperCase()}</span>
              </summary>
              <div style={{ marginTop: 14 }} key={`${offer.pricing}-${offer.amountPence}-${offer.maxPence}-${offer.status}`}>
                <ActionForm action="saveOffer" hidden={{ offerId: offer.id }} submit="SAVE PRICE">
                  <div className={styles.formRow}>
                    <select name="pricing" className={styles.input} defaultValue={offer.pricing} aria-label="Pricing type">
                      <option value="fixed">Fixed price</option>
                      <option value="from">From (starting price)</option>
                      <option value="range">Range</option>
                      <option value="quote">Quoted individually</option>
                    </select>
                    <select name="status" className={styles.input} defaultValue={offer.status} aria-label="Shown on the website">
                      <option value="published">Shown</option>
                      <option value="archived">Hidden</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <input name="price" className={styles.input} defaultValue={pounds(offer.amountPence)} placeholder="£ (from / fixed / low end)" aria-label="Price in pounds" />
                    <input name="max" className={styles.input} defaultValue={pounds(offer.maxPence)} placeholder="£ high end (ranges only)" aria-label="Top of range in pounds" />
                  </div>
                </ActionForm>
              </div>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}
