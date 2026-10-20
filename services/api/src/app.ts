import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { and, eq, gt, lt, desc, isNull, sql } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createDatabase, users, sessions, auditEvents } from "@kush/database";
import type { User, LoginRequest } from "@kush/contracts";
import { loginJsonSchema, loginSchema, responseSchemas } from "@kush/contracts";
import { hashPassword, verifyPassword, tokenHash } from "./password.js";
import { consumeLoginAttempt } from "./security.js";
import { registerIdentity } from "./identity.js";
import { registerDelivery } from "./delivery.js";
import { registerSupport } from "./support.js";
import { registerCommercial } from "./commercial.js";
import { registerDiscord } from "./discord.js";
import { registerEntitlements } from "./entitlements.js";
import { registerModeration } from "./moderation.js";
import { registerCommunity } from "./community.js";
import { registerCommissionIntake } from "./commission-intake.js";
import { registerCatalogue } from "./catalogue.js";
import { registerCommerce } from "./commerce-routes.js";
import { registerReferrals } from "./referrals.js";
import { StripeGateway, type PaymentGateway } from "./stripe-gateway.js";
import { registerAccounts } from "./accounts.js";
import { registerWorkspace } from "./web-workspace.js";
import { registerStaff } from "./web-staff.js";
import { registerNotifications } from "./notifications.js";
import { registerRecruitment } from "./web-recruitment.js";
import { registerInsights } from "./web-insights.js";
import { registerDownloads } from "./downloads.js";
import type { DiscordMembers } from "./staff-access.js";
import type { DiscordOAuth } from "./account-service.js";

