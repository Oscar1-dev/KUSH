import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import { verifyIntegrationSecret } from "./discord-service.js";
import { SupportError } from "./support-service.js";

/**
 * Vouches and staff offboarding.
 * - Bot routes (integration secret): record/hide vouches, offboard staff.
 * - Public route: visible vouches for the website (no personal data beyond
 *   the display name the customer chose to vouch under).
 */

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
/** One vouch per customer per day keeps the wall honest. */
const VOUCH_COOLDOWN_HOURS = 24;

export const vouchInputSchema = z
  .object({
    discordUserId: snowflake,
    authorName: z.string().trim().min(1).max(64),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().min(10).max(600),
  })
  .strict();

export const offboardInputSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
    byDiscordUserId: snowflake,
  })
  .strict();

export interface Vouch {
  number: number;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
}

const vouchColumns = `number, author_name AS "authorName", rating, body, created_at AS "createdAt"`;

export class CommunityService {
  constructor(private readonly pool: Pool) {}

  private async tenant(tenantId: string, guildId: string) {
    const result = await this.pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, guildId],
    );
    if (!result.rowCount)
      throw new SupportError(404, "Support resource not found");
  }

  async vouch(
    tenantId: string,
    guildId: string,
    input: z.infer<typeof vouchInputSchema>,
  ): Promise<Vouch> {
    await this.tenant(tenantId, guildId);
    const recent = await this.pool.query(
      `SELECT 1 FROM vouches WHERE tenant_id=$1 AND discord_user_id=$2
       AND created_at > now() - make_interval(hours => $3)`,
      [tenantId, input.discordUserId, VOUCH_COOLDOWN_HOURS],
    );
    if (recent.rowCount)
      throw new SupportError(
        429,
        "You've already left a vouch today. Thank you! You can add another tomorrow.",
      );
    const result = await this.pool.query<Vouch>(
      `WITH n AS (
         UPDATE support_tenants SET next_vouch_number = next_vouch_number + 1
         WHERE id=$1 RETURNING next_vouch_number - 1 AS number
       )
       INSERT INTO vouches(tenant_id, number, discord_user_id, author_name, rating, body)
       SELECT $1, n.number, $2, $3, $4, $5 FROM n
       RETURNING ${vouchColumns}`,
      [
        tenantId,
        input.discordUserId,
        input.authorName,
        input.rating,
        input.body,
      ],
    );
    return result.rows[0]!;
  }

  async setVouchMessage(
    tenantId: string,
    guildId: string,
    number: number,
    messageId: string,
  ) {
    await this.tenant(tenantId, guildId);
    await this.pool.query(
      "UPDATE vouches SET message_id=$3 WHERE tenant_id=$1 AND number=$2",
      [tenantId, number, messageId],
    );
  }

  /** Hides a vouch from the website; returns its Discord message to delete. */
  async hideVouch(
    tenantId: string,
    guildId: string,
    number: number,
    byDiscordUserId: string,
  ) {
    await this.tenant(tenantId, guildId);
    const result = await this.pool.query<{ messageId: string | null }>(
      `UPDATE vouches SET hidden_at=COALESCE(hidden_at, now()), hidden_by_discord_id=$3
       WHERE tenant_id=$1 AND number=$2 RETURNING message_id AS "messageId"`,
      [tenantId, number, byDiscordUserId],
    );
    const row = result.rows[0];
    if (!row) throw new SupportError(404, "Vouch not found");
    return { hidden: true, messageId: row.messageId };
  }

  async publicVouches(tenantId: string, limit: number) {
    const [items, stats] = await Promise.all([
      this.pool.query<Vouch>(
        `SELECT ${vouchColumns} FROM vouches WHERE tenant_id=$1 AND hidden_at IS NULL
         ORDER BY created_at DESC LIMIT $2`,
        [tenantId, limit],
      ),
      this.pool.query<{ count: number; average: number | null }>(
        `SELECT count(*)::integer AS count, round(avg(rating)::numeric, 1)::float AS average
         FROM vouches WHERE tenant_id=$1 AND hidden_at IS NULL`,
        [tenantId],
      ),
    ]);
    return {
      vouches: items.rows,
      count: stats.rows[0]?.count ?? 0,
      average: stats.rows[0]?.average ?? null,
    };
  }

  /**
   * Marks a staff member offboarded and hands their open work back to the
   * queue. Discord roles are removed by the bot; staff website access is
   * derived from live roles, so it ends with them.
   */
  async offboard(
    tenantId: string,
    guildId: string,
    discordUserId: string,
    input: z.infer<typeof offboardInputSchema>,
  ) {
    await this.tenant(tenantId, guildId);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const member = (
        await c.query<{ userId: string }>(
          `UPDATE staff_members SET offboarded_at=now(), offboarded_reason=$3, offboarded_by_discord_id=$4
           WHERE tenant_id=$1 AND discord_user_id=$2 RETURNING user_id AS "userId"`,
          [tenantId, discordUserId, input.reason, input.byDiscordUserId],
        )
      ).rows[0];
      let tickets = 0;
      let commissions = 0;
      if (member) {
        tickets =
          (
            await c.query(
              `UPDATE support_tickets SET assigned_user_id=NULL, version=version+1, updated_at=now()
               WHERE tenant_id=$1 AND assigned_user_id=$2 AND status <> 'closed'`,
              [tenantId, member.userId],
            )
          ).rowCount ?? 0;
        commissions =
          (
            await c.query(
              `UPDATE commercial_requests SET assigned_user_id=NULL, version=version+1, updated_at=now()
               WHERE tenant_id=$1 AND assigned_user_id=$2
               AND status NOT IN ('completed','rejected','cancelled')`,
              [tenantId, member.userId],
            )
          ).rowCount ?? 0;
        await c.query(
          "INSERT INTO audit_events(tenant_id, action) VALUES($1, 'staff.offboarded')",
          [tenantId],
        );
      }
      await c.query("COMMIT");
      return {
        recorded: Boolean(member),
        ticketsUnassigned: tickets,
        commissionsUnassigned: commissions,
      };
    } catch (error) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }
}

