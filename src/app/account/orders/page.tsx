import Link from "next/link";
import { ArrowUpRight, CreditCard } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { money, orderLabel, type Order } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateOnly } from "@/lib/workspace";

export const metadata = { title: "Orders & payments" };

export default async function OrdersPage() {
  const { token } = await requireAccount();
  const [{ orders }, credit] = await Promise.all([
    kushApi<{ orders: Order[] }>("/web/workspace/orders", { token }),
    kushApi<{ balancePence: number; spendable?: boolean }>("/web/workspace/credit", { token }),
  ]);
  const paid = orders.filter((o) => ["paid", "partially_refunded"].includes(o.status));

  return (
    <>
      <p className={styles.kicker}>ORDERS &amp; PAYMENTS</p>
      <h1 className={styles.title}>
        Your <em>orders.</em>
      </h1>
      <p className={styles.lede}>Everything you&apos;ve bought or paid for, with receipts.</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>PAID ORDERS</p>
          <p className={styles.cardValue}>{paid.length}</p>
        </div>
        <Link href="/account/credit" className={styles.card}>
          <p className={styles.cardLabel}>STORE CREDIT</p>
          <p className={styles.cardValue}>{money(credit.balancePence)}</p>
          <p className={styles.cardText}>
            {credit.spendable ? "Used automatically at checkout." : "Recorded on your account; not spendable yet."}
          </p>
        </Link>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Order history</h2>
        {orders.length === 0 ? (
          <div className={styles.empty}>
            <CreditCard size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
            <p className={styles.emptyTitle}>No orders yet</p>
            <p className={styles.emptyText}>
              Products you buy and commission payments will show here, each with its receipt.
            </p>
            <Link href="/pricing" className={styles.button} style={{ marginTop: 16 }}>
              SEE PRICES <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          orders.map((order) => (
            <Link key={order.id} href={`/account/orders/${order.id}`} className={styles.listLink}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  #{order.number} · {order.description}
                </p>
                <p className={styles.rowMeta}>
                  {money(order.subtotalPence, order.currency)} · {dateOnly.format(new Date(order.createdAt))}
                </p>
              </div>
              <span
                className={`${styles.badge} ${order.status === "pending" ? styles.badgeWarn : order.status === "paid" ? styles.badgeOn : ""}`}
              >
                {orderLabel[order.status].toUpperCase()}
              </span>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