export async function buildApp(
  databaseUrl: string,
  logging = false,
  options: {
    oauth?: () => DiscordOAuth | null;
    members?: () => DiscordMembers | null;
    /** Tests pass a fake; production uses Stripe from the environment. */
    payments?: PaymentGateway;
  } = {},
) {
  const app = Fastify({
    logger: logging
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.x-kush-discord-secret",
            "req.headers.x-kush-website-secret",
            "req.body.password",
            "req.body.currentPassword",
            "res.headers.authorization",
          ],
        }
      : false,
    bodyLimit: 131_072,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const documentedPaths: Record<string, Record<string, unknown>> = {};
  app.addHook("onRoute", (route) => {
    if (
      route.url === "/openapi.json" ||
      route.method === "HEAD" ||
      route.method === "OPTIONS"
    )
      return;
    const path = route.url.replace(/:([A-Za-z]+)/g, "{$1}");
    const secured = route.url !== "/health" && route.url !== "/auth/login";
    for (const method of Array.isArray(route.method)
      ? route.method
      : [route.method]) {
      const schema = route.schema;
      const parameters = schema?.params
        ? (schema.params as { properties: Record<string, unknown> }).properties
        : Object.fromEntries(
            [...route.url.matchAll(/:([A-Za-z]+)/g)].map((match) => [
              match[1]!,
              { type: "string", format: "uuid" },
            ]),
          );
      const knownResponse =
        responseSchemas[route.url as keyof typeof responseSchemas];
      (documentedPaths[path] ??= {})[method.toLowerCase()] = {
        ...(secured ? { security: [{ bearerAuth: [] }] } : {}),
        ...(schema?.body
          ? {
              requestBody: {
                required: true,
                content: { "application/json": { schema: schema.body } },
              },
            }
          : {}),
        ...(Object.keys(parameters).length
          ? {
              parameters: Object.entries(parameters).map(
                ([name, property]) => ({
                  in: "path",
                  name,
                  required: true,
                  schema: property,
                }),
              ),
            }
          : {}),
        responses: {
          "200": {
            description: "Success",
            ...(knownResponse
              ? { content: { "application/json": { schema: knownResponse } } }
              : {}),
          },
          "201": { description: "Created when the operation creates a record" },
          "204": {
            description:
              "Success without a response body for password, access, logout or deletion operations",
          },
          "400": { description: "Invalid request" },
          "401": {
            description: "Authentication required or invalid credentials",
          },
          "403": { description: "Permission denied" },
          "404": { description: "Record not found" },
          "409": { description: "Conflict or stale version" },
          "429": { description: "Too many requests" },
          "503": { description: "Database unavailable" },
        },
      };
    }
  });
  const { db, pool } = createDatabase(databaseUrl);
  pool.on("error", () => {
    app.log.error("Database connection interrupted");
  });
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "tauri://localhost",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  const dummyHash = await hashPassword(randomBytes(32).toString("hex"));
  app.addHook("onRequest", async (request, reply) => {
    if (request.url !== "/health" && request.url !== "/openapi.json")
      reply.header("Cache-Control", "no-store");
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // The website server relays every visitor from one IP and applies its
    // own per-visitor limits, so its authenticated calls are exempt here.
    allowList: (request) => {
      const provided = request.headers["x-kush-website-secret"];
      const expected = process.env.KUSH_WEBSITE_SECRET;
      return (
        typeof provided === "string" &&
        !!expected &&
        provided.length === expected.length &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      );
    },
  });
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;
  const cleanup = async () => {
    await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
    await pool.query(
      "DELETE FROM login_attempts WHERE window_start < now() - interval '1 day'",
    );
  };
  app.addHook("onReady", async () => {
    await cleanup().catch(() =>
      app.log.error("Initial session cleanup unavailable"),
    );
    cleanupTimer = setInterval(() => {
      void cleanup().catch(() => app.log.error("Session cleanup failed"));
    }, 60_000);
    cleanupTimer.unref();
  });
  app.addHook("onClose", async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
    await pool.end();
  });
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error.validation)
      return reply.code(400).send({ error: "Invalid request" });
    if (error.statusCode === 429)
      return reply.code(429).send({ error: "Too many requests" });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
      return reply.code(error.statusCode).send({ error: "Invalid request" });
    app.log.error({ code: error.code }, "Request failed");
    return reply.code(503).send({ error: "Service unavailable" });
  });
  const authenticate = async (
    authorization: string | undefined,
  ): Promise<User | null> => {
    if (!authorization?.match(/^Bearer [a-f0-9]{64}$/)) return null;
    const [record] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash(authorization.slice(7))),
          gt(sessions.expiresAt, new Date()),
          eq(users.disabled, false),
          // Website sessions only work through /web/ (website server).
          sql`${sessions}.kind = 'api'`,
        ),
      )
      .limit(1);
    return record ?? null;
  };
  const audit = async (actorId: string | null, action: string) => {
    await db.insert(auditEvents).values({ actorId, action });
  };
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0]!;
    if (
      path.startsWith("/support/") ||
      path.startsWith("/commercial/") ||
      path.startsWith("/discord/") ||
      path.startsWith("/web/") ||
      [
        "/health",
        "/openapi.json",
        "/auth/login",
        "/auth/me",
        "/auth/logout",
        "/auth/password",
      ].includes(path)
    )
      return;
    const user = await authenticate(request.headers.authorization);
    if (user?.role === "customer") {
      await audit(user.id, "access.denied.customer");
      return reply.code(403).send({
        error:
          "Customer accounts can access only their authorised support workspace",
      });
    }
  });
  await registerIdentity(app, { db, pool, authenticate, audit });
  await registerDelivery(app, { db, pool, authenticate, audit });
  await registerSupport(app, { pool, authenticate });
  await registerCommercial(app, { pool, authenticate });
  await registerDiscord(app, { pool });
  await registerEntitlements(app, { pool, authenticate });
  await registerModeration(app, { pool });
  await registerCommunity(app, { pool });
  await registerCommissionIntake(app, { pool });
  await registerCatalogue(app, { pool });
  const web = await registerAccounts(app, { pool, oauth: options.oauth });
  await registerWorkspace(app, { pool, web });
  const staff = await registerStaff(app, {
    pool,
    web,
    members: options.members,
  });
  await registerRecruitment(app, { pool, web, staff });
  await registerCommerce(app, {
    pool,
    web,
    staff,
    gateway: options.payments ?? new StripeGateway(),
  });
  await registerReferrals(app, { pool, web, staff });
  await registerInsights(app, { pool, web, staff });
  await registerDownloads(app, { pool, web });
  await registerNotifications(app, { pool });
  app.get("/health", async (_request, reply) => {
    try {
      const readiness = await pool.query<{ applied: number }>(
        "SELECT count(*)::integer AS applied FROM kush_migrations WHERE name = ANY($1::text[])",
        [
          [
            "0001_foundation",
            "0002_identity",
            "0003_delivery",
            "0004_support",
            "0005_support_requests",
            "0006_commercial",
            "0007_discord_link_throttling",
            "0008_discord_tickets",
            "0009_entitlements_role_sync",
            "0010_relinkable_discord_accounts",
            "0011_role_sync_generation",
            "0012_web_accounts",
            "0013_staff_access",
            "0014_notification_outbox",
            "0015_staff_recruitment",
            "0016_notification_feed",
            "0017_commission_workflow",
            "0018_protected_downloads",
            "0019_nda_channels",
            "0020_moderation_cases",
            "0021_vouches_offboarding",
            "0022_staff_parity",
            "0023_commission_pipeline",
            "0024_commerce",
            "0025_ticket_participants",
            "0026_member_role_grants",
          ],
        ],
      );
      if (readiness.rows[0]?.applied !== 26)
        throw new Error("Database migrations pending");
      await pool.query(
        "SELECT disabled FROM users LIMIT 0; SELECT created_at FROM sessions LIMIT 0; SELECT ip_hash FROM login_attempts LIMIT 0; SELECT endpoint FROM connection_profiles LIMIT 0; SELECT version FROM clients LIMIT 0; SELECT document FROM projects LIMIT 0; SELECT tenant_id FROM audit_events LIMIT 0; SELECT id FROM support_tenants LIMIT 0; SELECT create_category FROM support_tickets LIMIT 0; SELECT version FROM commercial_requests LIMIT 0; SELECT state FROM discord_account_links LIMIT 0; SELECT failed_attempts FROM discord_link_attempts LIMIT 0; SELECT kind FROM users LIMIT 0; SELECT user_id FROM discord_identities LIMIT 0; SELECT channel_id FROM discord_ticket_channels LIMIT 0; SELECT status FROM entitlements LIMIT 0; SELECT status FROM role_sync_jobs LIMIT 0; SELECT result FROM purchase_events LIMIT 0; SELECT subject FROM user_identities LIMIT 0; SELECT kind FROM sessions LIMIT 0; SELECT enabled_at FROM mfa_totp LIMIT 0; SELECT staff_role FROM staff_role_mappings LIMIT 0; SELECT status FROM notification_jobs LIMIT 0; SELECT status FROM staff_applications LIMIT 0; SELECT status FROM agreements LIMIT 0",
      );
      return { status: "ok", database: "connected" };
    } catch {
      return reply
        .code(503)
        .send({ status: "unavailable", database: "unavailable" });
    }
  });
  app.post<{ Body: LoginRequest }>(
    "/auth/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { body: loginJsonSchema },
    },
    async (request, reply) => {
      if (
        !(await consumeLoginAttempt(pool, tokenHash(`login-ip:${request.ip}`)))
      ) {
        await audit(null, "auth.login.rate_limited");
        reply.header("Retry-After", "60");
        return reply.code(429).send({ error: "Too many requests" });
      }
      const credentials = loginSchema.parse(request.body);
      const email = credentials.email.toLowerCase();
      const [record] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const valid = await verifyPassword(
        request.body.password,
        record?.passwordHash ?? dummyHash,
      );
      if (!record || !valid || record.disabled) {
        await audit(null, "auth.login.failed");
        return reply.code(401).send({ error: "Invalid email or password" });
      }
      const token = randomBytes(32).toString("hex");
      const issued = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(users)
          .where(eq(users.id, record.id))
          .for("update");
        if (
          !current ||
          current.disabled ||
          current.passwordHash !== record.passwordHash ||
          current.role !== record.role
        )
          return false;
        await tx
          .delete(sessions)
          .where(
            and(
              eq(sessions.userId, record.id),
              lt(sessions.expiresAt, new Date()),
            ),
          );
        await tx.insert(sessions).values({
          tokenHash: tokenHash(token),
          userId: record.id,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        });
        await tx
          .insert(auditEvents)
          .values({ actorId: record.id, action: "auth.login" });
        return true;
      });
      if (!issued) {
        await audit(null, "auth.login.failed");
        return reply.code(401).send({ error: "Invalid email or password" });
      }
      reply.header("Cache-Control", "no-store");
      return {
        token,
        user: { id: record.id, email: record.email, role: record.role },
      };
    },
  );
  app.get("/auth/me", async (request, reply) => {
    const user = await authenticate(request.headers.authorization);
    if (!user) {
      await audit(null, "access.denied").catch(() =>
        app.log.error("Denied access audit unavailable"),
      );
      return reply.code(401).send({ error: "Authentication required" });
    }
    reply.header("Cache-Control", "no-store");
    return { user };
  });
  app.post("/auth/logout", async (request, reply) => {
    const user = await authenticate(request.headers.authorization);
    if (!user) {
      await audit(null, "access.denied").catch(() =>
        app.log.error("Denied access audit unavailable"),
      );
      return reply.code(401).send({ error: "Authentication required" });
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(sessions)
        .where(
          eq(
            sessions.tokenHash,
            tokenHash(request.headers.authorization!.slice(7)),
          ),
        );
      await tx
        .insert(auditEvents)
        .values({ actorId: user.id, action: "auth.logout" });
    });
    return reply.code(204).send();
  });
  app.get("/audit", async (request, reply) => {
    const user = await authenticate(request.headers.authorization);
    if (!user) {
      await audit(null, "access.denied").catch(() =>
        app.log.error("Denied access audit unavailable"),
      );
      return reply.code(401).send({ error: "Authentication required" });
    }
    if (user.role !== "admin") {
      await audit(user.id, "access.denied");
      return reply
        .code(403)
        .send({ error: "Administrator permission required" });
    }
    const events = await db
      .select()
      .from(auditEvents)
      .where(isNull(auditEvents.tenantId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(100);
    reply.header("Cache-Control", "no-store");
    return { events };
  });
  app.get("/openapi.json", async () => ({
    openapi: "3.1.0",
    info: { title: "KUSH local API", version: "0.1.0" },
    servers: [{ url: "http://127.0.0.1:4310" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths: documentedPaths,
  }));
  return app;
}
