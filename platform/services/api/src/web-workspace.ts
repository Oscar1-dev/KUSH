import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z, type User } from "@kush/contracts";
import type { WebSession } from "./account-service.js";
import type { WebHelpers } from "./accounts.js";
import { CommercialService } from "./commercial-service.js";
import { SupportError, SupportService } from "./support-service.js";
import { enqueueNotification } from "./notifications.js";
import { CommissionWorkflow } from "./commission-workflow.js";

/**
 * Customer workspace for the website: the signed-in customer's own
 * commissions and support tickets. All rules (ownership, idempotency,
 * internal notes hidden, state transitions) come from the existing services
 * that the Discord bot and staff tools already use, so a ticket opened in
 * Discord and one opened on the website are the same record.
 */

const commissionCategories = ["website", "software", "creative"] as const;
const uuidParam = (name: string) => ({
  type: "object",
  properties: { [name]: { type: "string", format: "uuid" } },
  required: [name],
  additionalProperties: false,
});

export async function registerWorkspace(
  app: FastifyInstance,
  { pool, web }: { pool: Pool; web: WebHelpers },
) {
  const support = new SupportService(pool);
  const commercial = new CommercialService(pool);
  const workflow = new CommissionWorkflow(pool);
  const { signedIn, body } = web;
  const tenantId = () => {
    const id = process.env.KUSH_SUPPORT_TENANT_ID;
    if (!id)
      throw new SupportError(503, "Customer workspace is not configured");
    return id;
  };

  /**
   * The services take a `User`. Only customer memberships may use the
   * workspace: staff accounts use the staff dashboard, so this view always
   * means "my own records" and never a staff queue.
   */
  const customer = async (session: WebSession): Promise<User> => {
    const member = await pool.query<{ role: string }>(
      "SELECT role FROM support_members WHERE tenant_id=$1 AND user_id=$2 AND active",
      [tenantId(), session.userId],
    );
    if (member.rows[0]?.role !== "customer")
      throw new SupportError(403, "This account uses the staff dashboard");
    return {
      id: session.userId,
      email: "customer@accounts.kush.invalid",
      role: "customer",
    } as User;
  };
  /** What a customer sees: no staff IDs or internal review notes. */
  const omit = <T extends object>(row: T, keys: string[]) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !keys.includes(key)),
    );
  const publicTicket = (ticket: { assignedUserId: string | null }) => ({
    ...omit(ticket, ["assignedUserId", "customerId"]),
    assigned: Boolean(ticket.assignedUserId),
  });
  const publicCommission = (row: { assignedUserId: string | null }) => ({
    ...omit(row, ["assignedUserId", "requesterId", "reviewNote"]),
    assigned: Boolean(row.assignedUserId),
  });
  const params = <T>(request: FastifyRequest) => request.params as T;

  // ------------------------------------------------------------ commissions

  const commissionSchema = z
    .object({
      requestId: z.uuid(),
      category: z.enum(commissionCategories),
      title: z.string().trim().min(3).max(200),
      details: z.string().trim().min(20).max(10_000),
      approximateBudget: z.string().trim().max(120).nullable(),
      preferredTimeframe: z.string().trim().max(200).nullable(),
    })
    .strict();

  app.get(
    "/web/workspace/commissions",
    signedIn(async (session) => ({
      commissions: (
        await commercial.list(await customer(session), tenantId(), "commission")
      )
        .reverse()
        .map(publicCommission),
    })),
  );

  app.get(
    "/web/workspace/commissions/:requestId",
    { schema: { params: uuidParam("requestId") } },
    signedIn(async (session, request) => {
      const requestId = params<{ requestId: string }>(request).requestId;
      const commission = await commercial.get(
        await customer(session),
        tenantId(),
        requestId,
      );
      return {
        commission: publicCommission(commission),
        ...(await workflow.extras(tenantId(), requestId)),
      };
    }),
  );

  const decisionSchema = z
    .object({ reason: z.string().trim().max(2000).optional() })
    .strict();
  for (const decision of ["accept", "decline"] as const)
    app.post(
      `/web/workspace/commissions/:requestId/quotes/:quoteId/${decision}`,
      {
        schema: {
          params: {
            type: "object",
            properties: {
              requestId: { type: "string", format: "uuid" },
              quoteId: { type: "string", format: "uuid" },
            },
            required: ["requestId", "quoteId"],
            additionalProperties: false,
          },
          body: body(decisionSchema),
        },
      },
      signedIn(async (session, request) => {
        const user = await customer(session);
        const { requestId, quoteId } = params<{
          requestId: string;
          quoteId: string;
        }>(request);
        return workflow.decide(
          user.id,
          tenantId(),
          requestId,
          quoteId,
          decision,
          decisionSchema.parse(request.body ?? {}).reason ?? null,
        );
      }),
    );

  app.post(
    "/web/workspace/commissions",
    { schema: { body: body(commissionSchema) } },
    signedIn(async (session, request) => {
      const input = commissionSchema.parse(request.body);
      const user = await customer(session);
      const created = await commercial.create(user, tenantId(), {
        ...input,
        kind: "commission",
        productUrl: null,
      });
      // A linked ticket carries the conversation (website + Discord). Retries
      // reuse the same ticket (deterministic request ID).
      await workflow.linkTicket(user, tenantId(), created);
      // Enqueued after the commit; the dedupe key makes a retried request
      // (same requestId -> same record) a no-op.
      await enqueueNotification(
        pool,
        tenantId(),
        "commission.created",
        created.id,
        {},
        `commission.created:${created.id}`,
      );
      return { commission: publicCommission(created) };
    }),
  );

  // ---------------------------------------------------------------- tickets

  const ticketSchema = z
    .object({
      requestId: z.uuid(),
      category: z.string().regex(/^[a-z0-9_-]{1,40}$/),
      description: z.string().trim().min(10).max(10_000),
    })
    .strict();
  const replySchema = z
    .object({
      requestId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      content: z.string().trim().min(1).max(10_000),
    })
    .strict();

  app.get(
    "/web/workspace/ticket-categories",
    signedIn(async (session) => {
      await customer(session);
      const tenant = await pool.query<{
        config: { categories: { key: string; label: string }[] };
      }>("SELECT config FROM support_tenants WHERE id=$1", [tenantId()]);
      return { categories: tenant.rows[0]?.config.categories ?? [] };
    }),
  );

  app.get(
    "/web/workspace/tickets",
    signedIn(async (session) => ({
      tickets: (
        await support.listTickets(await customer(session), tenantId(), {})
      ).map(publicTicket),
    })),
  );

  app.get(
    "/web/workspace/tickets/:ticketId",
    { schema: { params: uuidParam("ticketId") } },
    signedIn(async (session, request) => {
      const user = await customer(session);
      const detail = await support.detail(
        user,
        tenantId(),
        params<{ ticketId: string }>(request).ticketId,
      );
      return {
        ticket: publicTicket(detail.ticket),
        // detail() already returns replies only (no internal notes) to customers.
        messages: detail.messages.map(({ authorId, ...message }) => ({
          ...message,
          fromYou: authorId === user.id,
        })),
      };
    }),
  );

  app.post(
    "/web/workspace/tickets",
    { schema: { body: body(ticketSchema) } },
    signedIn(async (session, request) => {
      const ticket = await support.createTicket(
        await customer(session),
        tenantId(),
        ticketSchema.parse(request.body),
      );
      await enqueueNotification(
        pool,
        tenantId(),
        "ticket.created",
        ticket.id,
        {},
        `ticket.created:${ticket.id}`,
      );
      return { ticket: publicTicket(ticket) };
    }),
  );

  app.post(
    "/web/workspace/tickets/:ticketId/replies",
    { schema: { params: uuidParam("ticketId"), body: body(replySchema) } },
    signedIn(async (session, request) => {
      const input = replySchema.parse(request.body);
      const user = await customer(session);
      const ticketId = params<{ ticketId: string }>(request).ticketId;
      const ticket = await support.message(user, tenantId(), ticketId, {
        ...input,
        kind: "reply",
      });
      // Mirror the customer's website reply into the Discord ticket channel.
      const message = (
        await pool.query<{ id: string }>(
          "SELECT id FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 AND author_id=$3 AND request_id=$4",
          [tenantId(), ticketId, user.id, input.requestId],
        )
      ).rows[0];
      if (message)
        await enqueueNotification(
          pool,
          tenantId(),
          "ticket.message",
          ticketId,
          { messageId: message.id, audience: "channel" },
          `ticket.message:${message.id}:channel`,
        );
      return { ticket: publicTicket(ticket) };
    }),
  );
}
