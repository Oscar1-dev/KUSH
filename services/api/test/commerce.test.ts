import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import { applyCredit, creditBalance } from "../src/credit.js";
import { tokenHash } from "../src/password.js";
import { ReferralService } from "../src/referrals.js";
import { FakeStripeGateway } from "../src/stripe-gateway.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const WEBSITE = "test-website-secret-at-least-32-chars!!";
const BOT = "test-integration-secret-32-characters!!";
const GUILD = "923456789012345601";

describe.skipIf(!databaseUrl)(
  "commerce: catalogue, Stripe, credit, refunds, referrals (real PostgreSQL)",
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let pool: ReturnType<typeof createDatabase>["pool"];
    let tenantId: string;
    const stripe = new FakeStripeGateway();
    const previous = { ...process.env };
    const customers: Record<
      string,
      { userId: string; token: string; discordId: string }
    > = {};

    const web = (
      method: "GET" | "POST",
      url: string,
      who: string,
      payload?: object,
    ) =>
      app.inject({
        method,
        url,
        headers: {
          "x-kush-website-secret": WEBSITE,
          authorization: `Bearer ${customers[who]!.token}`,
        },
        ...(payload ? { payload } : {}),
      });
    const bot = (method: "GET" | "POST", path: string, payload?: object) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}${path}`,
        headers: {
          "x-kush-discord-secret": BOT,
          "x-kush-discord-guild-id": GUILD,
        },
        ...(payload ? { payload } : {}),
      });
    /** Delivers an event signed exactly as Stripe signs them. */
    const webhook = (event: object, signature?: string) => {
      const signed = stripe.sign(event);
      return app.inject({
        method: "POST",
        url: "/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature ?? signed.signature,
        },
        payload: signed.payload,
      });
    };
    const completed = (
      sessionId: string,
      orderId: string,
      amount: number,
      extra: object = {},
    ) => ({
      id: `evt_${randomBytes(8).toString("hex")}`,
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: amount,
          currency: "gbp",
          payment_intent: `pi_${randomBytes(6).toString("hex")}`,
          metadata: { kush_order_id: orderId, kush_tenant_id: tenantId },
          ...extra,
        },
      },
    });

    const person = async (name: string) => {
      const discordId = `7${Date.now()}${Math.floor(Math.random() * 1e5)}`
        .padEnd(18, "1")
        .slice(0, 18);
      const userId = (
        await pool.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,role,kind,display_name) VALUES($1,'DISCORD_IDENTITY_NO_LOGIN','customer','discord',$2) RETURNING id",
          [`discord-${discordId}@accounts.kush.invalid`, `TEST ${name}`],
        )
      ).rows[0]!.id;
      await pool.query(
        "INSERT INTO user_identities(provider,subject,user_id,username) VALUES('discord',$1,$2,$3)",
        [discordId, userId, `test-${name}`],
      );
      await pool.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')",
        [tenantId, userId],
      );
      await pool.query(
        "INSERT INTO discord_account_links(tenant_id,user_id,discord_user_id,state,code_hash,request_id,expires_at,verified_at) VALUES($1,$2,$3,'verified','test',$4,now(),now())",
        [tenantId, userId, discordId, randomUUID()],
      );
      const token = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at,kind,user_agent) VALUES($1,$2,now()+interval '1 day','web','TEST')",
        [tokenHash(token), userId],
      );
      customers[name] = { userId, token, discordId };
    };

    beforeAll(async () => {
      process.env.KUSH_WEBSITE_SECRET = WEBSITE;
      process.env.KUSH_DISCORD_INTEGRATION_SECRET = BOT;
      pool = createDatabase(databaseUrl!).pool;
      tenantId = (
        await pool.query<{ id: string }>(
          "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
          [
            "TEST commerce",
            GUILD,
            JSON.stringify({
              categories: [{ key: "commission", label: "Commission" }],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0]!.id;
      process.env.KUSH_SUPPORT_TENANT_ID = tenantId;
      app = await buildApp(databaseUrl!, false, { payments: stripe });
      await pool.query(
        "INSERT INTO products(tenant_id,slug,name,status,price_pence,visibility) VALUES($1,'test-toolkit','TEST Toolkit','active',1500,'public'), ($1,'test-hidden','TEST Hidden','active',900,'hidden'), ($1,'test-draft','TEST Draft','draft',900,'public')",
        [tenantId],
      );
      for (const name of ["ana", "ben", "cara"]) await person(name);
    });

    afterAll(async () => {
      process.env = previous;
      await app?.close();
      await pool?.end();
    });

    it("seeds a published catalogue with backend prices", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/public/catalogue",
      });
      const services = response.json().services as {
        slug: string;
        startingPrice: string | null;
        offers: { priceLabel: string; kind: string }[];
      }[];
      expect(services.map((s) => s.slug)).toEqual(
        expect.arrayContaining([
          "websites",
          "discord",
          "gaming",
          "technical",
          "creative",
        ]),
      );
      const websites = services.find((s) => s.slug === "websites")!;
      expect(websites.startingPrice).toBe("from £40");
      expect(websites.offers.map((o) => o.priceLabel)).toContain("£300–£700");
      expect(services.find((s) => s.slug === "technical")!.startingPrice).toBe(
        "from £10",
      );
    });

    it("only sells published, visible, priced products", async () => {
      const list = (
        await app.inject({ method: "GET", url: "/public/products" })
      )
        .json()
        .products.map((p: { slug: string }) => p.slug);
      expect(list).toEqual(["test-toolkit"]);
      expect(
        (
          await web("POST", "/web/workspace/checkout/product", "ana", {
            productSlug: "test-hidden",
            requestId: randomUUID(),
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await web("POST", "/web/workspace/checkout/product", "ana", {
            productSlug: "test-draft",
            requestId: randomUUID(),
          })
        ).statusCode,
      ).toBe(404);
    });

    it("charges the server price, and only a verified webhook marks it paid", async () => {
      const requestId = randomUUID();
      const start = await web(
        "POST",
        "/web/workspace/checkout/product",
        "ana",
        { productSlug: "test-toolkit", requestId, useCredit: false },
      );
      expect(start.statusCode).toBe(200);
      const { order, checkoutUrl } = start.json();
      expect(checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
      expect(order).toMatchObject({ status: "pending", totalPence: 1500 });
      // The same request ID returns the same order and session.
      const again = await web(
        "POST",
        "/web/workspace/checkout/product",
        "ana",
        { productSlug: "test-toolkit", requestId, useCredit: false },
      );
      expect(again.json().order.id).toBe(order.id);
      const session = (
        await pool.query<{ s: string }>(
          "SELECT stripe_checkout_session_id AS s FROM orders WHERE id=$1",
          [order.id],
        )
      ).rows[0]!.s;

      // A forged signature is rejected and changes nothing.
      expect(
        (await webhook(completed(session, order.id, 1500), "t=1,v1=deadbeef"))
          .statusCode,
      ).toBe(400);
      // The wrong amount is never accepted as payment.
      expect((await webhook(completed(session, order.id, 1))).statusCode).toBe(
        200,
      );
      expect(
        (await web("GET", `/web/workspace/orders/${order.id}`, "ana")).json()
          .order.status,
      ).toBe("pending");

      const event = completed(session, order.id, 1500);
      expect((await webhook(event)).statusCode).toBe(200);
      // Replaying the same event is a no-op.
      expect((await webhook(event)).statusCode).toBe(200);
      const paid = (
        await web("GET", `/web/workspace/orders/${order.id}`, "ana")
      ).json().order;
      expect(paid.status).toBe("paid");
      expect(paid.payments).toHaveLength(1);
      expect(paid.payments[0].receiptUrl).toMatch(
        /^https:\/\/pay\.stripe\.test/,
      );
      const entitlement = await pool.query(
        "SELECT status FROM entitlements WHERE source='provider' AND source_reference=$1",
        [`order:${order.id}`],
      );
      expect(entitlement.rows[0]?.status).toBe("active");
      const jobs = (
        await pool.query<{ kind: string }>(
          "SELECT kind FROM notification_jobs WHERE tenant_id=$1 AND subject_id=$2",
          [tenantId, order.id],
        )
      ).rows;
      expect(jobs.filter((j) => j.kind === "order.paid")).toHaveLength(2);
      // Another customer can't see it.
      expect(
        (await web("GET", `/web/workspace/orders/${order.id}`, "ben"))
          .statusCode,
      ).toBe(404);
    });

    it("applies store credit, settles credit-only orders and never goes negative", async () => {
      const { userId } = customers.ben!;
      await pool.query("BEGIN");
      await applyCredit(pool, {
        tenantId,
        userId,
        amountPence: 2000,
        kind: "adjustment",
        idempotencyKey: "test:ben:topup",
      });
      // The same key twice changes nothing.
      await applyCredit(pool, {
        tenantId,
        userId,
        amountPence: 2000,
        kind: "adjustment",
        idempotencyKey: "test:ben:topup",
      });
      await pool.query("COMMIT");
      expect(await creditBalance(pool, tenantId, userId)).toBe(2000);

      // £15 product, £20 credit: fully covered, paid without Stripe.
      const result = (
        await web("POST", "/web/workspace/checkout/product", "ben", {
          productSlug: "test-toolkit",
          requestId: randomUUID(),
        })
      ).json();
      expect(result.checkoutUrl).toBeNull();
      expect(result.order).toMatchObject({
        status: "paid",
        creditAppliedPence: 1500,
        totalPence: 0,
      });
      expect(await creditBalance(pool, tenantId, userId)).toBe(500);

      // Two purchases racing for the last £5: credit is never double-spent.
      await Promise.all(
        [1, 2].map(() =>
          web("POST", "/web/workspace/checkout/product", "ben", {
            productSlug: "test-toolkit",
            requestId: randomUUID(),
          }),
        ),
      );
      expect(await creditBalance(pool, tenantId, userId)).toBe(0);
      const spent = await pool.query<{ total: string }>(
        "SELECT sum(credit_applied_pence) AS total FROM orders WHERE customer_id=$1",
        [userId],
      );
      expect(Number(spent.rows[0]!.total)).toBe(2000);
    });

    it("returns reserved credit when a checkout expires", async () => {
      const { userId } = customers.cara!;
      await pool.query("BEGIN");
      await applyCredit(pool, {
        tenantId,
        userId,
        amountPence: 400,
        kind: "adjustment",
        idempotencyKey: "test:cara:topup",
      });
      await pool.query("COMMIT");
      const { order } = (
        await web("POST", "/web/workspace/checkout/product", "cara", {
          productSlug: "test-toolkit",
          requestId: randomUUID(),
        })
      ).json();
      expect(order).toMatchObject({
        creditAppliedPence: 400,
        totalPence: 1100,
      });
      expect(await creditBalance(pool, tenantId, userId)).toBe(0);
      const session = (
        await pool.query<{ s: string }>(
          "SELECT stripe_checkout_session_id AS s FROM orders WHERE id=$1",
          [order.id],
        )
      ).rows[0]!.s;
      await webhook({
        id: `evt_${randomBytes(8).toString("hex")}`,
        object: "event",
        type: "checkout.session.expired",
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: session,
            object: "checkout.session",
            metadata: { kush_order_id: order.id, kush_tenant_id: tenantId },
          },
        },
      });
      expect(
        (await web("GET", `/web/workspace/orders/${order.id}`, "cara")).json()
          .order.status,
      ).toBe("expired");
      expect(await creditBalance(pool, tenantId, userId)).toBe(400);
    });

    it("lets Discord check out a linked member, reusing the order on a double click", async () => {
      const body = {
        discordUserId: customers.cara!.discordId,
        productSlug: "test-toolkit",
        interactionId: "1234567890",
        useCredit: false,
      };
      const first = (await bot("POST", "/checkout", body)).json();
      const second = (await bot("POST", "/checkout", body)).json();
      expect(first.checkoutUrl).toBeTruthy();
      expect(second.orderNumber).toBe(first.orderNumber);
      expect(
        (
          await bot("POST", "/checkout", {
            ...body,
            discordUserId: "723456789012340000",
          })
        ).statusCode,
      ).toBe(409);
    });

    it("qualifies referrals with anti-abuse rules and pays each milestone once", async () => {
      const referrals = new ReferralService(pool);
      const inviter = customers.ana!.discordId;
      const old = new Date(Date.now() - 60 * 86_400_000);
      const joined = new Date(Date.now() - 10 * 86_400_000);
      // Self-referral is refused; a young account is flagged for review.
      expect(
        (
          await referrals.record(tenantId, {
            inviterDiscordId: inviter,
            invitedDiscordId: inviter,
            source: "invite",
            confidence: "exact",
            accountCreatedAt: old,
            joinedAt: joined,
          })
        ).recorded,
      ).toBe(false);
      const young = await referrals.record(tenantId, {
        inviterDiscordId: inviter,
        invitedDiscordId: "823456789012300000",
        source: "invite",
        confidence: "exact",
        accountCreatedAt: new Date(),
        joinedAt: joined,
      });
      expect(young).toMatchObject({ recorded: true, status: "flagged" });
      // Ten genuine members (burst limit raised for the test).
      await pool.query(
        "INSERT INTO platform_settings(tenant_id,key,value) VALUES($1,'referrals',$2)",
        [tenantId, JSON.stringify({ burstLimit: 100 })],
      );
      for (let i = 0; i < 11; i++)
        await referrals.record(tenantId, {
          inviterDiscordId: inviter,
          invitedDiscordId: `82345678901230${String(i + 10).padStart(4, "0")}`,
          source: "invite",
          confidence: "probable",
          accountCreatedAt: old,
          joinedAt: joined,
        });
      // One leaves before qualifying: it never counts.
      await referrals.left(tenantId, "823456789012300010");
      // A member can only ever be referred once.
      expect(
        (
          await referrals.record(tenantId, {
            inviterDiscordId: customers.ben!.discordId,
            invitedDiscordId: "823456789012300011",
            source: "code",
            confidence: "claimed",
            accountCreatedAt: old,
            joinedAt: joined,
          })
        ).recorded,
      ).toBe(false);

      const before = await creditBalance(pool, tenantId, customers.ana!.userId);
      expect(await referrals.run(tenantId)).toMatchObject({
        qualified: 10,
        issued: 1,
      });
      expect(await referrals.run(tenantId)).toMatchObject({
        qualified: 0,
        issued: 0,
      });
      expect(await creditBalance(pool, tenantId, customers.ana!.userId)).toBe(
        before + 500,
      );
      const summary = await referrals.summary(tenantId, inviter);
      expect(summary).toMatchObject({
        qualified: 10,
        underReview: 1,
        disqualified: 1,
        next: { count: 20, remaining: 10 },
      });
      expect(summary.code).toMatch(/^[A-Z2-9]{8}$/);
      const board = (await bot("GET", "/referrals/leaderboard")).json().leaders;
      expect(board[0]).toMatchObject({ discordUserId: inviter, qualified: 10 });
    });
  },
);