export async function registerCommunity(
  app: FastifyInstance,
  { pool }: { pool: Pool },
) {
  const service = new CommunityService(pool);
  const integration = "/discord/integration/tenants/:tenantId";
  const uuid = { type: "string", format: "uuid" };
  const number = { type: "string", pattern: "^[0-9]{1,9}$" };
  const member = { type: "string", pattern: "^[0-9]{17,20}$" };
  const params = (extra: Record<string, object> = {}) => ({
    type: "object",
    properties: { tenantId: uuid, ...extra },
    required: ["tenantId", ...Object.keys(extra)],
  });

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

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${integration}/vouches`,
    { schema: { params: params() } },
    async (request, reply) =>
      handle(reply, async () =>
        service.vouch(
          request.params.tenantId,
          bot(request),
          vouchInputSchema.parse(request.body),
        ),
      ),
  );

  app.post<{ Params: { tenantId: string; number: string }; Body: unknown }>(
    `${integration}/vouches/:number/message`,
    { schema: { params: params({ number }) } },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { messageId } = z
          .object({ messageId: snowflake })
          .strict()
          .parse(request.body);
        await service.setVouchMessage(
          request.params.tenantId,
          guildId,
          Number(request.params.number),
          messageId,
        );
        return { saved: true };
      }),
  );

  app.post<{ Params: { tenantId: string; number: string }; Body: unknown }>(
    `${integration}/vouches/:number/hide`,
    { schema: { params: params({ number }) } },
    async (request, reply) =>
      handle(reply, async () => {
        const guildId = bot(request);
        const { byDiscordUserId } = z
          .object({ byDiscordUserId: snowflake })
          .strict()
          .parse(request.body);
        return service.hideVouch(
          request.params.tenantId,
          guildId,
          Number(request.params.number),
          byDiscordUserId,
        );
      }),
  );

  app.post<{
    Params: { tenantId: string; discordUserId: string };
    Body: unknown;
  }>(
    `${integration}/staff/:discordUserId/offboard`,
    { schema: { params: params({ discordUserId: member }) } },
    async (request, reply) =>
      handle(reply, async () =>
        service.offboard(
          request.params.tenantId,
          bot(request),
          request.params.discordUserId,
          offboardInputSchema.parse(request.body),
        ),
      ),
  );

  // Public: the website's testimonial wall. Short cache; hidden vouches
  // disappear within a minute.
  // Public: the website's testimonial wall, for the configured KUSH tenant.
  app.get<{ Querystring: { limit?: string } }>(
    "/public/vouches",
    {},
    async (request, reply) => {
      try {
        const { limit } = z
          .object({
            limit: z.coerce.number().int().min(1).max(50).default(12),
          })
          .parse(request.query);
        reply.header("Cache-Control", "public, max-age=60");
        const tenantId = process.env.KUSH_SUPPORT_TENANT_ID;
        if (!tenantId) return { vouches: [], count: 0, average: null };
        return await service.publicVouches(tenantId, limit);
      } catch (error) {
        if (error instanceof z.ZodError)
          return reply.code(400).send({ error: "Invalid request" });
        throw error;
      }
    },
  );
}
