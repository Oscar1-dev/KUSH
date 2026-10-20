import { registerDiscordStaff } from "./discord-staff.js";
import { registerMemberRoles } from "./member-roles.js";
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
import { CommunityService } from "./community.js";
import { ModerationService } from "./moderation.js";
import { enqueueNotification } from "./notifications.js";
import { SupportError } from "./support-service.js";

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

  const prioritySchema = z
    .object({
      expectedVersion: z.number().int().positive(),
      priority: z.enum(["low", "normal", "high", "urgent"]),
    })
    .strict();
  app.post(
    "/web/staff/tickets/:ticketId/priority",
    { schema: { params: uuidParam("ticketId"), body: body(prioritySchema) } },
    asStaff((ctx, request) =>
      staff.setPriority(
        ctx,
        params<{ ticketId: string }>(request).ticketId,
        prioritySchema.parse(request.body),
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
      amountPence: z
        .number()
        .int()
        .min(50)
        .max(100_000_00)
        .nullable()
        .default(null),
      deliverables: z.string().trim().max(4000).nullable().default(null),
      revisions: z.number().int().min(0).max(50).nullable().default(null),
      optionalServices: z.string().trim().max(2000).nullable().default(null),
      expiresInDays: z.number().int().min(1).max(90).nullable().default(null),
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

  // ------------------------------------------- Discord parity: moderation
  // The same services the bot uses; the website never keeps its own copy.
  const moderation = new ModerationService(pool);
  const community = new CommunityService(pool);
  const guildOf = async (tenantId: string) => {
    const row = (
      await pool.query<{ guild_id: string }>(
        "SELECT guild_id FROM support_tenants WHERE id=$1",
        [tenantId],
      )
    ).rows[0];
    if (!row) throw new SupportError(404, "Support resource not found");
    return row.guild_id;
  };
  const audit = (ctx: StaffContext, action: string) =>
    pool.query(
      "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,$3)",
      [ctx.tenantId, ctx.userId, action],
    );

  app.get(
    "/web/staff/moderation/cases",
    asStaff(async (ctx, request) => {
      demand(ctx, "moderation.view");
      const { target } = z
        .object({
          target: z
            .string()
            .regex(/^[0-9]{17,20}$/)
            .optional(),
        })
        .parse(request.query);
      return {
        cases: await moderation.list(
          ctx.tenantId,
          await guildOf(ctx.tenantId),
          target,
          25,
        ),
      };
    }),
  );

  app.get(
    "/web/staff/vouches",
    asStaff(async (ctx) => {
      demand(ctx, "vouches.manage");
      return { vouches: await community.staffVouches(ctx.tenantId) };
    }),
  );

  app.post(
    "/web/staff/vouches/:number/hide",
    {
      schema: {
        params: {
          type: "object",
          properties: { number: { type: "string", pattern: "^[0-9]{1,9}$" } },
          required: ["number"],
        },
      },
    },
    asStaff(async (ctx, request) => {
      demand(ctx, "vouches.manage");
      const number = Number(params<{ number: string }>(request).number);
      const result = await community.hideVouch(
        ctx.tenantId,
        await guildOf(ctx.tenantId),
        number,
        ctx.discordUserId,
      );
      // The bot deletes the Discord message (retried until it's gone).
      await enqueueNotification(
        pool,
        ctx.tenantId,
        "vouch.hidden",
        ctx.userId,
        { messageId: result.messageId ?? "" },
        `vouch.hidden:${number}`,
      );
      await audit(ctx, "staff.vouch.hidden");
      return { hidden: true };
    }),
  );

  const offboardSchema = z
    .object({ reason: z.string().trim().min(3).max(1_000) })
    .strict();
  app.post(
    "/web/staff/team/:userId/offboard",
    { schema: { params: uuidParam("userId"), body: body(offboardSchema) } },
    asStaff(async (ctx, request) => {
      demand(ctx, "team.offboard");
      const { userId } = params<{ userId: string }>(request);
      const { reason } = offboardSchema.parse(request.body);
      if (userId === ctx.userId)
        throw new SupportError(400, "You can't offboard yourself");
      const member = (
        await pool.query<{ discord_user_id: string; roles: string[] }>(
          "SELECT discord_user_id, roles FROM staff_members WHERE tenant_id=$1 AND user_id=$2 AND offboarded_at IS NULL",
          [ctx.tenantId, userId],
        )
      ).rows[0];
      if (!member) throw new SupportError(404, "That person isn't on the team");
      // Same rule as Discord: only the owner removes administrators or owners.
      if (
        member.roles.some(
          (role) => role === "administrator" || role === "owner",
        ) &&
        !ctx.roles.includes("owner")
      )
        throw new SupportError(
          403,
          "Only the owner can offboard an administrator",
        );
      const result = await community.offboard(
        ctx.tenantId,
        await guildOf(ctx.tenantId),
        member.discord_user_id,
        { reason, byDiscordUserId: ctx.discordUserId },
      );
      // The bot removes the Discord roles, DMs them and logs it.
      await enqueueNotification(
        pool,
        ctx.tenantId,
        "staff.offboarded",
        userId,
        {
          discordUserId: member.discord_user_id,
          reason,
          byDiscordUserId: ctx.discordUserId,
          ticketsUnassigned: String(result.ticketsUnassigned),
          commissionsUnassigned: String(result.commissionsUnassigned),
        },
        `staff.offboarded:${userId}:${Date.now()}`,
      );
      await audit(ctx, "staff.offboarded.web");
      return result;
    }),
  );

  app.get(
    "/web/staff/audit",
    asStaff(async (ctx) => ({ events: await staff.auditLog(ctx) })),
  );

  registerDiscordStaff(app, { pool, access, staff, workflow });
  registerMemberRoles(app, { pool, access, asStaff });

  return { access, asStaff };
}

export type StaffHelpers = Awaited<ReturnType<typeof registerStaff>>;
