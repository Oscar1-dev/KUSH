import { randomBytes } from "node:crypto";
import Stripe from "stripe";

/**
 * Everything KUSH asks of Stripe, behind one interface so the order logic
 * never imports the SDK directly and tests can run without the network.
 * Card details only ever go to Stripe's hosted Checkout page.
 */
export interface CheckoutRequest {
  orderId: string;
  orderNumber: number;
  tenantId: string;
  description: string;
  amountPence: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Stripe-side idempotency: retries never create a second session. */
  idempotencyKey: string;
}

export interface PaymentGateway {
  readonly configured: boolean;
  readonly mode: "test" | "live" | "off";
  createCheckoutSession(
    input: CheckoutRequest,
  ): Promise<{ id: string; url: string; expiresAt: number }>;
  expireCheckoutSession(id: string): Promise<void>;
  /** URL of an existing open session, or null once it's closed. */
  checkoutUrl(id: string): Promise<string | null>;
  /** Throws if the signature, timestamp or payload is invalid. */
  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event;
  receiptUrl(paymentIntentId: string): Promise<string | null>;
  createRefund(input: {
    paymentIntentId: string;
    amountPence: number;
    idempotencyKey: string;
    reason: string;
  }): Promise<{ id: string; status: string }>;
  syncProduct(input: {
    productId: string | null;
    priceId: string | null;
    name: string;
    description: string;
    amountPence: number;
    currency: string;
    active: boolean;
  }): Promise<{ productId: string; priceId: string }>;
}

class NotConfigured extends Error {
  constructor() {
    super("Payments are not configured yet");
  }
}

/** Real Stripe, from STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. */
export class StripeGateway implements PaymentGateway {
  readonly configured: boolean;
  readonly mode: "test" | "live" | "off";
  readonly #stripe: Stripe | null;
  readonly #webhookSecret: string | null;

  constructor(
    secretKey = process.env.STRIPE_SECRET_KEY,
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  ) {
    const live = Boolean(secretKey?.startsWith("sk_live_"));
    // Live keys are refused unless live payments are explicitly switched on.
    const allowed =
      Boolean(secretKey) &&
      (!live || process.env.KUSH_STRIPE_ALLOW_LIVE === "true");
    this.#stripe = allowed
      ? new Stripe(secretKey!, { maxNetworkRetries: 2, timeout: 15_000 })
      : null;
    this.#webhookSecret = webhookSecret ?? null;
    this.configured = Boolean(this.#stripe && this.#webhookSecret);
    this.mode = !this.configured ? "off" : live ? "live" : "test";
  }

  #client() {
    if (!this.#stripe) throw new NotConfigured();
    return this.#stripe;
  }

  async createCheckoutSession(input: CheckoutRequest) {
    const session = await this.#client().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: input.orderId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountPence,
              product_data: { name: input.description.slice(0, 250) },
            },
          },
        ],
        metadata: {
          kush_order_id: input.orderId,
          kush_tenant_id: input.tenantId,
          kush_order_number: String(input.orderNumber),
        },
        payment_intent_data: {
          metadata: {
            kush_order_id: input.orderId,
            kush_tenant_id: input.tenantId,
          },
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url, expiresAt: session.expires_at };
  }

  async expireCheckoutSession(id: string) {
    await this.#client()
      .checkout.sessions.expire(id)
      .catch(() => undefined);
  }

  async checkoutUrl(id: string) {
    const session = await this.#client().checkout.sessions.retrieve(id);
    return session.status === "open" ? session.url : null;
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    if (!this.#webhookSecret) throw new NotConfigured();
    // constructEvent checks the HMAC and rejects timestamps older than 5 min.
    return Stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.#webhookSecret,
    );
  }

  async receiptUrl(paymentIntentId: string) {
    const intent = await this.#client().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
    );
    const charge = intent.latest_charge;
    return charge && typeof charge !== "string"
      ? (charge.receipt_url ?? null)
      : null;
  }

  async createRefund(input: {
    paymentIntentId: string;
    amountPence: number;
    idempotencyKey: string;
    reason: string;
  }) {
    const refund = await this.#client().refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountPence,
        metadata: { kush_reason: input.reason.slice(0, 450) },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: refund.id, status: refund.status ?? "pending" };
  }

  async syncProduct(input: {
    productId: string | null;
    priceId: string | null;
    name: string;
    description: string;
    amountPence: number;
    currency: string;
    active: boolean;
  }) {
    const stripe = this.#client();
    const product = input.productId
      ? await stripe.products.update(input.productId, {
          name: input.name,
          description: input.description || undefined,
          active: input.active,
        })
      : await stripe.products.create({
          name: input.name,
          description: input.description || undefined,
          active: input.active,
        });
    // Stripe prices are immutable: a changed amount means a new price.
    let priceId = input.priceId;
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      if (
        price.unit_amount !== input.amountPence ||
        price.currency !== input.currency.toLowerCase()
      ) {
        await stripe.prices.update(priceId, { active: false });
        priceId = null;
      }
    }
    if (!priceId)
      priceId = (
        await stripe.prices.create({
          product: product.id,
          unit_amount: input.amountPence,
          currency: input.currency.toLowerCase(),
        })
      ).id;
    await stripe.products.update(product.id, { default_price: priceId });
    return { productId: product.id, priceId };
  }
}

