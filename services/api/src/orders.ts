import type Stripe from "stripe";
import type { Pool, PoolClient } from "@kush/database";
import { applyCredit, creditBalance } from "./credit.js";
import { enqueueRoleSync } from "./entitlement-service.js";
import { enqueueNotification } from "./notifications.js";
import type { PaymentGateway } from "./stripe-gateway.js";
import { SupportError } from "./support-service.js";

/**
 * Orders and payments. The server decides every price: the client only says
 * what it wants to buy. An order becomes paid only through a verified Stripe
 * webhook, a zero-total store-credit order settled here, or an offline
 * payment a permitted staff member records (audited, labelled offline).
 */

type Tx = Pick<PoolClient, "query">;
const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};

export interface OrderRow {
  id: string;
  number: number;
  kind: "product" | "commission";
  description: string;
  status: string;
  currency: string;
  subtotalPence: number;
  creditAppliedPence: number;
  totalPence: number;
  refundedPence: number;
  productId: string | null;
  commissionId: string | null;
  customerId: string;
  paidAt: string | null;
  createdAt: string;
}
const orderColumns = `id, number, kind, description, status, currency, subtotal_pence AS "subtotalPence",
  credit_applied_pence AS "creditAppliedPence", total_pence AS "totalPence", refunded_pence AS "refundedPence",
  product_id AS "productId", commission_id AS "commissionId", customer_id AS "customerId",
  paid_at AS "paidAt", created_at AS "createdAt"`;

const site = () => process.env.KUSH_SITE_URL ?? "http://localhost:3000";

export class OrderService {
  constructor(
    private readonly pool: Pool,
    private readonly gateway: PaymentGateway,
  ) {}

