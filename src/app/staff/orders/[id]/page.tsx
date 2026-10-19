import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { money, orderLabel, providerLabel, type Order } from "@/lib/commerce";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Refund {
  amountPence: number;
  reason: string;
  status: "pending" | "succeeded" | "failed";
  createdAt: string;
}

export default async function StaffOrder({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "orders.view")) return <p className={styles.lede}>Orders are for managers and administrators.</p>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data: { order: Order; refunds: Refund[]; canRefund: boolean };
  try {
    data = await kushApi(`/web/staff/orders/${id}`, { token: gate.token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { order, refunds, canRefund } = data;
  const inFlight = refunds.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.amountPence, 0);
  const refundable = order.subtotalPence - order.refundedPence - inFlight;

  return (
    <>
      <Link href="/staff/orders" className={styles.rowMeta}>
        ← Orders
      </Link>
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        ORDER #{order.number} · {order.kind.toUpperCase()}
      </p>
      <h1 className={styles.title} style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}>
        {order.description}
      </h1>
      <p className={styles.rowMeta} style={{ marginBottom: 26 }}>
        {orderLabel[order.status]} · placed {dateTime.format(new Date(order.createdAt))}
        {order.paidAt ? ` · paid ${dateTime.format(new Date(order.paidAt))}` : ""}
        {order.commissionId ? (
          <>
            {" · "}
            <Link href={`/staff/commissions/${order.commissionId}`} style={{ textDecoration: "underline" }}>
              commission
            </Link>
          </>
        ) : null}
      </p>

      <div className={styles.split}>
        <section className={styles.card}>
          <p className={styles.cardLabel}>MONEY</p>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Price</span>
            <span>{money(order.subtotalPence)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Store credit used</span>
            <span>{money(order.creditAppliedPence)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Charged</span>
            <span>{money(order.totalPence)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Refunded</span>
            <span>{money(order.refundedPence)}</span>
          </div>
          <p className={styles.cardLabel} style={{ marginTop: 22 }}>
            PAYMENTS
          </p>
          {order.payments?.length ? (
            order.payments.map((payment, index) => (
              <div key={index} className={styles.row}>
                <span>
                  {providerLabel[payment.provider]}
                  {payment.note ? <span className={styles.rowMeta} style={{ display: "block" }}>{payment.note}</span> : null}
                </span>
                <span style={{ textAlign: "right" }}>
                  {money(payment.amountPence)}
                  {payment.receiptUrl ? (
                    <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" className={styles.rowMeta} style={{ display: "block" }}>
                      Stripe receipt ↗
                    </a>
                  ) : null}
                </span>
              </div>
            ))
          ) : (
            <p className={styles.cardText}>No payment recorded.</p>
          )}
          {refunds.length ? (
            <>
              <p className={styles.cardLabel} style={{ marginTop: 22 }}>
                REFUNDS
              </p>
              {refunds.map((refund, index) => (
                <div key={index} className={styles.row}>
                  <span>
                    {refund.reason}
                    <span className={styles.rowMeta} style={{ display: "block" }}>
                      {dateTime.format(new Date(refund.createdAt))}
                    </span>
                  </span>
                  <span>
                    {money(refund.amountPence)} · {refund.status}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }}>
          {canRefund && refundable > 0 && ["paid", "partially_refunded"].includes(order.status) ? (
            <div className={styles.card} key={`refund-${order.refundedPence}-${refunds.length}`}>
              <p className={styles.cardLabel}>REFUND</p>
              <p className={styles.rowMeta}>
                Up to {money(refundable)}. Card payments go back to the card through Stripe; credit goes back as credit.
                This can&apos;t be undone.
              </p>
              <ActionForm action="refund" hidden={{ orderId: order.id, requestId: randomUUID() }} submit="SEND REFUND" tone="danger">
                <input
                  name="price"
                  className={styles.input}
                  required
                  defaultValue={(refundable / 100).toString()}
                  aria-label="Amount to refund in pounds"
                />
                <input name="reason" className={styles.input} required minLength={3} maxLength={500} placeholder="Reason (kept in the audit log)" aria-label="Refund reason" />
                <label className={styles.rowMeta}>
                  <input type="checkbox" name="confirm" value="yes" /> I&apos;ve checked the amount
                </label>
              </ActionForm>
            </div>
          ) : (
            <div className={styles.card}>
              <p className={styles.cardLabel}>REFUND</p>
              <p className={styles.rowMeta}>
                {!canRefund
                  ? "Refunds need the refunds permission (administrators)."
                  : refundable <= 0
                    ? "Nothing left to refund."
                    : "Only paid orders can be refunded."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
