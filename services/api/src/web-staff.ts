import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import type { WebSession } from "./account-service.js";
import type { WebHelpers } from "./accounts.js";
import {
  StaffAccess,
  demand,
  discordMembersFromEnv,
  type DiscordMembers,
  type StaffContext,
} from "./staff-access.js";
import { StaffService } from "./staff-service.js";
import { CommissionWorkflow } from "./commission-workflow.js";

const uuidParam = (name: string) => ({
  type: "object",
  properties: { [name]: { type: "string", format: "uuid" } },
  required: [name],
  additionalProperties: false,
});

/**
 * Staff dashboard API (`/web/staff/...`). Every route resolves staff access
 * from scratch: website secret → session → live Discord roles → 2FA. Denials
 * carry a machine-readable `reason` so the website can show the right step.
 */
export async function registerStaff(
  app: FastifyInstance,
  {
    pool,
    web,
    members,
  }: { pool: Pool; web: WebHelpers; members?: () => DiscordMembers | null },
) {
  const resolvedMembers = members ?? (() => cached);
  const cached = members ? null : discordMembersFromEnv();
  const access = new StaffAccess(pool, resolvedMembers);
  const staff = new StaffService(pool, access);
  const workflow = new CommissionWorkflow(pool);
  const { signedIn, body } = web;

  /**
   * Like signedIn, but also requires live staff access. A denial is a
   * StaffAccessError, which the shared handler turns into 403/503 with a
   * machine-readable `reason` for the website.
   */
  const asStaff = (
    work: (ctx: StaffContext, request: FastifyRequest) => Promise<unknown>,
  ) =>
    signedIn(async (session: WebSession, request) =>
      work(await access.require(session), request),
    );
  const params = <T>(request: FastifyRequest) => request.params as T;

  const ticketScope = z.enum(["assigned", "queue", "all", "reports"]);
  const commissionScope = z.enum(["assigned", "all"]);
  const messageSchema = z
    .object({
      requestId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      kind: z.enum(["reply", "note"]),
      content: z.string().trim().min(1).max(10_000),
    })
    .strict();
  const statusSchema = z
    .object({
      expectedVersion: z.number().int().positive(),
      status: z.enum([
        "open",
        "pending",
        "in_progress",
        "waiting_for_customer",
        "resolved",
        "closed",
      ]),
      reason: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict();
  const versionSchema = z
    .object({ expectedVersion: z.number().int().positive() })
    .strict();
  const assignSchema = z
    .object({
      expectedVersion: z.number().int().positive(),
      userId: z.uuid().nullable(),
    })
    .strict();
  const commissionUpdateSchema = z
    .object({
      expectedVersion: z.number().int().positive(),
      status: z
        .enum([
          "reviewing",
          "awaiting_customer",
          "quoted",
          "accepted",
          "in_progress",
          "awaiting_review",
          "completed",
          "cancelled",
        ])
        .optional(),
      reviewNote: z.string().trim().max(4_000).nullable().optional(),
    })
    .strict();
  const scopeQuery = (values: readonly string[]) => ({
    type: "object",
    properties: { scope: { type: "string", enum: values } },
    additionalProperties: false,
  });

  app.get(
    "/web/staff/me",
    asStaff(async (ctx) => ({
      roles: ctx.roles,
      permissions: ctx.permissions,
      overview: await staff.overview(ctx),
    })),
  );

  app.get(
    "/web/staff/tickets",
    { schema: { querystring: scopeQuery(ticketScope.options) } },
    asStaff(async (ctx, request) => {
      const scope = ticketScope.parse(
        (request.query as { scope?: string }).scope ?? "assigned",
      );
      if (scope === "all") demand(ctx, "tickets.all");
      if (scope === "queue") demand(ctx, "tickets.queue");
      if (scope === "reports") demand(ctx, "reports.handle");
      if (scope === "assigned") demand(ctx, "tickets.assigned");
      return { tickets: await staff.listTickets(ctx, scope) };
    }),
  );

  app.get(
    "/web/staff/tickets/:ticketId",
    { schema: { params: uuidParam("ticketId") } },
    asStaff((ctx, request) =>
      staff.ticket(ctx, params<{ ticketId: string }>(request).ticketId),
    ),
  );

  app.post(
    "/web/staff/tickets/:ticketId/messages",
    { schema: { params: uuidParam("ticketId"), body: body(messageSchema) } },
    asStaff((ctx, request) =>
      staff.message(
        ctx,
        params<{ ticketId: string }>(request).ticketId,
        messageSchema.parse(request.body),
      ),
    ),
  );

  app.post(
    "/web/staff/tickets/:ticketId/status",
    { schema: { params: uuidParam("ticketId"), body: body(statusSchema) } },
    asStaff((ctx, request) =>
      staff.setStatus(
        ctx,
        params<{ ticketId: string }>(request).ticketId,
        statusSchema.parse(request.body),
      ),
    ),
  );

  app.post(
    "/web/staff/tickets/:ticketId/claim",
    { schema: { params: uuidParam("ticketId"), body: body(versionSchema) } },
    asStaff((ctx, request) =>
      staff.claim(
        ctx,
        params<{ ticketId: string }>(request).ticketId,
        versionSchema.parse(request.body).expectedVersion,
      ),
    ),
  );

  app.post(
    "/web/staff/tickets/:ticketId/assign",
    { schema: { params: uuidParam("ticketId"), body: body(assignSchema) } },
    asStaff((ctx, request) =>
      staff.assignTicket(
        ctx,
        params<{ ticketId: string }>(request).ticketId,
        assignSchema.parse(request.body),
      ),
    ),
  );

  app.get(
    "/web/staff/commissions",
    { schema: { querystring: scopeQuery(commissionScope.options) } },
    asStaff(async (ctx, request) => {
      const scope = commissionScope.parse(
        (request.query as { scope?: string }).scope ?? "assigned",
      );
      demand(ctx, scope === "all" ? "commissions.all" : "commissions.assigned");
      return { commissions: await staff.listCommissions(ctx, scope) };
    }),
  );

  app.get(
    "/web/staff/commissions/:requestId",
    { schema: { params: uuidParam("requestId") } },
    asStaff(async (ctx, request) => {
      const requestId = params<{ requestId: string }>(request).requestId;
      // staff.commission() enforces the scope; extras only follow it.
      const commission = await staff.commission(ctx, requestId);
      return {
        commission,
        ...(await workflow.extras(ctx.tenantId, requestId)),
      };
    }),
  );

  const quoteSchema = z
    .object({
      amount: z.string().trim().min(1).max(60),
      summary: z.string().trim().min(10).max(5000),
      timeframe: z.string().trim().max(200).nullable(),
    })
    .strict();
  const milestoneSchema = z
    .object({ title: z.string().trim().min(2).max(120) })
    .strict();
  const milestoneStatusSchema = z
    .object({ status: z.enum(["planned", "in_progress", "done"]) })
    .strict();
  const two = (a: string, b: string) => ({
    type: "object",
    properties: {
      [a]: { type: "string", format: "uuid" },
      [b]: { type: "string", format: "uuid" },
    },
    required: [a, b],
    additionalProperties: false,
  });

  app.post(
    "/web/staff/commissions/:requestId/quotes",
    { schema: { params: uuidParam("requestId"), body: body(quoteSchema) } },
    asStaff((ctx, request) =>
      workflow.propose(
        ctx,
        params<{ requestId: string }>(request).requestId,
        quoteSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    "/web/staff/commissions/:requestId/quotes/:quoteId/withdraw",
    { schema: { params: two("requestId", "quoteId") } },
    asStaff((ctx, request) => {
      const { requestId, quoteId } = params<{
        requestId: string;
        quoteId: string;
      }>(request);
      return workflow.withdraw(ctx, requestId, quoteId);
    }),
  );
  app.post(
    "/web/staff/commissions/:requestId/milestones",
    { schema: { params: uuidParam("requestId"), body: body(milestoneSchema) } },
    asStaff((ctx, request) =>
      workflow.addMilestone(
        ctx,
        params<{ requestId: string }>(request).requestId,
        milestoneSchema.parse(request.body).title,
      ),
    ),
  );
  app.post(
    "/web/staff/commissions/:requestId/milestones/:milestoneId",
    {
      schema: {
        params: two("requestId", "milestoneId"),
        body: body(milestoneStatusSchema),
      },
    },
    asStaff((ctx, request) => {
      const { requestId, milestoneId } = params<{
        requestId: string;
        milestoneId: string;
      }>(request);
      return workflow.setMilestone(
        ctx,
        requestId,
        milestoneId,
        milestoneStatusSchema.parse(request.body).status,
      );
    }),
  );

  app.post(
    "/web/staff/commissions/:requestId",
    {
      schema: {
        params: uuidParam("requestId"),
        body: body(commissionUpdateSchema),
      },
    },
    asStaff((ctx, request) =>
      staff.updateCommission(
        ctx,
        params<{ requestId: string }>(request).requestId,
        commissionUpdateSchema.parse(request.body),
      ),
    ),
  );

  app.post(
    "/web/staff/commissions/:requestId/assign",
    { schema: { params: uuidParam("requestId"), body: body(assignSchema) } },
    asStaff((ctx, request) =>
      staff.assignCommission(
        ctx,
        params<{ requestId: string }>(request).requestId,
        assignSchema.parse(request.body),
      ),
    ),
  );

  app.get(
    "/web/staff/team",
    asStaff(async (ctx) => ({ team: await staff.team(ctx) })),
  );

  app.get(
    "/web/staff/audit",
    asStaff(async (ctx) => ({ events: await staff.auditLog(ctx) })),
  );

  return { access, asStaff };
}

export type StaffHelpers = Awaited<ReturnType<typeof registerStaff>>;
