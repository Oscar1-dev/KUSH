import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import { verifyIntegrationSecret } from "./discord-service.js";
import { SupportError } from "./support-service.js";

/**
 * Numbered moderation cases, written by the bot only (integration secret).
 * Commands record their own actions; Discord-UI actions arrive from the
 * audit log. Case numbers are per tenant and allocated atomically.
 */

const snowflake = z.string().regex(/^[0-9]{17,20}$/);

export const caseInputSchema = z
  .object({
    kind: z.enum([
      "warn",
      "timeout",
      "untimeout",
      "kick",
      "ban",
      "unban",
      "note",
    ]),
    targetId: snowflake,
    moderatorId: snowflake.nullable().optional(),
    reason: z.string().trim().min(1).max(1_000),
    durationSeconds: z.number().int().positive().max(2_419_200).optional(),
    source: z.enum(["bot", "discord"]),
  })
  .strict();

export interface ModerationCase {
  number: number;
  kind: string;
  targetId: string;
  moderatorId: string | null;
  reason: string;
  durationSeconds: number | null;
  source: string;
  createdAt: string;
}

const columns = `number, kind, target_discord_id AS "targetId",
  moderator_discord_id AS "moderatorId", reason,
  duration_seconds AS "durationSeconds", source, created_at AS "createdAt"`;

export class ModerationService {
  constructor(private readonly pool: Pool) {}

  async record(
    tenantId: string,
    guildId: string,
    input: z.infer<typeof caseInputSchema>,
  ): Promise<ModerationCase> {
    // One statement: the tenant row lock serialises number allocation.
    const result = await this.pool.query<ModerationCase>(
      `WITH n AS (
         UPDATE support_tenants SET next_case_number = next_case_number + 1
         WHERE id=$1 AND guild_id=$2 RETURNING next_case_number - 1 AS number
       )
       INSERT INTO moderation_cases(tenant_id, number, kind, target_discord_id,
         moderator_discord_id, reason, duration_seconds, source)
       SELECT $1, n.number, $3, $4, $5, $6, $7, $8 FROM n
       RETURNING ${columns}`,
      [
        tenantId,
        guildId,
        input.kind,
        input.targetId,
        input.moderatorId ?? null,
        input.reason,
        input.durationSeconds ?? null,
        input.source,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new SupportError(404, "Support resource not found");
    return row;
  }

  async list(
    tenantId: string,
    guildId: string,
    targetId: string | undefined,
    limit: number,
  ) {
    await this.tenant(tenantId, guildId);
    const result = await this.pool.query<ModerationCase>(
      `SELECT ${columns} FROM moderation_cases
       WHERE tenant_id=$1 AND ($2::text IS NULL OR target_discord_id=$2)
       ORDER BY number DESC LIMIT $3`,
      [tenantId, targetId ?? null, limit],
    );
    return result.rows;
  }

  async get(tenantId: string, guildId: string, number: number) {
    await this.tenant(tenantId, guildId);
    const result = await this.pool.query<ModerationCase>(
      `SELECT ${columns} FROM moderation_cases WHERE tenant_id=$1 AND number=$2`,
      [tenantId, number],
    );
    const row = result.rows[0];
    if (!row) throw new SupportError(404, "Case not found");
    return row;
  }

  private async tenant(tenantId: string, guildId: string) {
    const result = await this.pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, guildId],
    );
    if (!result.rowCount)
      throw new SupportError(404, "Support resource not found");
  }
}

export async function registerModeration(
  app: FastifyInstance,
  { pool }: { pool: Pool },
) {
  const service = new ModerationService(pool);
  const base = "/discord/integration/tenants/:tenantId/moderation/cases";
  const tenantParams = {
    type: "object",
    properties: { tenantId: { type: "string", format: "uuid" } },
    required: ["tenantId"],
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
    base,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () =>
        service.record(
          request.params.tenantId,
          bot(request),
          caseInputSchema.parse(request.body),
        ),
      ),
  );

  app.get<{
    Params: { tenantId: string };
    Querystring: { target?: string; limit?: string };
  }>(base, { schema: { params: tenantParams } }, async (request, reply) =>
    handle(reply, async () => {
      const guildId = bot(request);
      const query = z
        .object({
          target: snowflake.optional(),
          limit: z.coerce.number().int().min(1).max(25).default(10),
        })
        .parse(request.query);
      return {
        cases: await service.list(
          request.params.tenantId,
          guildId,
          query.target,
          query.limit,
        ),
      };
    }),
  );

  app.get<{ Params: { tenantId: string; number: string } }>(
    `${base}/:number`,
    {
      schema: {
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string", format: "uuid" },
            number: { type: "string", pattern: "^[0-9]{1,9}$" },
          },
          required: ["tenantId", "number"],
        },
      },
    },
    async (request, reply) =>
      handle(reply, async () =>
        service.get(
          request.params.tenantId,
          bot(request),
          Number(request.params.number),
        ),
      ),
  );
}
