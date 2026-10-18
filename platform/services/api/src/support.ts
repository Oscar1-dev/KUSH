import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
} from "fastify";
import type { Pool } from "@kush/database";
import {
  z,
  type User,
  tenantInputSchema,
  memberInputSchema,
  ticketInputSchema,
  ticketPatchSchema,
  messageInputSchema,
  closeTicketSchema,
  reopenTicketSchema,
  supportStatuses,
  supportPriorities,
} from "@kush/contracts";
import { SupportService, SupportError } from "./support-service.js";
interface Options {
  pool: Pool;
  authenticate: (authorization: string | undefined) => Promise<User | null>;
}
export async function registerSupport(
  app: FastifyInstance,
  { pool, authenticate }: Options,
) {
  const service = new SupportService(pool);
  type Params = { tenantId?: string; ticketId?: string; userId?: string };
  const route = (
    method: HTTPMethods,
    url: string,
    handler: (
      user: User,
      params: Params,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>,
    body?: z.ZodType,
  ) => {
    const properties: Record<string, { type: string; format: string }> = {};
    for (const part of url.split("/"))
      if (part.startsWith(":"))
        properties[part.slice(1)] = { type: "string", format: "uuid" };
    app.route({
      method,
      url,
      schema: {
        ...(Object.keys(properties).length
          ? {
              params: {
                type: "object",
                properties,
                required: Object.keys(properties),
                additionalProperties: false,
              },
            }
          : {}),
        ...(body
          ? { body: z.toJSONSchema(body, { target: "draft-7", io: "input" }) }
          : {}),
      },
      handler: async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const user = await authenticate(request.headers.authorization);
        if (!user)
          return reply.code(401).send({ error: "Authentication required" });
        try {
          return await handler(user, request.params as Params, request, reply);
        } catch (error) {
          if (error instanceof SupportError)
            return reply.code(error.status).send({ error: error.message });
          if (error instanceof z.ZodError)
            return reply.code(400).send({
              error: "Invalid support request",
              details: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            });
          throw error;
        }
      },
    });
  };
  const base = "/support/tenants";
  route("GET", base, async (user) => ({
    tenants: await service.listTenants(user),
  }));
  route(
    "POST",
    base,
    async (user, _params, request, reply) => {
      const tenant = await service.createTenant(
        user,
        tenantInputSchema.parse(request.body),
      );
      return reply.code(201).send({ tenant });
    },
    tenantInputSchema,
  );
  route("GET", `${base}/:tenantId`, async (user, p) => ({
    tenant: await service.getTenant(user, p.tenantId!),
  }));
  route(
    "PATCH",
    `${base}/:tenantId`,
    async (user, p, request) => ({
      tenant: await service.updateTenant(
        user,
        p.tenantId!,
        tenantInputSchema.parse(request.body),
      ),
    }),
    tenantInputSchema,
  );
  route("GET", `${base}/:tenantId/members`, async (user, p) => ({
    members: await service.members(user, p.tenantId!),
  }));
  route(
    "POST",
    `${base}/:tenantId/members`,
    async (user, p, request) => ({
      member: await service.putMember(
        user,
        p.tenantId!,
        memberInputSchema.parse(request.body),
      ),
    }),
    memberInputSchema,
  );
  route(
    "DELETE",
    `${base}/:tenantId/members/:userId`,
    async (user, p, _request, reply) => {
      await service.removeMember(user, p.tenantId!, p.userId!);
      return reply.code(204).send();
    },
  );
  route("GET", `${base}/:tenantId/tickets`, async (user, p, request) => ({
    tickets: await service.listTickets(
      user,
      p.tenantId!,
      z
        .object({
          search: z.string().max(200).optional(),
          status: z.enum(supportStatuses).optional(),
          priority: z.enum(supportPriorities).optional(),
          assignedUserId: z.uuid().optional(),
        })
        .strict()
        .parse(request.query),
    ),
  }));
  route(
    "POST",
    `${base}/:tenantId/tickets`,
    async (user, p, request, reply) => {
      const ticket = await service.createTicket(
        user,
        p.tenantId!,
        ticketInputSchema.parse(request.body),
      );
      return reply.code(201).send({ ticket });
    },
    ticketInputSchema,
  );
  const ticket = `${base}/:tenantId/tickets/:ticketId`;
  route("GET", ticket, async (user, p) =>
    service.detail(user, p.tenantId!, p.ticketId!),
  );
  route(
    "PATCH",
    ticket,
    async (user, p, request) => ({
      ticket: await service.patchTicket(
        user,
        p.tenantId!,
        p.ticketId!,
        ticketPatchSchema.parse(request.body),
      ),
    }),
    ticketPatchSchema,
  );
  route(
    "POST",
    `${ticket}/messages`,
    async (user, p, request) => ({
      ticket: await service.message(
        user,
        p.tenantId!,
        p.ticketId!,
        messageInputSchema.parse(request.body),
      ),
    }),
    messageInputSchema,
  );
  route(
    "POST",
    `${ticket}/close`,
    async (user, p, request) => ({
      ticket: await service.close(
        user,
        p.tenantId!,
        p.ticketId!,
        closeTicketSchema.parse(request.body),
      ),
    }),
    closeTicketSchema,
  );
  route(
    "POST",
    `${ticket}/reopen`,
    async (user, p, request) => ({
      ticket: await service.reopen(
        user,
        p.tenantId!,
        p.ticketId!,
        reopenTicketSchema.parse(request.body),
      ),
    }),
    reopenTicketSchema,
  );
  route("GET", `${ticket}/transcript`, async (user, p, _request, reply) => {
    const detail = await service.detail(user, p.tenantId!, p.ticketId!);
    reply.header(
      "Content-Disposition",
      `attachment; filename="ticket-${detail.ticket.number}.json"`,
    );
    reply.header("X-Content-Type-Options", "nosniff");
    return { exportedAt: new Date().toISOString(), ...detail };
  });
}