/**
 * Test double with Stripe's real webhook signing: events are signed with
 * Stripe's own helper and verified with Stripe's own constructEvent.
 */
export class FakeStripeGateway implements PaymentGateway {
  readonly configured = true;
  readonly mode = "test" as const;
  readonly sessions = new Map<string, CheckoutRequest>();
  readonly refunds: {
    id: string;
    paymentIntentId: string;
    amountPence: number;
    idempotencyKey: string;
  }[] = [];
  readonly expired: string[] = [];
  readonly products = new Map<
    string,
    { name: string; amountPence: number; active: boolean }
  >();
  #count = 0;
  // Stripe IDs are globally unique; so are these, across parallel test files.
  readonly #run = randomBytes(4).toString("hex");
  #id(prefix: string) {
    return `${prefix}_test_${this.#run}${++this.#count}`;
  }
  constructor(readonly webhookSecret = "whsec_test_kush_fake_secret") {}

  async createCheckoutSession(input: CheckoutRequest) {
    const existing = [...this.sessions].find(
      ([, value]) => value.idempotencyKey === input.idempotencyKey,
    );
    const id = existing?.[0] ?? this.#id("cs");
    this.sessions.set(id, input);
    return {
      id,
      url: `https://checkout.stripe.test/${id}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }
  async expireCheckoutSession(id: string) {
    this.expired.push(id);
  }
  async checkoutUrl(id: string) {
    return this.sessions.has(id) && !this.expired.includes(id)
      ? `https://checkout.stripe.test/${id}`
      : null;
  }
  verifyWebhook(rawBody: Buffer, signature: string) {
    return Stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
  async receiptUrl(paymentIntentId: string) {
    return `https://pay.stripe.test/receipts/${paymentIntentId}`;
  }
  async createRefund(input: {
    paymentIntentId: string;
    amountPence: number;
    idempotencyKey: string;
  }) {
    const existing = this.refunds.find(
      (refund) => refund.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { id: existing.id, status: "succeeded" };
    const id = this.#id("re");
    this.refunds.push({ id, ...input });
    return { id, status: "succeeded" };
  }
  async syncProduct(input: {
    productId: string | null;
    priceId: string | null;
    name: string;
    amountPence: number;
    active: boolean;
  }) {
    const productId = input.productId ?? this.#id("prod");
    const current = this.products.get(productId);
    const priceId =
      current && current.amountPence === input.amountPence && input.priceId
        ? input.priceId
        : this.#id("price");
    this.products.set(productId, {
      name: input.name,
      amountPence: input.amountPence,
      active: input.active,
    });
    return { productId, priceId };
  }
  /** Builds a signed webhook delivery, exactly as Stripe would send it. */
  sign(event: object) {
    const payload = JSON.stringify(event);
    return {
      payload,
      signature: Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: this.webhookSecret,
      }),
    };
  }
}

export const isNotConfigured = (error: unknown) =>
  error instanceof NotConfigured;
