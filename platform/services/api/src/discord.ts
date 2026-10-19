import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import {
  closeTicketSchema,
  discordAssignSchema,
  messageInputSchema,
  reopenTicketSchema,
  ticketChannelInputSchema,
  ticketChannelStateSchema,
  ticketInputSchema,
  ticketPatchSchema,
  z,
} from "@kush/contracts";
import { DiscordService, verifyIntegrationSecret } from "./discord-service.js";
import {
  reportCategoriesOf,
  SupportError,
  SupportService,
} from "./support-service.js";

interface Options {
  pool: Pool;
}

/**
 * Bot-facing ticket routes. Authentication: the shared integration secret,
 * plus the acting Discord member in headers. Authorisation: SupportService,
 * exactly as for desktop users. Members without a KUSH account act through a
 * Discord identity created on their first ticket.
 */
export async function registerDiscord(app: FastifyInstance, { pool }: Options) {
  const discord = new DiscordService(pool);
  const support = new SupportService(pool);
  const base = "/discord/integration/tenants/:tenantId";

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
          error: "Invalid Discord request",
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
  const authenticate = (request: FastifyRequest) =>
    verifyIntegrationSecret(
      header(request, "x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
  const guildOf = (request: FastifyRequest) =>
    header(request, "x-kush-discord-guild-id");
  const actor = (
    request: FastifyRequest,
    tenantId: string,
    provision = false,
  ) => {
    authenticate(request);
    return discord.actor({
      tenantId,
      guildId: guildOf(request),
      discordUserId: header(request, "x-kush-discord-user-id"),
      provision,
    });
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
  const body = (schema: z.ZodType) =>
    z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  const channelId = {
    channelId: { type: "string", pattern: "^[0-9]{17,20}$" },
  };

  // ------------------------------------------------------------ customers

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/tickets`,
    { schema: { params: params(["tenantId"]), body: body(ticketInputSchema) } },
    async (request, reply) =>
      handle(reply, async () => {
        const { tenantId } = request.params;
        const input = ticketInputSchema.parse(request.body);
        const user = await actor(request, tenantId, true);
        await discord.assertCanOpen(tenantId, user, input.requestId);
        const ticket = await support.createTicket(user, tenantId, input);
        const tenant = await support.getTenant(user, tenantId);
        return reply.code(201).send({
          ticket,
          queue: reportCategoriesOf(tenant.config).includes(ticket.category)
            ? "reports"
            : "support",
          channel: await discord.channelForTicket(tenantId, ticket.id),
        });
      }),
  );

  app.get<{ Params: { tenantId: string } }>(
    `${base}/tickets`,
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        tickets: await support.listTickets(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          {},
        ),
      })),
  );

  app.get<{ Params: { tenantId: string; number: string } }>(
    `${base}/tickets/by-number/:number`,
    {
      schema: {
        params: params(["tenantId"], {
          number: { type: "string", pattern: "^[1-9][0-9]{0,8}$" },
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.byNumber(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          Number(request.params.number),
        ),
      })),
  );

  app.get<{ Params: { tenantId: string; channelId: string } }>(
    `${base}/tickets/by-channel/:channelId`,
    { schema: { params: params(["tenantId"], channelId) } },
    async (request, reply) =>
      handle(reply, async () => {
        const user = await actor(request, request.params.tenantId);
        const ticketId = await discord.ticketIdForChannel(
          request.params.tenantId,
          request.params.channelId,
        );
        const detail = await support.detail(
          user,
          request.params.tenantId,
          ticketId,
        );
        return { ticket: detail.ticket };
      }),
  );

  app.get<{ Params: { tenantId: string; ticketId: string } }>(
    `${base}/tickets/:ticketId`,
    { schema: { params: params(["tenantId", "ticketId"]) } },
    async (request, reply) =>
      handle(reply, async () =>
        support.detail(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
        ),
      ),
  );

  app.put<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId/channel`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(ticketChannelInputSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const { tenantId, ticketId } = request.params;
        const user = await actor(request, tenantId);
        await support.detail(user, tenantId, ticketId); // Visibility check.
        const input = ticketChannelInputSchema.parse(request.body);
        return discord.setChannel({
          tenantId,
          ticketId,
          guildId: guildOf(request),
          ...input,
        });
      }),
  );

  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId/messages`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(messageInputSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.message(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          messageInputSchema.parse(request.body),
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId/close`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(closeTicketSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.close(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          closeTicketSchema.parse(request.body),
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId/reopen`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(reopenTicketSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.reopen(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          reopenTicketSchema.parse(request.body),
        ),
      })),
  );

  app.get<{ Params: { tenantId: string; ticketId: string } }>(
    `${base}/tickets/:ticketId/transcript`,
    { schema: { params: params(["tenantId", "ticketId"]) } },
    async (request, reply) =>
      handle(reply, async () => {
        const detail = await support.detail(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
        );
        reply.header("X-Content-Type-Options", "nosniff");
        return { exportedAt: new Date().toISOString(), ...detail };
      }),
  );

  // ---------------------------------------------------------------- staff

  app.get<{ Params: { tenantId: string } }>(
    `${base}/queue`,
    { schema: { params: params(["tenantId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        queue: await support.queue(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; ticketId: string } }>(
    `${base}/tickets/:ticketId/claim`,
    { schema: { params: params(["tenantId", "ticketId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.claim(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; number: string } }>(
    `${base}/tickets/by-number/:number/claim`,
    {
      schema: {
        params: params(["tenantId"], {
          number: { type: "string", pattern: "^[1-9][0-9]{0,8}$" },
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.claimByNumber(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          Number(request.params.number),
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; channelId: string } }>(
    `${base}/tickets/by-channel/:channelId/claim`,
    { schema: { params: params(["tenantId"], channelId) } },
    async (request, reply) =>
      handle(reply, async () => {
        const user = await actor(request, request.params.tenantId);
        const ticketId = await discord.ticketIdForChannel(
          request.params.tenantId,
          request.params.channelId,
        );
        return {
          ticket: await support.claim(user, request.params.tenantId, ticketId),
        };
      }),
  );

  app.post<{ Params: { tenantId: string; channelId: string }; Body: unknown }>(
    `${base}/tickets/by-channel/:channelId/participants`,
    { schema: { params: params(["tenantId"], channelId) } },
    async (request, reply) =>
      handle(reply, async () => {
        const user = await actor(request, request.params.tenantId);
        const { discordUserId } = z
          .object({ discordUserId: z.string().regex(/^[0-9]{17,20}$/) })
          .strict()
          .parse(request.body);
        const ticketId = await discord.ticketIdForChannel(
          request.params.tenantId,
          request.params.channelId,
        );
        return support.addParticipant(
          user,
          request.params.tenantId,
          ticketId,
          discordUserId,
        );
      }),
  );

  app.patch<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(ticketPatchSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.patchTicket(
          await actor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          ticketPatchSchema.parse(request.body),
        ),
      })),
  );

  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    `${base}/tickets/:ticketId/assign`,
    {
      schema: {
        params: params(["tenantId", "ticketId"]),
        body: body(discordAssignSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const { tenantId, ticketId } = request.params;
        const user = await actor(request, tenantId);
        const input = discordAssignSchema.parse(request.body);
        const assignedUserId = input.assigneeDiscordUserId
          ? await discord.linkedUserId(tenantId, input.assigneeDiscordUserId)
          : null;
        return {
          ticket: await support.patchTicket(user, tenantId, ticketId, {
            expectedVersion: input.expectedVersion,
            assignedUserId,
          }),
        };
      }),
  );

  // ------------------------------------------------- bot service (recovery)

  app.get<{
    Params: { tenantId: string };
    Querystring: { state?: "active" | "archived" };
  }>(
    `${base}/ticket-channels`,
    {
      schema: {
        params: params(["tenantId"]),
        querystring: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["active", "archived"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        authenticate(request);
        return {
          channels: await discord.channels(
            request.params.tenantId,
            guildOf(request),
            request.query.state ?? "active",
          ),
        };
      }),
  );

  app.patch<{ Params: { tenantId: string; channelId: string }; Body: unknown }>(
    `${base}/ticket-channels/:channelId`,
    {
      schema: {
        params: params(["tenantId"], channelId),
        body: body(ticketChannelStateSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        authenticate(request);
        await discord.setChannelState(
          request.params.tenantId,
          guildOf(request),
          request.params.channelId,
          ticketChannelStateSchema.parse(request.body).state,
        );
        return { ok: true };
      }),
  );
}