  private async tx<T>(work: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await work(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }

  private async audit(
    c: Tx,
    tenantId: string,
    actorId: string | null,
    action: string,
  ) {
    await c.query(
      "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,$3)",
      [tenantId, actorId, action],
    );
  }

  // ------------------------------------------------------------- checkout

  /**
   * Creates a pending order (reserving any credit used) and, if anything is
   * left to pay, a Stripe Checkout Session. Idempotent per requestId.
   */
  private async checkout(
    tenantId: string,
    userId: string,
    requestId: string,
    useCredit: boolean,
    line: {
      kind: "product" | "commission";
      productId?: string;
      commissionId?: string;
      quoteId?: string;
      description: string;
      pricePence: number;
      currency: string;
    },
  ) {
    const existing = (
      await this.pool.query<OrderRow & { stripeSession: string | null }>(
        `SELECT ${orderColumns}, stripe_checkout_session_id AS "stripeSession" FROM orders WHERE tenant_id=$1 AND customer_id=$2 AND create_request_id=$3`,
        [tenantId, userId, requestId],
      )
    ).rows[0];
    if (existing) return this.resume(existing);
    if (line.pricePence > 0 && !this.gateway.configured && !useCredit)
      fail(503, "Card payments aren't switched on yet");

    const order = await this.tx(async (c) => {
      const number = (
        await c.query<{ number: number }>(
          "UPDATE support_tenants SET next_order_number=next_order_number+1 WHERE id=$1 RETURNING next_order_number-1 AS number",
          [tenantId],
        )
      ).rows[0]!.number;
      const balance = useCredit ? await creditBalance(c, tenantId, userId) : 0;
      const credit = Math.min(balance, line.pricePence);
      const total = line.pricePence - credit;
      if (total > 0 && !this.gateway.configured)
        fail(
          503,
          "Card payments aren't switched on yet. You can pay in full with store credit, or wait until card payments go live",
        );
      const row = (
        await c.query<OrderRow>(
          `INSERT INTO orders(tenant_id, number, customer_id, kind, product_id, commission_id, quote_id, description, currency,
             subtotal_pence, credit_applied_pence, total_pence, create_request_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${orderColumns}`,
          [
            tenantId,
            number,
            userId,
            line.kind,
            line.productId ?? null,
            line.commissionId ?? null,
            line.quoteId ?? null,
            line.description,
            line.currency,
            line.pricePence,
            credit,
            total,
            requestId,
          ],
        )
      ).rows[0]!;
      if (credit > 0)
        await applyCredit(c, {
          tenantId,
          userId,
          amountPence: -credit,
          kind: "purchase",
          idempotencyKey: `order:${row.id}:reserve`,
          reference: `Order #${row.number}`,
        });
      return row;
    });

    if (order.totalPence === 0) {
      // Fully covered by credit: settle now, server-side.
      await this.settle(tenantId, order.id, {
        provider: "store_credit",
        amountPence: order.creditAppliedPence,
        reference: `credit:${order.id}`,
      });
      return { order: await this.get(tenantId, order.id), checkoutUrl: null };
    }
    try {
      const session = await this.gateway.createCheckoutSession({
        orderId: order.id,
        orderNumber: order.number,
        tenantId,
        description: order.description,
        amountPence: order.totalPence,
        currency: order.currency,
        successUrl: `${site()}/account/orders/${order.id}?checkout=success`,
        cancelUrl: `${site()}/account/orders/${order.id}?checkout=cancelled`,
        idempotencyKey: `kush-order-${order.id}`,
      });
      await this.pool.query(
        "UPDATE orders SET stripe_checkout_session_id=$3, updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, order.id, session.id],
      );
      return { order, checkoutUrl: session.url };
    } catch (error) {
      // Couldn't reach Stripe: cancel the order and give the credit back.
      await this.cancelPending(
        tenantId,
        order.id,
        "Checkout could not be started",
      );
      throw error;
    }
  }

  /** A retried checkout request returns the same order and session. */
  private async resume(order: OrderRow & { stripeSession: string | null }) {
    if (order.status !== "pending" || !order.stripeSession)
      return { order, checkoutUrl: null };
    return {
      order,
      checkoutUrl: await this.gateway.checkoutUrl(order.stripeSession),
    };
  }

  async checkoutProduct(
    tenantId: string,
    userId: string,
    input: { productSlug: string; requestId: string; useCredit: boolean },
  ) {
    const product = (
      await this.pool.query<{
        id: string;
        name: string;
        price_pence: number | null;
        currency: string;
        status: string;
        visibility: string;
      }>(
        "SELECT id, name, price_pence, currency, status, visibility FROM products WHERE tenant_id=$1 AND slug=$2",
        [tenantId, input.productSlug],
      )
    ).rows[0];
    if (
      !product ||
      product.status !== "active" ||
      product.visibility === "hidden"
    )
      fail(404, "That product isn't available");
    if (product!.price_pence === null)
      fail(409, "That product doesn't have a price yet");
    return this.checkout(tenantId, userId, input.requestId, input.useCredit, {
      kind: "product",
      productId: product!.id,
      description: product!.name,
      pricePence: product!.price_pence!,
      currency: product!.currency,
    });
  }

  async checkoutQuote(
    tenantId: string,
    userId: string,
    input: {
      commissionId: string;
      quoteId: string;
      requestId: string;
      useCredit: boolean;
    },
  ) {
    const row = (
      await this.pool.query<{
        title: string;
        status: string;
        requester_id: string;
        quote_status: string;
        amount_pence: number | null;
      }>(
        `SELECT r.title, r.status, r.requester_id, q.status AS quote_status, q.amount_pence
         FROM commercial_requests r JOIN commission_quotes q ON q.request_id=r.id AND q.tenant_id=r.tenant_id
         WHERE r.tenant_id=$1 AND r.id=$2 AND q.id=$3 AND r.kind='commission'`,
        [tenantId, input.commissionId, input.quoteId],
      )
    ).rows[0];
    // Someone else's commission looks exactly like a missing one.
    if (!row || row.requester_id !== userId) fail(404, "Commission not found");
    if (row!.quote_status !== "accepted")
      fail(409, "Accept the quote before paying");
    if (!["payment_pending", "accepted"].includes(row!.status))
      fail(409, "This commission isn't waiting for payment");
    if (!row!.amount_pence)
      fail(
        409,
        "This quote doesn't have a payable amount yet. The team will update it",
      );
    const paid = await this.pool.query(
      "SELECT 1 FROM orders WHERE tenant_id=$1 AND commission_id=$2 AND quote_id=$3 AND status IN ('paid','partially_refunded')",
      [tenantId, input.commissionId, input.quoteId],
    );
    if (paid.rowCount) fail(409, "This quote has already been paid");
    return this.checkout(tenantId, userId, input.requestId, input.useCredit, {
      kind: "commission",
      commissionId: input.commissionId,
      quoteId: input.quoteId,
      description: `Commission: ${row!.title}`.slice(0, 300),
      pricePence: row!.amount_pence!,
      currency: "GBP",
    });
  }

  // ------------------------------------------------------- settlement

  /** Marks a pending order paid, once. Every payment path ends here. */
  async settle(
    tenantId: string,
    orderId: string,
    payment: {
      provider: "stripe" | "store_credit" | "offline";
      amountPence: number;
      reference: string;
      paymentIntentId?: string | null;
      receiptUrl?: string | null;
      recordedBy?: string | null;
      note?: string | null;
    },
    c?: Tx,
  ) {
    const run = async (t: Tx) => {
      const order = (
        await t.query<OrderRow>(
          `SELECT ${orderColumns} FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantId, orderId],
        )
      ).rows[0];
      if (!order) return "missing" as const;
      if (
        order.status === "paid" ||
        order.status === "partially_refunded" ||
        order.status === "refunded"
      )
        return "already" as const;
      if (!["pending", "expired", "failed"].includes(order.status))
        return "ignored" as const;
      if (
        payment.provider !== "store_credit" &&
        payment.amountPence !== order.totalPence
      )
        // Amount mismatch: never mark paid on a different amount.
        return "mismatch" as const;
      await t.query(
        `UPDATE orders SET status='paid', paid_at=now(), stripe_payment_intent_id=COALESCE($3, stripe_payment_intent_id), updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId, orderId, payment.paymentIntentId ?? null],
      );
      // If an expired order is paid late (rare), its released credit is re-reserved.
      if (order.status !== "pending" && order.creditAppliedPence > 0)
        await applyCredit(t, {
          tenantId,
          userId: order.customerId,
          amountPence: -order.creditAppliedPence,
          kind: "purchase",
          idempotencyKey: `order:${order.id}:rereserve`,
          reference: `Order #${order.number}`,
        });
      if (payment.amountPence > 0)
        await t.query(
          `INSERT INTO payments(tenant_id, order_id, provider, amount_pence, provider_reference, receipt_url, recorded_by, note)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (provider, provider_reference) DO NOTHING`,
          [
            tenantId,
            orderId,
            payment.provider,
            payment.amountPence,
            payment.reference,
            payment.receiptUrl ?? null,
            payment.recordedBy ?? null,
            payment.note ?? null,
          ],
        );
      if (order.creditAppliedPence > 0 && payment.provider !== "store_credit")
        await t.query(
          `INSERT INTO payments(tenant_id, order_id, provider, amount_pence, provider_reference)
           VALUES($1,$2,'store_credit',$3,$4) ON CONFLICT (provider, provider_reference) DO NOTHING`,
          [tenantId, orderId, order.creditAppliedPence, `credit:${orderId}`],
        );
      if (order.kind === "commission" && order.commissionId)
        await t.query(
          `UPDATE commercial_requests SET status='paid', version=version+1, updated_at=now()
           WHERE tenant_id=$1 AND id=$2 AND status IN ('payment_pending','accepted')`,
          [tenantId, order.commissionId],
        );
      if (order.kind === "product" && order.productId) {
        await t.query(
          `INSERT INTO entitlements(tenant_id,user_id,product_id,status,source,source_reference,status_reason)
           VALUES($1,$2,$3,'active','provider',$4,'Purchased')
           ON CONFLICT (tenant_id,source,source_reference) DO UPDATE SET status='active', updated_at=now()`,
          [tenantId, order.customerId, order.productId, `order:${order.id}`],
        );
        const link = (
          await t.query<{ discord_user_id: string }>(
            "SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified'",
            [tenantId, order.customerId],
          )
        ).rows[0];
        if (link)
          await enqueueRoleSync(t, tenantId, link.discord_user_id, "purchase");
      }
      for (const audience of ["staff", "customer"])
        await enqueueNotification(
          t,
          tenantId,
          "order.paid",
          orderId,
          { provider: payment.provider, audience },
          `order.paid:${orderId}:${audience}`,
        );
      await this.audit(
        t,
        tenantId,
        payment.recordedBy ?? null,
        `order.paid.${payment.provider}`,
      );
      return "paid" as const;
    };
    return c ? run(c) : this.tx(run);
  }

  /** Cancels or expires a pending order and returns any reserved credit. */
  async cancelPending(
    tenantId: string,
    orderId: string,
    _why: string,
    status: "cancelled" | "expired" = "cancelled",
    c?: Tx,
  ) {
    const run = async (t: Tx) => {
      const order = (
        await t.query<OrderRow>(
          `SELECT ${orderColumns} FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantId, orderId],
        )
      ).rows[0];
      if (!order || order.status !== "pending") return false;
      await t.query(
        "UPDATE orders SET status=$3, updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, orderId, status],
      );
      if (order.creditAppliedPence > 0)
        await applyCredit(t, {
          tenantId,
          userId: order.customerId,
          amountPence: order.creditAppliedPence,
          kind: "purchase_release",
          idempotencyKey: `order:${order.id}:release`,
          reference: `Order #${order.number}`,
        });
      return true;
    };
    return c ? run(c) : this.tx(run);
  }

  // ------------------------------------------------------------ webhook

  /**
   * Processes one verified Stripe event exactly once. The event row is
   * inserted first (primary key = Stripe event ID), so replays and
   * duplicate deliveries are no-ops.
   */
  async handleStripeEvent(event: Stripe.Event) {
    return this.tx(async (c) => {
      const inserted = await c.query(
        `INSERT INTO stripe_events(id, type, livemode, created_at, payload) VALUES($1,$2,$3,to_timestamp($4),$5)
         ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.type,
          event.livemode,
          event.created,
          JSON.stringify(event),
        ],
      );
      if (!inserted.rowCount) return "duplicate";
      const result = await this.apply(c, event);
      await c.query(
        "UPDATE stripe_events SET processed_at=now(), result=$2 WHERE id=$1",
        [event.id, result],
      );
      return result;
    });
  }

  private async apply(c: PoolClient, event: Stripe.Event): Promise<string> {
    const order = async (
      id: string | null | undefined,
      tenantId: string | null | undefined,
    ) => {
      if (!id || !tenantId) return null;
      return (
        (
          await c.query<
            OrderRow & { tenantId: string; session: string | null }
          >(
            `SELECT ${orderColumns}, tenant_id AS "tenantId", stripe_checkout_session_id AS session FROM orders WHERE id=$1 AND tenant_id=$2`,
            [id, tenantId],
          )
        ).rows[0] ?? null
      );
    };
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const found = await order(
          session.metadata?.kush_order_id,
          session.metadata?.kush_tenant_id,
        );
        if (!found) return "unknown order";
        // The session must be the one we created for this order.
        if (found.session && found.session !== session.id)
          return "session mismatch";
        if (session.payment_status !== "paid")
          return `not paid (${session.payment_status})`;
        if (
          session.amount_total !== found.totalPence ||
          session.currency?.toUpperCase() !== found.currency
        )
          return "amount mismatch";
        const intent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        const receipt = intent
          ? await this.gateway.receiptUrl(intent).catch(() => null)
          : null;
        return this.settle(
          found.tenantId,
          found.id,
          {
            provider: "stripe",
            amountPence: session.amount_total ?? 0,
            reference: intent ?? session.id,
            paymentIntentId: intent,
            receiptUrl: receipt,
          },
          c,
        );
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const found = await order(
          session.metadata?.kush_order_id,
          session.metadata?.kush_tenant_id,
        );
        if (!found) return "unknown order";
        const done = await this.cancelPending(
          found.tenantId,
          found.id,
          event.type,
          event.type === "checkout.session.expired" ? "expired" : "cancelled",
          c,
        );
        if (event.type === "checkout.session.async_payment_failed" && done)
          await c.query("UPDATE orders SET status='failed' WHERE id=$1", [
            found.id,
          ]);
        return done ? "released" : "no change";
      }
      case "charge.refunded": {
        // Refunds made in the Stripe dashboard are reconciled here too.
        const charge = event.data.object as Stripe.Charge;
        const intent =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        if (!intent) return "no payment intent";
        const payment = (
          await c.query<{
            id: string;
            tenant_id: string;
            order_id: string;
            refunded_pence: number;
          }>(
            "SELECT id, tenant_id, order_id, refunded_pence FROM payments WHERE provider='stripe' AND provider_reference=$1 FOR UPDATE",
            [intent],
          )
        ).rows[0];
        if (!payment) return "unknown payment";
        // Our own refunds still being booked are not "new" refunds: the
        // request that made them records them (under this same row lock).
        const inFlight = Number(
          (
            await c.query<{ n: string }>(
              "SELECT COALESCE(sum(amount_pence),0) AS n FROM refunds WHERE payment_id=$1 AND status='pending'",
              [payment.id],
            )
          ).rows[0]!.n,
        );
        const fresh =
          charge.amount_refunded - payment.refunded_pence - inFlight;
        if (fresh <= 0) return "already reconciled";
        await this.recordRefunded(
          c,
          payment.tenant_id,
          payment.order_id,
          payment.id,
          fresh,
        );
        return "refund reconciled";
      }
      default:
        return "ignored";
    }
  }

  /** Books a refunded amount against a payment and its order. */
  private async recordRefunded(
    c: Tx,
    tenantId: string,
    orderId: string,
    paymentId: string,
    amountPence: number,
  ) {
    await c.query(
      "UPDATE payments SET refunded_pence=refunded_pence+$2 WHERE id=$1",
      [paymentId, amountPence],
    );
    const order = (
      await c.query<{
        refunded: number;
        subtotal: number;
        commission_id: string | null;
        kind: string;
      }>(
        `UPDATE orders SET refunded_pence=refunded_pence+$3, updated_at=now(),
           status=CASE WHEN refunded_pence+$3 >= subtotal_pence THEN 'refunded' ELSE 'partially_refunded' END
         WHERE tenant_id=$1 AND id=$2 RETURNING refunded_pence AS refunded, subtotal_pence AS subtotal, commission_id, kind`,
        [tenantId, orderId, amountPence],
      )
    ).rows[0]!;
    if (order.refunded >= order.subtotal) {
      if (order.commission_id)
        await c.query(
          "UPDATE commercial_requests SET status='refunded', version=version+1, updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [tenantId, order.commission_id],
        );
      await c.query(
        "UPDATE entitlements SET status='refunded', updated_at=now() WHERE tenant_id=$1 AND source='provider' AND source_reference=$2",
        [tenantId, `order:${orderId}`],
      );
    }
    for (const audience of ["staff", "customer"])
      await enqueueNotification(
        c,
        tenantId,
        "order.refunded",
        orderId,
        { amountPence: String(amountPence), audience },
        `order.refunded:${orderId}:${paymentId}:${order.refunded}:${audience}`,
      );
  }

  // ------------------------------------------------------------ refunds

  async refund(
    tenantId: string,
    staffUserId: string,
    input: {
      orderId: string;
      amountPence: number;
      reason: string;
      requestId: string;
    },
  ) {
    const prior = (
      await this.pool.query<{ status: string }>(
        "SELECT status FROM refunds WHERE create_request_id=$1",
        [input.requestId],
      )
    ).rows[0];
    if (prior) return { status: prior.status, duplicate: true };
    // Lock the order, pick the payments to refund (card first, then credit).
    const plan = await this.tx(async (c) => {
      const order = (
        await c.query<OrderRow>(
          `SELECT ${orderColumns} FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantId, input.orderId],
        )
      ).rows[0];
      if (!order) fail(404, "Order not found");
      // A double-click that raced past the check above: now serialised by
      // the order lock, so look again.
      const raced = (
        await c.query<{ status: string }>(
          "SELECT status FROM refunds WHERE create_request_id=$1",
          [input.requestId],
        )
      ).rows[0];
      if (raced) return { duplicate: raced.status };
      if (!["paid", "partially_refunded"].includes(order!.status))
        fail(409, "Only paid orders can be refunded");
      const inFlight = Number(
        (
          await c.query<{ n: string }>(
            "SELECT COALESCE(sum(r.amount_pence),0) AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1 AND r.status='pending'",
            [input.orderId],
          )
        ).rows[0]!.n,
      );
      const left = order!.subtotalPence - order!.refundedPence - inFlight;
      if (input.amountPence <= 0 || input.amountPence > left)
        fail(400, `You can refund up to ${(left / 100).toFixed(2)}`);
      const payments = (
        await c.query<{
          id: string;
          provider: string;
          amount_pence: number;
          refunded_pence: number;
          provider_reference: string;
        }>(
          // Refunds still in flight count as spent, so two staff refunding at
          // once can't both take the same money.
          `SELECT p.id, p.provider, p.amount_pence, p.provider_reference,
                  p.refunded_pence + COALESCE((SELECT sum(r.amount_pence) FROM refunds r WHERE r.payment_id=p.id AND r.status='pending'),0)::int AS refunded_pence
           FROM payments p WHERE p.order_id=$1 ORDER BY (p.provider='stripe') DESC, p.created_at FOR UPDATE OF p`,
          [input.orderId],
        )
      ).rows;
      let remaining = input.amountPence;
      const parts: {
        paymentId: string;
        provider: string;
        reference: string;
        amount: number;
        refundId: string;
      }[] = [];
      for (const payment of payments) {
        if (!remaining) break;
        const amount = Math.min(
          remaining,
          payment.amount_pence - payment.refunded_pence,
        );
        if (amount <= 0) continue;
        const refundId = (
          await c.query<{ id: string }>(
            "INSERT INTO refunds(tenant_id, payment_id, amount_pence, reason, requested_by, create_request_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              tenantId,
              payment.id,
              amount,
              input.reason,
              staffUserId,
              parts.length ? crypto.randomUUID() : input.requestId,
            ],
          )
        ).rows[0]!.id;
        parts.push({
          paymentId: payment.id,
          provider: payment.provider,
          reference: payment.provider_reference,
          amount,
          refundId,
        });
        remaining -= amount;
      }
      await this.audit(c, tenantId, staffUserId, "order.refund.requested");
      return { order: order!, parts };
    });
    if ("duplicate" in plan) return { status: plan.duplicate, duplicate: true };

    for (const part of plan.parts) {
      if (part.provider === "stripe") {
        const refund = await this.gateway
          .createRefund({
            paymentIntentId: part.reference,
            amountPence: part.amount,
            idempotencyKey: `kush-refund-${part.refundId}`,
            reason: input.reason,
          })
          .catch(async (error: unknown) => {
            await this.pool.query(
              "UPDATE refunds SET status='failed', updated_at=now() WHERE id=$1",
              [part.refundId],
            );
            throw error;
          });
        await this.tx(async (c) => {
          await c.query(
            "UPDATE refunds SET status='succeeded', stripe_refund_id=$2, updated_at=now() WHERE id=$1",
            [part.refundId, refund.id],
          );
          await this.recordRefunded(
            c,
            tenantId,
            input.orderId,
            part.paymentId,
            part.amount,
          );
        });
      } else {
        await this.tx(async (c) => {
          if (part.provider === "store_credit")
            // Credit paid for it, so credit is what comes back.
            await applyCredit(c, {
              tenantId,
              userId: plan.order.customerId,
              amountPence: part.amount,
              kind: "refund",
              idempotencyKey: `refund:${part.refundId}`,
              reference: `Order #${plan.order.number}`,
              createdBy: staffUserId,
            });
          await c.query(
            "UPDATE refunds SET status='succeeded', updated_at=now() WHERE id=$1",
            [part.refundId],
          );
          await this.recordRefunded(
            c,
            tenantId,
            input.orderId,
            part.paymentId,
            part.amount,
          );
        });
      }
    }
    return { status: "succeeded", duplicate: false };
  }

  // ------------------------------------------------------ offline payments

  /** Staff record a payment made outside Stripe (e.g. bank transfer). */
  async recordOffline(
    tenantId: string,
    staffUserId: string,
    input: {
      commissionId: string;
      quoteId: string;
      amountPence: number;
      note: string;
      requestId: string;
    },
  ) {
    const quote = (
      await this.pool.query<{
        requester_id: string;
        title: string;
        status: string;
        amount_pence: number | null;
        quote_status: string;
      }>(
        `SELECT r.requester_id, r.title, r.status, q.amount_pence, q.status AS quote_status
         FROM commercial_requests r JOIN commission_quotes q ON q.request_id=r.id AND q.tenant_id=r.tenant_id
         WHERE r.tenant_id=$1 AND r.id=$2 AND q.id=$3`,
        [tenantId, input.commissionId, input.quoteId],
      )
    ).rows[0];
    if (!quote) fail(404, "Commission not found");
    if (quote!.quote_status !== "accepted")
      fail(409, "The customer hasn't accepted this quote");
    const order = await this.tx(async (c) => {
      const prior = (
        await c.query<{ id: string }>(
          "SELECT id FROM orders WHERE tenant_id=$1 AND create_request_id=$2",
          [tenantId, input.requestId],
        )
      ).rows[0];
      if (prior) return prior.id;
      const number = (
        await c.query<{ number: number }>(
          "UPDATE support_tenants SET next_order_number=next_order_number+1 WHERE id=$1 RETURNING next_order_number-1 AS number",
          [tenantId],
        )
      ).rows[0]!.number;
      const id = (
        await c.query<{ id: string }>(
          `INSERT INTO orders(tenant_id, number, customer_id, kind, commission_id, quote_id, description, subtotal_pence, total_pence, create_request_id)
           VALUES($1,$2,$3,'commission',$4,$5,$6,$7,$7,$8) RETURNING id`,
          [
            tenantId,
            number,
            quote!.requester_id,
            input.commissionId,
            input.quoteId,
            `Commission: ${quote!.title}`.slice(0, 300),
            input.amountPence,
            input.requestId,
          ],
        )
      ).rows[0]!.id;
      await this.settle(
        tenantId,
        id,
        {
          provider: "offline",
          amountPence: input.amountPence,
          reference: `offline:${id}`,
          recordedBy: staffUserId,
          note: input.note,
        },
        c,
      );
      return id;
    });
    return this.get(tenantId, order);
  }

  // -------------------------------------------------------------- reads

  async get(tenantId: string, orderId: string, customerId?: string) {
    const order = (
      await this.pool.query<OrderRow>(
        `SELECT ${orderColumns} FROM orders WHERE tenant_id=$1 AND id=$2 ${customerId ? "AND customer_id=$3" : ""}`,
        customerId ? [tenantId, orderId, customerId] : [tenantId, orderId],
      )
    ).rows[0];
    if (!order) fail(404, "Order not found");
    const payments = (
      await this.pool.query(
        `SELECT provider, amount_pence AS "amountPence", refunded_pence AS "refundedPence", receipt_url AS "receiptUrl", note, created_at AS "createdAt"
         FROM payments WHERE order_id=$1 ORDER BY created_at`,
        [orderId],
      )
    ).rows;
    return { ...order!, payments };
  }

  async list(
    tenantId: string,
    filter: { customerId?: string; status?: string; limit?: number },
  ) {
    const values: unknown[] = [tenantId];
    const where = ["tenant_id=$1"];
    if (filter.customerId) {
      values.push(filter.customerId);
      where.push(`customer_id=$${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      where.push(`status=$${values.length}`);
    }
    values.push(Math.min(filter.limit ?? 50, 200));
    return (
      await this.pool.query<OrderRow>(
        `SELECT ${orderColumns} FROM orders WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      )
    ).rows;
  }
}
