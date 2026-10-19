import Link from "next/link";
import { CreditCard } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { money, orderLabel, type Order, type OrderStatus } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

const filters: (OrderStatus | "all")[] = ["all", "paid", "pending", "partially_refunded", "refunded", "expired"];

export default async function StaffOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "orders.view")) return <p className={styles.lede}>Orders are for managers and administrators.</p>;
  const { status } = await searchParams;
  const chosen = filters.includes(status as OrderStatus) && status !== "all" ? (status as OrderStatus) : null;
  const { orders } = await kushApi<{ orders: Order[] }>(`/web/staff/orders${chosen ? `?status=${chosen}` : ""}`, {
    token: gate.token,
  });

  return (
    <>
      <p className={styles.kicker}>ORDERS &amp; PAYMENTS</p>
      <h1 className={styles.title}>
        Every <em>order.</em>
      </h1>
      <p className={styles.lede}>
        Product purchases and commission payments. Only a verified Stripe webhook (or a recorded offline payment)
        marks anything paid.
      </p>
      <div className={styles.formRow} style={{ flexWrap: "wrap", marginBottom: 20 }}>
        {filters.map((filter) => (
          <Link
            key={filter}
            href={filter === "all" ? "/staff/orders" : `/staff/orders?status=${filter}`}
            className={`${styles.badge} ${(chosen ?? "all") === filter ? styles.badgeOn : ""}`}
          >
            {filter === "all" ? "ALL" : orderLabel[filter].toUpperCase()}
          </Link>
        ))}
      </div>
      {orders.length === 0 ? (
        <div className={styles.empty}>
          <CreditCard size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No orders here</p>
        </div>
      ) : (
        orders.map((order) => (
          <Link key={order.id} href={`/staff/orders/${order.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                #{order.number} · {order.description}
              </p>
              <p className={styles.rowMeta}>
                {order.customerName} · {money(order.subtotalPence)}
                {order.creditAppliedPence ? ` (${money(order.creditAppliedPence)} credit)` : ""} ·{" "}
                {dateTime.format(new Date(order.createdAt))}
              </p>
            </div>
            <span className={`${styles.badge} ${order.status === "paid" ? styles.badgeOn : order.status === "pending" ? styles.badgeWarn : ""}`}>
              {orderLabel[order.status].toUpperCase()}
            </span>
          </Link>
        ))
      )}
    </>
  );
}
