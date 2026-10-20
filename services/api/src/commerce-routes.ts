import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import type { WebSession } from "./account-service.js";
import type { WebHelpers } from "./accounts.js";
import { Catalogue } from "./catalogue.js";
import { businessStats } from "./stats.js";
import { applyCredit, creditBalance, creditHistory } from "./credit.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { creditSpendable, OrderService } from "./orders.js";
import {
  can,
  demand,
  permissionsFor,
  type Permission,
} from "./staff-access.js";
import { isNotConfigured, type PaymentGateway } from "./stripe-gateway.js";
import { SupportError } from "./support-service.js";
import type { StaffHelpers } from "./web-staff.js";

/**
 * Commerce routes:
 *  - POST /webhooks/stripe            Stripe → KUSH (signature verified)
 *  - /public/products                 published products
 *  - /web/workspace/...               the signed-in customer
 *  - /web/staff/...                   staff (live roles + 2FA + permission)
 *  - /discord/integration/...         the bot (integration secret)
 * Prices, totals and payment state are only ever computed here.
 */

const uuid = { type: "string", format: "uuid" };
const params = (...names: string[]) => ({
  type: "object",
  properties: Object.fromEntries(names.map((name) => [name, uuid])),
  required: names,
});
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const snowflake = z.string().regex(/^[0-9]{17,20}$/);

