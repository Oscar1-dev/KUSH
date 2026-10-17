import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import {
  commercialKinds,
  commercialRequestInputSchema,
  commercialRequestPatchSchema,
  closeTicketSchema,
  discordLinkCompleteSchema,
  discordLinkStartSchema,
  messageInputSchema,
  reopenTicketSchema,
  ticketInputSchema,
  ticketPatchSchema,
  type User,
  z,
} from "@kush/contracts";
import { CommercialService } from "./commercial-service.js";
import { SupportError, SupportService } from "./support-service.js";

interface Options {
  pool: Pool;
  authenticate: (authorization: string | undefined) => Promise<User | null>;
}

export async function registerCommercial(
  app: FastifyInstance,
  { pool, authenticate }: Options,
) {
  const service = new CommercialService(pool);
  const support = new SupportService(pool);
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
          error: "Invalid commercial request",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      throw error;
    }
  };
  const user = async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await authenticate(request.headers.authorization);
    if (!authenticated) {
      reply.code(401).send({ error: "Authentication required" });
      return null;
    }
    return authenticated;
  };
  const uuidParams = (names: string[]) => ({
    type: "object",
    properties: Object.fromEntries(
      names.map((name) => [name, { type: "string", format: "uuid" }]),
    ),
    required: names,
    additionalProperties: false,
  });
  const linkedActor = (request: FastifyRequest, tenantId: string) =>
    service.linkedUser(
      request.headers["x-kush-discord-secret"] as string | undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
      tenantId,
      request.headers["x-kush-discord-user-id"] as string,
      request.headers["x-kush-discord-guild-id"] as string,
    );

  app.get<{ Params: { tenantId: string }; Querystring: { kind?: string } }>(
    "/commercial/tenants/:tenantId/requests",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        querystring: {
          type: "object",
          properties: { kind: { type: "string", enum: [...commercialKinds] } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        requests: await service.list(
          actor,
          request.params.tenantId,
          request.query.kind,
        ),
      }));
    },
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/commercial/tenants/:tenantId/requests",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        body: z.toJSONSchema(commercialRequestInputSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () =>
        reply.code(201).send({
          request: await service.create(
            actor,
            request.params.tenantId,
            request.body,
          ),
        }),
      );
    },
  );
  app.get<{ Params: { tenantId: string; requestId: string } }>(
    "/commercial/tenants/:tenantId/requests/:requestId",
    { schema: { params: uuidParams(["tenantId", "requestId"]) } },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        request: await service.get(
          actor,
          request.params.tenantId,
          request.params.requestId,
        ),
      }));
    },
  );
  app.patch<{ Params: { tenantId: string; requestId: string }; Body: unknown }>(
    "/commercial/tenants/:tenantId/requests/:requestId",
    {
      schema: {
        params: uuidParams(["tenantId", "requestId"]),
        body: z.toJSONSchema(commercialRequestPatchSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, async () => ({
        request: await service.update(
          actor,
          request.params.tenantId,
          request.params.requestId,
          request.body,
        ),
      }));
    },
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/tenants/:tenantId/links/start",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        body: z.toJSONSchema(discordLinkStartSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) => {
      const actor = await user(request, reply);
      if (!actor) return;
      return handle(reply, () =>
        service.startLink(actor, request.params.tenantId, request.body),
      );
    },
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/links/complete",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        body: z.toJSONSchema(discordLinkCompleteSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, () =>
        service.completeLink(
          request.headers["x-kush-discord-secret"] as string | undefined,
          process.env.KUSH_DISCORD_INTEGRATION_SECRET,
          request.params.tenantId,
          discordLinkCompleteSchema.parse(request.body),
        ),
      ),
  );

  app.get<{ Params: { tenantId: string } }>(
    "/discord/integration/tenants/:tenantId/tickets",
    { schema: { params: uuidParams(["tenantId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        tickets: await support.listTickets(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          {},
        ),
      })),
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/tickets",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        body: z.toJSONSchema(ticketInputSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () =>
        reply.code(201).send({
          ticket: await support.createTicket(
            await linkedActor(request, request.params.tenantId),
            request.params.tenantId,
            ticketInputSchema.parse(request.body),
          ),
        }),
      ),
  );
  app.get<{ Params: { tenantId: string; ticketId: string } }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId",
    { schema: { params: uuidParams(["tenantId", "ticketId"]) } },
    async (request, reply) =>
      handle(reply, async () =>
        support.detail(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
        ),
      ),
  );
  app.patch<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId",
    {
      schema: {
        params: uuidParams(["tenantId", "ticketId"]),
        body: z.toJSONSchema(ticketPatchSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.patchTicket(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          ticketPatchSchema.parse(request.body),
        ),
      })),
  );
  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId/messages",
    {
      schema: {
        params: uuidParams(["tenantId", "ticketId"]),
        body: z.toJSONSchema(messageInputSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.message(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          messageInputSchema.parse(request.body),
        ),
      })),
  );
  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId/close",
    {
      schema: {
        params: uuidParams(["tenantId", "ticketId"]),
        body: z.toJSONSchema(closeTicketSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.close(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          closeTicketSchema.parse(request.body),
        ),
      })),
  );
  app.post<{ Params: { tenantId: string; ticketId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId/reopen",
    {
      schema: {
        params: uuidParams(["tenantId", "ticketId"]),
        body: z.toJSONSchema(reopenTicketSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        ticket: await support.reopen(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
          reopenTicketSchema.parse(request.body),
        ),
      })),
  );
  app.get<{ Params: { tenantId: string; ticketId: string } }>(
    "/discord/integration/tenants/:tenantId/tickets/:ticketId/transcript",
    { schema: { params: uuidParams(["tenantId", "ticketId"]) } },
    async (request, reply) =>
      handle(reply, async () => {
        const detail = await support.detail(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.ticketId,
        );
        reply.header("X-Content-Type-Options", "nosniff");
        return { exportedAt: new Date().toISOString(), ...detail };
      }),
  );

  app.get<{ Params: { tenantId: string }; Querystring: { kind?: string } }>(
    "/discord/integration/tenants/:tenantId/commercial-requests",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        querystring: {
          type: "object",
          properties: { kind: { type: "string", enum: [...commercialKinds] } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        requests: await service.list(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.query.kind,
        ),
      })),
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/commercial-requests",
    {
      schema: {
        params: uuidParams(["tenantId"]),
        body: z.toJSONSchema(commercialRequestInputSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () =>
        reply.code(201).send({
          request: await service.create(
            await linkedActor(request, request.params.tenantId),
            request.params.tenantId,
            request.body,
          ),
        }),
      ),
  );
  app.get<{ Params: { tenantId: string; requestId: string } }>(
    "/discord/integration/tenants/:tenantId/commercial-requests/:requestId",
    { schema: { params: uuidParams(["tenantId", "requestId"]) } },
    async (request, reply) =>
      handle(reply, async () => ({
        request: await service.get(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.requestId,
        ),
      })),
  );
  app.patch<{ Params: { tenantId: string; requestId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/commercial-requests/:requestId",
    {
      schema: {
        params: uuidParams(["tenantId", "requestId"]),
        body: z.toJSONSchema(commercialRequestPatchSchema, {
          target: "draft-7",
          io: "input",
        }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => ({
        request: await service.update(
          await linkedActor(request, request.params.tenantId),
          request.params.tenantId,
          request.params.requestId,
          request.body,
        ),
      })),
  );
}
