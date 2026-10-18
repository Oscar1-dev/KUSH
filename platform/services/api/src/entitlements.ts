import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z, type User } from "@kush/contracts";
import { verifyIntegrationSecret } from "./discord-service.js";
import {
  EntitlementService,
  manualGrantSchema,
  manualRevokeSchema,
  productInputSchema,
  productPatchSchema,
  purchaseEventSchema,
} from "./entitlement-service.js";
import { SupportError } from "./support-service.js";

interface Options {
  pool: Pool;
  authenticate: (authorization: string | undefined) => Promise<User | null>;
}

const snowflakePattern = "^[0-9]{17,20}$";

/**
 * Entitlement, product and Discord role-sync routes.
 * - `/discord/integration/...`: the bot (integration secret).
 * - `/tenants/:tenantId/...`: signed-in KUSH users (owner checks in the service).
 */
export async function registerEntitlements(
  app: FastifyInstance,
  { pool, authenticate }: Options,
) {
  const service = new EntitlementService(pool);
  const integration = "/discord/integration/tenants/:tenantId";

  const handle = async (
    reply: FastifyReply,
    operation: () => Promise<unknown>,
  ) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SupportError)
        return reply.code(error.status).send({ error: error.message });
      if (error instanceof z.ZodError)
        return reply.code(400).send({
          error: "Invalid request",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      throw error;
    }
  };
  const header = (request: FastifyRequest, name: string) => {
    const value = request.headers[name];
    return typeof value === "string" ? value : "";
  };
  const bot = (request: FastifyRequest) => {
    verifyIntegrationSecret(
      header(request, "x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    return header(request, "x-kush-discord-guild-id");
  };
  const user = async (request: FastifyRequest, reply: FastifyReply) => {
    const found = await authenticate(request.headers.authorization);
    if (!found) reply.code(401).send({ error: "Authentication required" });
    return found;
  };
  const params = (names: string[], extra: Record<string, object> = {}) => ({
    type: "object",
    properties: {
      ...Object.fromEntries(
        names.map((name) => [name, { type: "string", format: "uuid" }]),
      ),
      ...extra,
    },
    required: [...names, ...Object.keys(extra)],
    additionalProperties: false,
  });
  const member = {
    discordUserId: { type: "string", pattern: snowflakePattern },
  };
  const body = (schema: z.ZodType) =>
    z.toJSONSchema(schema, { target: "draft-7", io: "input" });

  // ------------------------------------------------------------- the bot

  app.post<{
    Params: { tenantId: string; discordUserId: string };
    Body: unknown;
  }>(
    `${integration}/members/:discordUserId/rules`,
    {
      schema: {
        params: params(["tenantId"], member),
        body: body(z.object({ version: z.string().min(1).max(40) }).strict()),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { version } = z
          .object({ version: z.string() })
          .parse(request.body);
        await service.acceptRules(
          request.params.tenantId,
          guildId,
          request.params.discordUserId,
          version,
        );
        return { accepted: true };
      }),
  );

  app.post<{
    Params: { tenantId: string; discordUserId: string };
    Body: unknown;
  }>(
    `${integration}/members/:discordUserId/presence`,
    {
      schema: {
        params: params(["tenantId"], member),
        body: body(z.object({ present: z.boolean() }).strict()),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { present } = z
          .object({ present: z.boolean() })
          .parse(request.body);
        await service.membership(
          request.params.tenantId,
          guildId,
          request.params.discordUserId,
          present,
        );
        return { present };
      }),
  );

  app.get<{ Params: { tenantId: string; discordUserId: string } }>(
    `${integration}/members/:discordUserId/roles`,
    { schema: { params: params(["tenantId"], member) } },
    async (request, reply) =>
      handle(reply, async () =>
        service.desiredRoles(
          request.params.tenantId,
          bot(request),
          request.params.discordUserId,
        ),
      ),
  );

  app.get<{ Params: { tenantId: string; discordUserId: string } }>(
    `${integration}/members/:discordUserId/entitlements`,
    { schema: { params: params(["tenantId"], member) } },
    async (request, reply) =>
      handle(reply, async () =>
        service.entitlementsForDiscord(
          request.params.tenantId,
          bot(request),
          request.params.discordUserId,
        ),
      ),
  );

  app.get<{ Params: { tenantId: string } }>(
    `${integration}/role-sync/jobs`,
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        jobs: await service.dueJobs(request.params.tenantId, bot(request)),
      })),
  );

  app.post<{ Params: { tenantId: string; jobId: string }; Body: unknown }>(
    `${integration}/role-sync/jobs/:jobId`,
    {
      schema: {
        params: params(["tenantId", "jobId"]),
        body: body(
          z
            .object({
              ok: z.boolean(),
              generation: z.number().int().min(0),
              error: z.string().max(500).optional(),
            })
            .strict(),
        ),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const input = z
          .object({
            ok: z.boolean(),
            generation: z.number().int(),
            error: z.string().optional(),
          })
          .parse(request.body);
        await service.finishJob(
          request.params.tenantId,
          guildId,
          request.params.jobId,
          input.generation,
          input.ok
            ? { ok: true }
            : { ok: false, error: input.error ?? "unknown" },
        );
        return { recorded: true };
      }),
  );

  app.post<{ Params: { tenantId: string } }>(
    `${integration}/role-sync/reconcile`,
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        queued: await service.enqueueAll(request.params.tenantId, bot(request)),
      })),
  );

  // Trusted server-side event path. Only the simulated provider exists, and
  // only while KUSH_SIMULATED_PURCHASES=true.
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${integration}/purchase-events`,
    {
      schema: { params: params(["tenantId"]), body: body(purchaseEventSchema) },
    },
    async (request, reply) =>
      handle(reply, async () => {
        bot(request);
        return service.processPurchaseEvent(
          request.params.tenantId,
          request.body,
        );
      }),
  );

  // ------------------------------------------------------ signed-in users

  app.post<{ Params: { tenantId: string } }>(
    "/discord/tenants/:tenantId/links/revoke",
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        revoked: await service.unlink(request.params.tenantId, actor.id),
      }));
    },
  );

  app.get<{ Params: { tenantId: string } }>(
    "/tenants/:tenantId/products",
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        products: await service.listProducts(actor, request.params.tenantId),
      }));
    },
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/tenants/:tenantId/products",
    {
      schema: { params: params(["tenantId"]), body: body(productInputSchema) },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () =>
        reply.code(201).send({
          product: await service.createProduct(
            actor,
            request.params.tenantId,
            request.body,
          ),
        }),
      );
    },
  );

  app.patch<{ Params: { tenantId: string; productId: string }; Body: unknown }>(
    "/tenants/:tenantId/products/:productId",
    {
      schema: {
        params: params(["tenantId", "productId"]),
        body: body(productPatchSchema),
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        product: await service.updateProduct(
          actor,
          request.params.tenantId,
          request.params.productId,
          request.body,
        ),
      }));
    },
  );

  app.get<{ Params: { tenantId: string }; Querystring: { userId?: string } }>(
    "/tenants/:tenantId/entitlements",
    {
      schema: {
        params: params(["tenantId"]),
        querystring: {
          type: "object",
          properties: { userId: { type: "string", format: "uuid" } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        entitlements: await service.listEntitlements(
          actor,
          request.params.tenantId,
          request.query.userId,
        ),
      }));
    },
  );

  // Customer self-service view. Customers cannot reach /tenants/* at all
  // (global guard), so their own entitlements live under /commercial/.
  app.get<{ Params: { tenantId: string } }>(
    "/commercial/tenants/:tenantId/entitlements/mine",
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        entitlements: await service.listOwnEntitlements(
          actor,
          request.params.tenantId,
        ),
      }));
    },
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/tenants/:tenantId/entitlements",
    { schema: { params: params(["tenantId"]), body: body(manualGrantSchema) } },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () =>
        reply
          .code(201)
          .send(
            await service.grantManual(
              actor,
              request.params.tenantId,
              request.body,
            ),
          ),
      );
    },
  );

  app.post<{
    Params: { tenantId: string; entitlementId: string };
    Body: unknown;
  }>(
    "/tenants/:tenantId/entitlements/:entitlementId/revoke",
    {
      schema: {
        params: params(["tenantId", "entitlementId"]),
        body: body(manualRevokeSchema),
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () =>
        service.revokeManual(
          actor,
          request.params.tenantId,
          request.params.entitlementId,
          request.body,
        ),
      );
    },
  );
}