export async function registerCommerce(
  app: FastifyInstance,
  {
    pool,
    web,
    staff,
    gateway,
  }: {
    pool: Pool;
    web: WebHelpers;
    staff: StaffHelpers;
    gateway: PaymentGateway;
  },
) {
  const orders = new OrderService(pool, gateway);
  const catalogue = new Catalogue(pool);
  const { signedIn, body } = web;
  const { asStaff, access } = staff;
  const tenantId = () => {
    const id = process.env.KUSH_SUPPORT_TENANT_ID;
    if (!id) throw new SupportError(503, "Store is not configured");
    return id;
  };
  const p = <T>(request: FastifyRequest) => request.params as T;

  /** Maps provider failures to safe messages. */
  const provider = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (isNotConfigured(error))
        throw new SupportError(503, "Card payments aren't switched on yet");
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        String((error as { type: unknown }).type).startsWith("Stripe")
      )
        throw new SupportError(
          502,
          "The payment provider didn't respond. Nothing was charged; please try again",
        );
      throw error;
    }
  };

  // -------------------------------------------------------------- webhook

  // Stripe signs the exact bytes it sends, so this route gets the raw body.
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, payload, done) => done(null, payload),
    );
    scope.post(
      "/webhooks/stripe",
      { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const signature = request.headers["stripe-signature"];
        if (typeof signature !== "string" || !Buffer.isBuffer(request.body))
          return reply.code(400).send({ error: "Missing signature" });
        let event;
        try {
          event = gateway.verifyWebhook(request.body, signature);
        } catch {
          // Bad signature, stale timestamp (replay) or malformed body.
          return reply.code(400).send({ error: "Invalid signature" });
        }
        const result = await orders.handleStripeEvent(event);
        request.log.info(
          { event: event.id, type: event.type, result },
          "stripe.webhook",
        );
        return { received: true };
      },
    );
  });

  // -------------------------------------------------------------- public

  app.get("/public/products", async (_request, reply) => {
    const id = process.env.KUSH_SUPPORT_TENANT_ID;
    if (!id) return { products: [] };
    reply.header("Cache-Control", "public, max-age=30");
    return {
      payments: gateway.mode !== "off",
      products: (
        await pool.query(
          `SELECT slug, name, description, category, image_url AS "imageUrl", price_pence AS "pricePence", currency
           FROM products WHERE tenant_id=$1 AND status='active' AND visibility='public' AND price_pence IS NOT NULL ORDER BY name`,
          [id],
        )
      ).rows,
    };
  });

  // ------------------------------------------------------------ customer

  const checkoutSchema = z
    .object({ requestId: z.uuid(), useCredit: z.boolean().default(true) })
    .strict();
  const productCheckoutSchema = checkoutSchema
    .extend({ productSlug: slug })
    .strict();

  app.post(
    "/web/workspace/checkout/product",
    { schema: { body: body(productCheckoutSchema) } },
    signedIn((session: WebSession, request) =>
      provider(() =>
        orders.checkoutProduct(
          tenantId(),
          session.userId,
          productCheckoutSchema.parse(request.body),
        ),
      ),
    ),
  );
  app.post(
    "/web/workspace/commissions/:commissionId/quotes/:quoteId/checkout",
    {
      schema: {
        params: params("commissionId", "quoteId"),
        body: body(checkoutSchema),
      },
    },
    signedIn((session: WebSession, request) => {
      const { commissionId, quoteId } = p<{
        commissionId: string;
        quoteId: string;
      }>(request);
      return provider(() =>
        orders.checkoutQuote(tenantId(), session.userId, {
          commissionId,
          quoteId,
          ...checkoutSchema.parse(request.body),
        }),
      );
    }),
  );
  app.get(
    "/web/workspace/orders",
    signedIn(async (session: WebSession) => ({
      orders: await orders.list(tenantId(), { customerId: session.userId }),
    })),
  );
  app.get(
    "/web/workspace/orders/:orderId",
    { schema: { params: params("orderId") } },
    signedIn(async (session: WebSession, request) => ({
      order: await orders.get(
        tenantId(),
        p<{ orderId: string }>(request).orderId,
        session.userId,
      ),
    })),
  );
  app.post(
    "/web/workspace/orders/:orderId/resume",
    { schema: { params: params("orderId") } },
    signedIn((session: WebSession, request) =>
      provider(() =>
        orders.resumeFor(
          tenantId(),
          p<{ orderId: string }>(request).orderId,
          session.userId,
        ),
      ),
    ),
  );
  app.get(
    "/web/workspace/credit",
    signedIn(async (session: WebSession) => ({
      balancePence: await creditBalance(pool, tenantId(), session.userId),
      history: await creditHistory(pool, tenantId(), session.userId),
      spendable: creditSpendable(),
    })),
  );

  // --------------------------------------------------------------- staff

  app.get(
    "/web/staff/orders",
    asStaff(async (ctx, request) => {
      demand(ctx, "orders.view");
      const { status } = z
        .object({
          status: z
            .enum([
              "pending",
              "paid",
              "failed",
              "cancelled",
              "expired",
              "refunded",
              "partially_refunded",
            ])
            .optional(),
        })
        .parse(request.query);
      return {
        orders: (
          await pool.query(
            `SELECT o.id, o.number, o.kind, o.description, o.status, o.subtotal_pence AS "subtotalPence", o.credit_applied_pence AS "creditAppliedPence",
                    o.total_pence AS "totalPence", o.refunded_pence AS "refundedPence", o.created_at AS "createdAt", o.paid_at AS "paidAt",
                    COALESCE(u.display_name, i.username, 'Customer') AS "customerName"
             FROM orders o JOIN users u ON u.id=o.customer_id
             LEFT JOIN user_identities i ON i.user_id=o.customer_id AND i.provider='discord'
             WHERE o.tenant_id=$1 AND ($2::text IS NULL OR o.status=$2) ORDER BY o.created_at DESC LIMIT 200`,
            [ctx.tenantId, status ?? null],
          )
        ).rows,
      };
    }),
  );
  app.get(
    "/web/staff/orders/:orderId",
    { schema: { params: params("orderId") } },
    asStaff(async (ctx, request) => {
      demand(ctx, "orders.view");
      const order = await orders.get(
        ctx.tenantId,
        p<{ orderId: string }>(request).orderId,
      );
      const refunds = (
        await pool.query(
          `SELECT r.amount_pence AS "amountPence", r.reason, r.status, r.created_at AS "createdAt"
           FROM refunds r JOIN payments pm ON pm.id=r.payment_id WHERE pm.order_id=$1 ORDER BY r.created_at`,
          [order.id],
        )
      ).rows;
      return { order, refunds, canRefund: can(ctx, "refunds.manage") };
    }),
  );
  const refundSchema = z
    .object({
      amountPence: z.number().int().positive(),
      reason: z.string().trim().min(3).max(500),
      requestId: z.uuid(),
    })
    .strict();
  app.post(
    "/web/staff/orders/:orderId/refund",
    { schema: { params: params("orderId"), body: body(refundSchema) } },
    asStaff(async (ctx, request) => {
      demand(ctx, "refunds.manage");
      return provider(() =>
        orders.refund(ctx.tenantId, ctx.userId, {
          orderId: p<{ orderId: string }>(request).orderId,
          ...refundSchema.parse(request.body),
        }),
      );
    }),
  );
  const offlineSchema = z
    .object({
      amountPence: z.number().int().positive(),
      note: z.string().trim().min(3).max(500),
      requestId: z.uuid(),
    })
    .strict();
  app.post(
    "/web/staff/commissions/:commissionId/quotes/:quoteId/offline-payment",
    {
      schema: {
        params: params("commissionId", "quoteId"),
        body: body(offlineSchema),
      },
    },
    asStaff(async (ctx, request) => {
      demand(ctx, "payments.manage");
      const { commissionId, quoteId } = p<{
        commissionId: string;
        quoteId: string;
      }>(request);
      return {
        order: await orders.recordOffline(ctx.tenantId, ctx.userId, {
          commissionId,
          quoteId,
          ...offlineSchema.parse(request.body),
        }),
      };
    }),
  );

  const adjustSchema = z
    .object({
      userId: z.uuid(),
      amountPence: z
        .number()
        .int()
        .refine((v) => v !== 0)
        .refine((v) => Math.abs(v) <= 50_000),
      note: z.string().trim().min(3).max(500),
      requestId: z.uuid(),
    })
    .strict();
  app.post(
    "/web/staff/credit/adjust",
    { schema: { body: body(adjustSchema) } },
    asStaff(async (ctx, request) => {
      demand(ctx, "credit.adjust");
      const input = adjustSchema.parse(request.body);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const result = await applyCredit(c, {
          tenantId: ctx.tenantId,
          userId: input.userId,
          amountPence: input.amountPence,
          kind: "adjustment",
          idempotencyKey: `adjust:${input.requestId}`,
          note: input.note,
          createdBy: ctx.userId,
        });
        await c.query(
          "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,'staff.credit.adjusted')",
          [ctx.tenantId, ctx.userId],
        );
        await c.query("COMMIT");
        return result;
      } catch (error) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        c.release();
      }
    }),
  );
  app.get(
    "/web/staff/customers/:userId/credit",
    { schema: { params: params("userId") } },
    asStaff(async (ctx, request) => {
      demand(ctx, "customers.view");
      const { userId } = p<{ userId: string }>(request);
      return {
        balancePence: await creditBalance(pool, ctx.tenantId, userId),
        history: await creditHistory(pool, ctx.tenantId, userId),
      };
    }),
  );

  // ---- products (sellable), synced to Stripe when configured

  const productSchema = z
    .object({
      slug,
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(2_000).default(""),
      category: z.string().trim().max(60).nullable().default(null),
      imageUrl: z
        .string()
        .regex(/^https:\/\/[^\s]+$/)
        .max(500)
        .nullable()
        .default(null),
      pricePence: z.number().int().min(50).max(100_000_00),
      visibility: z.enum(["public", "unlisted", "hidden"]).default("public"),
      status: z.enum(["draft", "active", "retired"]).default("draft"),
      rewardEligible: z.boolean().default(false),
    })
    .strict();
  const productPatchSchema = productSchema
    .partial()
    .omit({ slug: true })
    .strict();

  /** Shared by the website and Discord: one implementation of product management. */
  const products = {
    async create(tenant: string, actorId: string | null, raw: unknown) {
      const input = productSchema.parse(raw);
      const id = (
        await pool
          .query<{ id: string }>(
            `INSERT INTO products(tenant_id, slug, name, description, category, image_url, price_pence, visibility, status, reward_eligible)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [
              tenant,
              input.slug,
              input.name,
              input.description,
              input.category,
              input.imageUrl,
              input.pricePence,
              input.visibility,
              input.status,
              input.rewardEligible,
            ],
          )
          .catch((error: { code?: string }) => {
            if (error.code === "23505")
              throw new SupportError(
                409,
                "A product with that slug already exists",
              );
            throw error;
          })
      ).rows[0]!.id;
      await products.sync(tenant, id);
      await pool.query(
        "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,'staff.product.created')",
        [tenant, actorId],
      );
      return products.get(tenant, id);
    },
    async update(
      tenant: string,
      actorId: string | null,
      id: string,
      raw: unknown,
    ) {
      const patch = productPatchSchema.parse(raw);
      const column: Record<string, string> = {
        name: "name",
        description: "description",
        category: "category",
        imageUrl: "image_url",
        pricePence: "price_pence",
        visibility: "visibility",
        status: "status",
        rewardEligible: "reward_eligible",
      };
      const sets: string[] = [];
      const values: unknown[] = [tenant, id];
      for (const [key, value] of Object.entries(patch)) {
        values.push(value);
        sets.push(`${column[key]}=$${values.length}`);
      }
      if (!sets.length) throw new SupportError(400, "No changes supplied");
      const result = await pool.query(
        `UPDATE products SET ${sets.join(",")}, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        values,
      );
      if (!result.rowCount) throw new SupportError(404, "Product not found");
      await products.sync(tenant, id);
      await pool.query(
        "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,'staff.product.updated')",
        [tenant, actorId],
      );
      return products.get(tenant, id);
    },
    async get(tenant: string, id: string) {
      const row = (
        await pool.query(
          `SELECT id, slug, name, description, category, image_url AS "imageUrl", price_pence AS "pricePence", currency, visibility, status,
                  reward_eligible AS "rewardEligible", stripe_product_id IS NOT NULL AS "inStripe", updated_at AS "updatedAt"
           FROM products WHERE tenant_id=$1 AND id=$2`,
          [tenant, id],
        )
      ).rows[0];
      if (!row) throw new SupportError(404, "Product not found");
      return row;
    },
    async bySlug(tenant: string, value: string) {
      const row = (
        await pool.query<{ id: string }>(
          "SELECT id FROM products WHERE tenant_id=$1 AND slug=$2",
          [tenant, value],
        )
      ).rows[0];
      if (!row) throw new SupportError(404, "Product not found");
      return row.id;
    },
    /** Mirrors the product to Stripe (when payments are configured). */
    async sync(tenant: string, id: string) {
      if (!gateway.configured) return;
      const row = (
        await pool.query<{
          name: string;
          description: string;
          price_pence: number | null;
          currency: string;
          status: string;
          stripe_product_id: string | null;
          stripe_price_id: string | null;
        }>(
          "SELECT name, description, price_pence, currency, status, stripe_product_id, stripe_price_id FROM products WHERE tenant_id=$1 AND id=$2",
          [tenant, id],
        )
      ).rows[0];
      if (!row || row.price_pence === null) return;
      const synced = await provider(() =>
        gateway.syncProduct({
          productId: row.stripe_product_id,
          priceId: row.stripe_price_id,
          name: row.name,
          description: row.description,
          amountPence: row.price_pence!,
          currency: row.currency,
          active: row.status === "active",
        }),
      );
      await pool.query(
        "UPDATE products SET stripe_product_id=$3, stripe_price_id=$4 WHERE tenant_id=$1 AND id=$2",
        [tenant, id, synced.productId, synced.priceId],
      );
    },
  };

  app.get(
    "/web/staff/products",
    asStaff(async (ctx) => {
      demand(ctx, "products.manage");
      return {
        payments: gateway.mode,
        products: (
          await pool.query(
            `SELECT id, slug, name, description, category, image_url AS "imageUrl", price_pence AS "pricePence", currency, visibility, status, reward_eligible AS "rewardEligible",
                    stripe_product_id IS NOT NULL AS "inStripe", updated_at AS "updatedAt"
             FROM products WHERE tenant_id=$1 ORDER BY status, name`,
            [ctx.tenantId],
          )
        ).rows,
      };
    }),
  );
  app.post(
    "/web/staff/products",
    { schema: { body: body(productSchema) } },
    asStaff(async (ctx, request) => {
      demand(ctx, "products.manage");
      return {
        product: await products.create(ctx.tenantId, ctx.userId, request.body),
      };
    }),
  );
  app.post(
    "/web/staff/products/:productId",
    { schema: { params: params("productId"), body: body(productPatchSchema) } },
    asStaff(async (ctx, request) => {
      demand(ctx, "products.manage");
      return {
        product: await products.update(
          ctx.tenantId,
          ctx.userId,
          p<{ productId: string }>(request).productId,
          request.body,
        ),
      };
    }),
  );

  // ---- catalogue (services + offers)

  app.get(
    "/web/staff/catalogue",
    asStaff(async (ctx) => {
      demand(ctx, "catalogue.manage");
      return { services: await catalogue.list(ctx.tenantId, "staff") };
    }),
  );
  app.post(
    "/web/staff/catalogue/services",
    asStaff(async (ctx, request) => {
      demand(ctx, "catalogue.manage");
      return { id: await catalogue.createService(ctx.tenantId, request.body) };
    }),
  );
  app.post(
    "/web/staff/catalogue/services/:serviceId",
    { schema: { params: params("serviceId") } },
    asStaff(async (ctx, request) => {
      demand(ctx, "catalogue.manage");
      await catalogue.updateService(
        ctx.tenantId,
        p<{ serviceId: string }>(request).serviceId,
        request.body,
      );
      return { saved: true };
    }),
  );
  app.post(
    "/web/staff/catalogue/services/:serviceId/offers",
    { schema: { params: params("serviceId") } },
    asStaff(async (ctx, request) => {
      demand(ctx, "catalogue.manage");
      return {
        id: await catalogue.createOffer(
          ctx.tenantId,
          p<{ serviceId: string }>(request).serviceId,
          request.body,
        ),
      };
    }),
  );
  app.post(
    "/web/staff/catalogue/offers/:offerId",
    { schema: { params: params("offerId") } },
    asStaff(async (ctx, request) => {
      demand(ctx, "catalogue.manage");
      await catalogue.updateOffer(
        ctx.tenantId,
        p<{ offerId: string }>(request).offerId,
        request.body,
      );
      return { saved: true };
    }),
  );

  // ---- business overview (real numbers only)

  app.get(
    "/web/staff/stats",
    asStaff(async (ctx) => {
      demand(ctx, "stats.view");
      return {
        ...(await businessStats(pool, ctx.tenantId)),
        payments: gateway.mode,
      };
    }),
  );

  // ----------------------------------------------------------------- bot

  const integration = "/discord/integration/tenants/:tenantId";
  const tenantParams = params("tenantId");
  const handle = async (reply: FastifyReply, work: () => Promise<unknown>) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await work();
    } catch (error) {
      if (error instanceof SupportError)
        return reply.code(error.status).send({ error: error.message });
      if (error instanceof z.ZodError)
        return reply
          .code(400)
          .send({ error: error.issues[0]?.message ?? "Invalid request" });
      throw error;
    }
  };
  const bot = async (request: FastifyRequest) => {
    const header = (name: string) =>
      typeof request.headers[name] === "string"
        ? (request.headers[name] as string)
        : "";
    verifyIntegrationSecret(
      header("x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    const { tenantId: tenant } = request.params as { tenantId: string };
    const found = await pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenant, header("x-kush-discord-guild-id")],
    );
    if (!found.rowCount)
      throw new SupportError(404, "Support resource not found");
    return tenant;
  };
  /** The KUSH account behind a Discord user (verified link required). */
  const linked = async (tenant: string, discordUserId: string) => {
    const row = (
      await pool.query<{ user_id: string }>(
        "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
        [tenant, discordUserId],
      )
    ).rows[0];
    if (!row)
      throw new SupportError(
        409,
        "Link your KUSH account first: type !account",
      );
    return row.user_id;
  };
  /**
   * Staff actions from Discord are authorised by the API, from the actor's
   * live Discord roles mapped to KUSH permissions, never by the bot alone.
   * Money-moving actions (refunds, credit) stay website-only (2FA).
   */
  const staffFromDiscord = async (
    tenant: string,
    discordUserId: string,
    permission: Permission,
  ) => {
    const roles = await access.liveRoles(tenant, discordUserId);
    if (roles === "unavailable")
      throw new SupportError(
        503,
        "Discord didn't answer, so staff access is paused. Try again shortly",
      );
    if (!permissionsFor(roles).includes(permission))
      throw new SupportError(403, "You don't have permission to do that");
    return (
      (
        await pool.query<{ user_id: string }>(
          "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
          [tenant, discordUserId],
        )
      ).rows[0]?.user_id ?? null
    );
  };

  app.get<{
    Params: { tenantId: string };
    Querystring: { discordUserId?: string };
  }>(
    `${integration}/orders`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const discordUserId = snowflake.parse(request.query.discordUserId);
        const userId = await linked(tenant, discordUserId);
        return {
          orders: await orders.list(tenant, { customerId: userId, limit: 10 }),
        };
      }),
  );
  app.get<{
    Params: { tenantId: string; number: string };
    Querystring: { discordUserId?: string };
  }>(
    `${integration}/orders/:number`,
    {
      schema: {
        params: {
          type: "object",
          properties: {
            tenantId: uuid,
            number: { type: "string", pattern: "^[0-9]{1,9}$" },
          },
          required: ["tenantId", "number"],
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const userId = await linked(
          tenant,
          snowflake.parse(request.query.discordUserId),
        );
        const row = (
          await pool.query<{ id: string }>(
            "SELECT id FROM orders WHERE tenant_id=$1 AND number=$2 AND customer_id=$3",
            [tenant, Number(request.params.number), userId],
          )
        ).rows[0];
        if (!row) throw new SupportError(404, "Order not found");
        return { order: await orders.get(tenant, row.id, userId) };
      }),
  );
  const botCheckout = z
    .object({
      discordUserId: snowflake,
      productSlug: slug,
      interactionId: z.string().min(1).max(40),
      useCredit: z.boolean().default(true),
    })
    .strict();
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${integration}/checkout`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const input = botCheckout.parse(request.body);
        const userId = await linked(tenant, input.discordUserId);
        // The interaction ID makes a double-clicked /buy reuse one order.
        const requestId = uuidFrom(`discord-buy:${input.interactionId}`);
        const result = await provider(() =>
          orders.checkoutProduct(tenant, userId, {
            productSlug: input.productSlug,
            requestId,
            useCredit: input.useCredit,
          }),
        );
        return {
          orderNumber: result.order.number,
          status: result.order.status,
          checkoutUrl: result.checkoutUrl,
          totalPence: result.order.totalPence,
          creditAppliedPence: result.order.creditAppliedPence,
        };
      }),
  );
  app.get<{
    Params: { tenantId: string };
    Querystring: { discordUserId?: string };
  }>(
    `${integration}/credit`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const userId = await linked(
          tenant,
          snowflake.parse(request.query.discordUserId),
        );
        return {
          balancePence: await creditBalance(pool, tenant, userId),
          history: await creditHistory(pool, tenant, userId, 5),
          spendable: creditSpendable(),
        };
      }),
  );
  const botProduct = z
    .object({ actorDiscordId: snowflake, product: z.unknown() })
    .strict();
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${integration}/products`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const { actorDiscordId, product } = botProduct.parse(request.body);
        const actor = await staffFromDiscord(
          tenant,
          actorDiscordId,
          "products.manage",
        );
        return { product: await products.create(tenant, actor, product) };
      }),
  );
  app.post<{ Params: { tenantId: string; slug: string }; Body: unknown }>(
    `${integration}/products/:slug`,
    {
      schema: {
        params: {
          type: "object",
          properties: {
            tenantId: uuid,
            slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,59}$" },
          },
          required: ["tenantId", "slug"],
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        const { actorDiscordId, product } = botProduct.parse(request.body);
        const actor = await staffFromDiscord(
          tenant,
          actorDiscordId,
          "products.manage",
        );
        return {
          product: await products.update(
            tenant,
            actor,
            await products.bySlug(tenant, request.params.slug),
            product,
          ),
        };
      }),
  );
  app.get<{
    Params: { tenantId: string };
    Querystring: { actorDiscordId?: string };
  }>(
    `${integration}/staff/orders`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenant = await bot(request);
        await staffFromDiscord(
          tenant,
          snowflake.parse(request.query.actorDiscordId),
          "orders.view",
        );
        return { orders: await orders.list(tenant, { limit: 10 }) };
      }),
  );
}

/** Deterministic UUID-shaped key from a string, for idempotency. */
function uuidFrom(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
