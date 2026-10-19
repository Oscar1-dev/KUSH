import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import type { CommissionWorkflow } from "./commission-workflow.js";
import { creditBalance } from "./credit.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { formatMoney } from "./money.js";
import { demand, type StaffAccess, type StaffContext } from "./staff-access.js";
import type { StaffService } from "./staff-service.js";
import { businessStats } from "./stats.js";
import { SupportError } from "./support-service.js";

/**
 * Staff commission and customer tools for Discord slash commands. The bot is
 * only a messenger: every request names the Discord user who ran the
 * command, and the API re-reads that person's live Discord roles before
 * acting, exactly as the staff website does. Nothing here moves money.
 */
export function registerDiscordStaff(
  app: FastifyInstance,
  {
    pool,
    access,
    staff,
    workflow,
  }: {
    pool: Pool;
    access: StaffAccess;
    staff: StaffService;
    workflow: CommissionWorkflow;
  },
) {
  const base = "/discord/integration/tenants/:tenantId/staff";
  const snowflake = z.string().regex(/^[0-9]{17,20}$/);
  const uuid = { type: "string", format: "uuid" };

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
  /** Checks the bot's secret and guild, then resolves the acting staff member. */
  const actor = async (request: FastifyRequest, actorDiscordId: unknown) => {
    const header = (name: string) =>
      typeof request.headers[name] === "string"
        ? (request.headers[name] as string)
        : "";
    verifyIntegrationSecret(
      header("x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    const { tenantId } = request.params as { tenantId: string };
    const found = await pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, header("x-kush-discord-guild-id")],
    );
    if (!found.rowCount)
      throw new SupportError(404, "Support resource not found");
    return access.fromDiscord(tenantId, snowflake.parse(actorDiscordId));
  };

  /** A commission is named by its ticket: the channel it's run in, or a number. */
  const locate = async (
    ctx: StaffContext,
    where: { channelId?: string | undefined; ticket?: number | undefined },
  ) => {
    const row = (
      where.ticket
        ? await pool.query<{ id: string; number: number }>(
            `SELECT r.id, t.number FROM commercial_requests r JOIN support_tickets t ON t.id=r.ticket_id AND t.tenant_id=r.tenant_id
             WHERE r.tenant_id=$1 AND r.kind='commission' AND t.number=$2`,
            [ctx.tenantId, where.ticket],
          )
        : await pool.query<{ id: string; number: number }>(
            `SELECT r.id, t.number FROM commercial_requests r JOIN support_tickets t ON t.id=r.ticket_id AND t.tenant_id=r.tenant_id
             JOIN discord_ticket_channels d ON d.ticket_id=t.id AND d.tenant_id=t.tenant_id
             WHERE r.tenant_id=$1 AND r.kind='commission' AND d.channel_id=$2`,
            [ctx.tenantId, snowflake.parse(where.channelId)],
          )
    ).rows[0];
    if (!row)
      throw new SupportError(
        404,
        where.ticket
          ? `Ticket #${where.ticket} isn't a commission`
          : "Run this in a commission's ticket channel, or give the ticket number",
      );
    // Same scope rules as the website: developers only see their own work.
    const commission = await staff.commission(ctx, row.id);
    return { ...commission, ticketNumber: row.number };
  };
  const findQuery = z.object({
    actorDiscordId: z.string(),
    channelId: z.string().optional(),
    ticket: z.coerce.number().int().positive().optional(),
  });

  app.get<{ Params: { tenantId: string }; Querystring: unknown }>(
    `${base}/commissions`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const query = z
          .object({
            actorDiscordId: z.string(),
            scope: z.enum(["assigned", "all"]).default("assigned"),
          })
          .parse(request.query);
        const ctx = await actor(request, query.actorDiscordId);
        demand(
          ctx,
          query.scope === "all" ? "commissions.manage" : "commissions.assigned",
        );
        const rows = await staff.listCommissions(ctx, query.scope);
        const numbers = new Map(
          (
            await pool.query<{ id: string; number: number }>(
              "SELECT r.id, t.number FROM commercial_requests r JOIN support_tickets t ON t.id=r.ticket_id WHERE r.id = ANY($1::uuid[])",
              [rows.map((row) => row.id)],
            )
          ).rows.map((row) => [row.id, row.number]),
        );
        return {
          commissions: rows.slice(0, 25).map((row) => ({
            ...row,
            ticketNumber: numbers.get(row.id) ?? null,
          })),
        };
      }),
  );

  app.get<{ Params: { tenantId: string }; Querystring: unknown }>(
    `${base}/commissions/find`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const query = findQuery.parse(request.query);
        const ctx = await actor(request, query.actorDiscordId);
        const commission = await locate(ctx, query);
        return {
          commission,
          ...(await workflow.extras(ctx.tenantId, commission.id)),
        };
      }),
  );

  const target = {
    actorDiscordId: z.string(),
    channelId: z.string().optional(),
    ticket: z.number().int().positive().optional(),
  };

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/commissions/status`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const input = z
          .object({
            ...target,
            status: z.enum([
              "reviewing",
              "awaiting_customer",
              "in_progress",
              "awaiting_review",
              "completed",
              "cancelled",
            ]),
          })
          .strict()
          .parse(request.body);
        const ctx = await actor(request, input.actorDiscordId);
        const commission = await locate(ctx, input);
        // Discord has no edit form to go stale, so act on the current
        // version; the transition table still decides what's allowed.
        await staff.updateCommission(ctx, commission.id, {
          expectedVersion: commission.version as number,
          status: input.status,
        });
        return { ticketNumber: commission.ticketNumber, status: input.status };
      }),
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/commissions/assign`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const input = z
          .object({ ...target, assigneeDiscordId: snowflake.nullable() })
          .strict()
          .parse(request.body);
        const ctx = await actor(request, input.actorDiscordId);
        const commission = await locate(ctx, input);
        let userId: string | null = null;
        if (input.assigneeDiscordId) {
          userId =
            (
              await pool.query<{ user_id: string }>(
                "SELECT user_id FROM staff_members WHERE tenant_id=$1 AND discord_user_id=$2",
                [ctx.tenantId, input.assigneeDiscordId],
              )
            ).rows[0]?.user_id ?? null;
          if (!userId)
            throw new SupportError(
              409,
              "That person hasn't used KUSH staff tools yet. Ask them to run any staff command first",
            );
        }
        await staff.assignCommission(ctx, commission.id, {
          expectedVersion: commission.version as number,
          userId,
        });
        return { ticketNumber: commission.ticketNumber, assigned: !!userId };
      }),
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/commissions/quote`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const input = z
          .object({
            ...target,
            amountPence: z.number().int().min(50).max(100_000_00),
            summary: z.string().trim().min(10).max(5000),
            timeframe: z.string().trim().max(200).nullable().default(null),
            deliverables: z.string().trim().max(4000).nullable().default(null),
            revisions: z.number().int().min(0).max(50).nullable().default(null),
            expiresInDays: z
              .number()
              .int()
              .min(1)
              .max(90)
              .nullable()
              .default(14),
          })
          .strict()
          .parse(request.body);
        const ctx = await actor(request, input.actorDiscordId);
        const commission = await locate(ctx, input);
        const result = await workflow.propose(ctx, commission.id, {
          amount: formatMoney(input.amountPence),
          amountPence: input.amountPence,
          summary: input.summary,
          timeframe: input.timeframe,
          deliverables: input.deliverables,
          revisions: input.revisions,
          expiresInDays: input.expiresInDays,
        });
        return {
          ticketNumber: commission.ticketNumber,
          amount: formatMoney(input.amountPence),
          ...result,
        };
      }),
  );

  app.get<{
    Params: { tenantId: string; discordUserId: string };
    Querystring: unknown;
  }>(
    `${base}/customers/:discordUserId`,
    {
      schema: {
        params: {
          type: "object",
          properties: {
            tenantId: uuid,
            discordUserId: { type: "string", pattern: "^[0-9]{17,20}$" },
          },
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const query = z
          .object({ actorDiscordId: z.string() })
          .parse(request.query);
        const ctx = await actor(request, query.actorDiscordId);
        demand(ctx, "customers.view");
        const customer = (
          await pool.query<{ id: string; name: string; since: Date }>(
            `SELECT u.id, COALESCE(u.display_name, i.username, 'Customer') AS name, u.created_at AS since
             FROM discord_account_links l JOIN users u ON u.id=l.user_id
             LEFT JOIN user_identities i ON i.user_id=u.id AND i.provider='discord'
             WHERE l.tenant_id=$1 AND l.discord_user_id=$2 AND l.state='verified'`,
            [ctx.tenantId, request.params.discordUserId],
          )
        ).rows[0];
        if (!customer)
          throw new SupportError(
            404,
            "That member hasn't linked a KUSH account",
          );
        const count = async (sql: string, key: string = customer.id) =>
          Number(
            (await pool.query<{ n: string }>(sql, [ctx.tenantId, key])).rows[0]!
              .n,
          );
        return {
          customer: {
            name: customer.name,
            since: customer.since,
            paidOrders: await count(
              "SELECT count(*) AS n FROM orders WHERE tenant_id=$1 AND customer_id=$2 AND status IN ('paid','partially_refunded','refunded')",
            ),
            activeCommissions: await count(
              "SELECT count(*) AS n FROM commercial_requests WHERE tenant_id=$1 AND requester_id=$2 AND kind='commission' AND status NOT IN ('completed','cancelled','rejected','refunded')",
            ),
            openTickets: await count(
              "SELECT count(*) AS n FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND status NOT IN ('resolved','closed')",
            ),
            qualifiedReferrals: await count(
              "SELECT count(*) AS n FROM referrals WHERE tenant_id=$1 AND inviter_discord_id=$2 AND status='qualified'",
              request.params.discordUserId,
            ),
            creditPence: await creditBalance(pool, ctx.tenantId, customer.id),
          },
        };
      }),
  );

  app.get<{ Params: { tenantId: string }; Querystring: unknown }>(
    `${base}/stats`,
    {
      schema: {
        params: { type: "object", properties: { tenantId: uuid } },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const query = z
          .object({ actorDiscordId: z.string() })
          .parse(request.query);
        const ctx = await actor(request, query.actorDiscordId);
        demand(ctx, "stats.view");
        return { stats: await businessStats(pool, ctx.tenantId) };
      }),
  );
}
