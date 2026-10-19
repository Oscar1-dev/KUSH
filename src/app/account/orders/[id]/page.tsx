import Link from "next/link";
import { notFound } from "next/navigation";

import { ResumeOrderForm } from "@/components/account/commerce-forms";
import styles from "@/components/account/account.module.css";
import { money, orderLabel, providerLabel, type Order } from "@/lib/commerce";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime } from "@/lib/workspace";

export const metadata = { title: "Order" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await requireAccount();
  const { id } = await params;
  const { checkout } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let order: Order;
  try {
    ({ order } = await kushApi<{ order: Order }>(`/web/workspace/orders/${id}`, { token }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Stripe sends people back here; only the webhook marks an order paid,
  // so "success" can arrive a moment before the payment is confirmed.
  const banner =
    checkout === "success"
      ? order.status === "paid"
        ? { tone: styles.noticeSuccess, text: "Payment received. Thank you!" }
        : { tone: styles.badgeWarn, text: "Thanks! Stripe is confirming your payment. Refresh in a few seconds." }
      : checkout === "cancelled" && order.status === "pending"
        ? { tone: styles.badgeWarn, text: "Checkout was cancelled. Nothing was charged; you can try again below." }
        : null;

  return (
    <>
      <Link href="/account/orders" className={styles.rowMeta}>
        ← Orders
      </Link>
      {banner ? (
        <p className={`${styles.notice} ${banner.tone}`} role="status" style={{ marginTop: 20 }}>
          {banner.text}
        </p>
      ) : null}
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        ORDER #{order.number}
      </p>
      <h1 className={styles.title} style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}>
        {order.description}
      </h1>
      <p className={styles.rowMeta} style={{ marginBottom: 28 }}>
        Placed {dateTime.format(new Date(order.createdAt))}
        {order.paidAt ? ` · paid ${dateTime.format(new Date(order.paidAt))}` : ""}
      </p>

      <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}>
        <section className={styles.card}>
          <p className={styles.cardLabel}>SUMMARY</p>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Status</span>
            <span>{orderLabel[order.status]}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Price</span>
            <span>{money(order.subtotalPence, order.currency)}</span>
          </div>
          {order.creditAppliedPence ? (
            <div className={styles.row}>
              <span className={styles.rowMeta}>Store credit</span>
              <span>−{money(order.creditAppliedPence, order.currency)}</span>
            </div>
          ) : null}
          <div className={styles.row}>
            <span className={styles.rowMeta}>Charged to card</span>
            <span>{money(order.totalPence, order.currency)}</span>
          </div>
          {order.refundedPence ? (
            <div className={styles.row}>
              <span className={styles.rowMeta}>Refunded</span>
              <span>{money(order.refundedPence, order.currency)}</span>
            </div>
          ) : null}
          {order.commissionId ? (
            <div className={styles.row}>
              <span className={styles.rowMeta}>For</span>
              <Link href={`/account/commissions/${order.commissionId}`}>your commission</Link>
            </div>
          ) : null}
          {order.status === "pending" ? (
            <div style={{ marginTop: 18 }}>
              <ResumeOrderForm orderId={order.id} />
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <p className={styles.cardLabel}>PAYMENTS</p>
          {order.payments?.length ? (
            order.payments.map((payment, index) => (
              <div key={index} className={styles.row}>
                <span>
                  {providerLabel[payment.provider]}
                  <span className={styles.rowMeta} style={{ display: "block" }}>
                    {dateTime.format(new Date(payment.createdAt))}
                    {payment.refundedPence ? ` · ${money(payment.refundedPence)} refunded` : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  {money(payment.amountPence, order.currency)}
                  {payment.receiptUrl ? (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.rowMeta}
                      style={{ display: "block" }}
                    >
                      Receipt ↗
                    </a>
                  ) : null}
                </span>
              </div>
            ))
          ) : (
            <p className={styles.cardText}>No payment yet.</p>
          )}
        </section>
      </div>

      <p className={styles.fine} style={{ marginTop: 28 }}>
        Questions about this order? <Link href="/account/support/new">Open a support ticket</Link> and quote #{order.number}.
        See the <Link href="/refunds">refund policy</Link>.
      </p>
    </>
  );
}
