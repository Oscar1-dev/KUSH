import { Package } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Catalog {
  products: { id: string; slug: string; name: string; status: string; discordRoleId: string | null; activeOwners: number }[];
  orders: { id: string; provider: string; type: string; result: string; receivedAt: string; orderId: string | null; productSlug: string | null }[];
  paymentsLive: boolean;
}

export default async function StaffCatalog() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "operations.view")) return <p className={styles.lede}>Products and orders are for administrators.</p>;
  const { products, orders, paymentsLive } = await kushApi<Catalog>("/web/staff/catalog", { token: gate.token });
  const real = products.filter((p) => !p.slug.startsWith("test-"));
  return (
    <>
      <p className={styles.kicker}>PRODUCTS &amp; ORDERS</p>
      <h1 className={styles.title}>
        The <em>catalogue.</em>
      </h1>
      <p className={styles.lede}>
        Licensing, entitlements and Discord role sync are ready for KUSH&apos;s first product. Live payments are{" "}
        <strong>{paymentsLive ? "on" : "off"}</strong>: no payment provider is connected.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Products</h2>
        {real.length === 0 ? (
          <div className={styles.empty}>
            <Package size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
            <p className={styles.emptyTitle}>No products yet</p>
            <p className={styles.emptyText}>The first KUSH product will be added here once it is built.</p>
          </div>
        ) : (
          real.map((p) => (
            <div key={p.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{p.name}</p>
                <p className={styles.rowMeta}>
                  {p.slug} · {p.activeOwners} active owners {p.discordRoleId ? "· Discord role linked" : ""}
                </p>
              </div>
              <span className={styles.badge}>{p.status.toUpperCase()}</span>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Order events</h2>
        {orders.length === 0 ? <p className={styles.rowMeta}>No orders yet.</p> : null}
        {orders.map((o) => (
          <div key={o.id} className={styles.row} style={{ padding: "10px 0" }}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle} style={{ fontSize: 14 }}>
                {o.type} · {o.productSlug ?? "?"} {o.provider === "simulated" ? <span className={styles.badge}>TEST / SIMULATED</span> : null}
              </p>
              <p className={styles.rowMeta}>
                {dateTime.format(new Date(o.receivedAt))} · {o.result}
              </p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
