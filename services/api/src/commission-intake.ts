import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z, type User } from "@kush/contracts";
import { CommercialService } from "./commercial-service.js";
import { CommissionWorkflow } from "./commission-workflow.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { enqueueNotification } from "./notifications.js";
import { SupportError } from "./support-service.js";

/**
 * One way in for commissions, shared by the website form and the Discord
 * commission panel, so both create exactly the same record:
 *   commission → linked support ticket (its private Discord channel opens
 *   via the outbox) → staff announcement.
 */

/** Service catalogue keys (the six services) plus legacy categories. */
export const commissionCategories = [
  "websites",
  "web-apps",
  "software",
  "discord",
  "creative",
  "automation",
  "gaming",
  "technical",
  // Legacy keys from before the catalogue; still valid for old requests.
  "website",
] as const;

export const commissionIntakeSchema = z
  .object({
    requestId: z.uuid(),
    category: z.enum(commissionCategories),
    serviceTier: z
      .enum(["starter", "standard", "premium"])
      .nullable()
      .default(null),
    title: z.string().trim().min(3).max(200),
    details: z.string().trim().min(20).max(10_000),
    approximateBudget: z.string().trim().max(120).nullable().default(null),
    preferredTimeframe: z.string().trim().max(200).nullable().default(null),
    referenceLinks: z.string().trim().max(2_000).nullable().default(null),
    contactPreference: z.string().trim().max(200).nullable().default(null),
  })
  .strict();
export type CommissionIntake = z.infer<typeof commissionIntakeSchema>;

export async function createCommission(
  pool: Pool,
  user: User,
  tenantId: string,
  input: CommissionIntake,
  origin: "website" | "discord",
) {
  const commercial = new CommercialService(pool);
  const workflow = new CommissionWorkflow(pool);
  const created = await commercial.create(user, tenantId, {
    ...input,
    kind: "commission",
    productUrl: null,
    origin,
  });
  // The linked ticket carries the conversation (website + Discord). Retries
  // reuse the same ticket (deterministic request ID).
  const ticketId = await workflow.linkTicket(user, tenantId, created);
  await enqueueNotification(
    pool,
    tenantId,
    "commission.created",
    created.id,
    {},
    `commission.created:${created.id}`,
  );
  return { created, ticketId };
}

/** Bot route: a member's commission from the Discord panel. */
export async function registerCommissionIntake(
  app: FastifyInstance,
  { pool }: { pool: Pool },
) {
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
        return reply.code(400).send({ error: "Invalid request" });
      throw error;
    }
  };
  const bot = (request: FastifyRequest) => {
    const header = (name: string) => {
      const value = request.headers[name];
      return typeof value === "string" ? value : "";
    };
    verifyIntegrationSecret(
      header("x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    return header("x-kush-discord-guild-id");
  };
  const bodySchema = commissionIntakeSchema.extend({
    discordUserId: z.string().regex(/^[0-9]{17,20}$/),
  });

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/commissions",
    {
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string", format: "uuid" } },
          required: ["tenantId"],
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { tenantId } = request.params;
        const tenant = await pool.query(
          "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
          [tenantId, guildId],
        );
        if (!tenant.rowCount)
          throw new SupportError(404, "Support resource not found");
        const { discordUserId, ...input } = bodySchema.parse(request.body);
        // A commission belongs to a KUSH account, so it shows on the website
        // too. Discord-only members are asked to link first.
        const link = (
          await pool.query<{ user_id: string }>(
            "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
            [tenantId, discordUserId],
          )
        ).rows[0];
        if (!link)
          throw new SupportError(
            409,
            "Link your KUSH account first (type !account), so you can follow the commission on the website too.",
          );
        await pool.query(
          "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer') ON CONFLICT (tenant_id,user_id) DO NOTHING",
          [tenantId, link.user_id],
        );
        const user = {
          id: link.user_id,
          email: "customer@accounts.kush.invalid",
          role: "customer",
        } as User;
        const { created } = await createCommission(
          pool,
          user,
          tenantId,
          input,
          "discord",
        );
        const ticket = (
          await pool.query<{ number: number }>(
            "SELECT t.number FROM commercial_requests r JOIN support_tickets t ON t.id=r.ticket_id AND t.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND r.id=$2",
            [tenantId, created.id],
          )
        ).rows[0];
        return {
          id: created.id,
          title: created.title,
          status: created.status,
          ticketNumber: ticket?.number ?? null,
        };
      }),
  );

  // A member's own commissions, for /commission status in Discord.
  app.get<{
    Params: { tenantId: string };
    Querystring: { discordUserId?: string };
  }>(
    "/discord/integration/tenants/:tenantId/commissions/mine",
    {
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string", format: "uuid" } },
          required: ["tenantId"],
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { tenantId } = request.params;
        const tenant = await pool.query(
          "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
          [tenantId, guildId],
        );
        if (!tenant.rowCount)
          throw new SupportError(404, "Support resource not found");
        const discordUserId = z
          .string()
          .regex(/^[0-9]{17,20}$/)
          .parse(request.query.discordUserId);
        const link = (
          await pool.query<{ user_id: string }>(
            "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
            [tenantId, discordUserId],
          )
        ).rows[0];
        if (!link)
          throw new SupportError(
            409,
            "Link your KUSH account first (type !account) to see your commissions.",
          );
        const rows = await pool.query(
          `SELECT r.id, r.title, r.category, r.status, r.updated_at AS "updatedAt", t.number AS "ticketNumber",
                  (SELECT q.amount FROM commission_quotes q WHERE q.request_id=r.id AND q.status IN ('proposed','accepted') ORDER BY q.created_at DESC LIMIT 1) AS "quote"
           FROM commercial_requests r LEFT JOIN support_tickets t ON t.id=r.ticket_id AND t.tenant_id=r.tenant_id
           WHERE r.tenant_id=$1 AND r.requester_id=$2 AND r.kind='commission'
           ORDER BY (r.status IN ('completed','cancelled','rejected','refunded')), r.updated_at DESC LIMIT 10`,
          [tenantId, link.user_id],
        );
        return { commissions: rows.rows };
      }),
  );
}
