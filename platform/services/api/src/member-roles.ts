import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "@kush/database";
import { z } from "@kush/contracts";
import { creditBalance, creditHistory } from "./credit.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { enqueueRoleSync } from "./entitlement-service.js";
import { ReferralService } from "./referrals.js";
import {
  can,
  demand,
  type StaffAccess,
  type StaffContext,
} from "./staff-access.js";
import { SupportError } from "./support-service.js";

/**
 * Staff-managed Discord roles and the customer overview. One operation,
 * `setRoleGrant`, serves both the staff website and `/staff role` in
 * Discord, so the rules, audit trail and idempotency are identical.
 *
 * Only an allowlist of programme/customer roles can be granted; staff roles
 * never come from here. The change is recorded, then the bot's role sync
 * applies it, which keeps Discord's own hierarchy in charge: the bot can
 * only touch roles below its own.
 */

export const grantableRoleKeys = [
  "verified-customer",
  "beta-tester",
  "creative-partner",
  "approved-seller",
  "verified-reseller",
] as const;
export type GrantableRole = (typeof grantableRoleKeys)[number];

export const grantableRoleLabels: Record<GrantableRole, string> = {
  "verified-customer": "Customer",
  "beta-tester": "Beta Tester",
  "creative-partner": "Creative Team",
  "approved-seller": "Verified Seller",
  "verified-reseller": "Reseller",
};

export const roleChangeSchema = z
  .object({
    roleKey: z.enum(grantableRoleKeys),
    action: z.enum(["grant", "revoke"]),
    reason: z.string().trim().min(3).max(300),
    requestId: z.uuid(),
  })
  .strict();

type Tx = Pick<PoolClient, "query">;

async function inTransaction<T>(
  pool: Pool,
  work: (c: PoolClient) => Promise<T>,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    c.release();
  }
}

/** Grants or revokes one allowlisted role. Idempotent per request ID. */
export async function setRoleGrant(
  pool: Pool,
  ctx: StaffContext,
  input: z.infer<typeof roleChangeSchema> & {
    discordUserId: string;
    source: "website" | "discord";
  },
) {
  demand(ctx, "roles.manage");
  if (!/^[0-9]{17,20}$/.test(input.discordUserId))
    throw new SupportError(400, "That member has no Discord account linked");
  const state = input.action === "grant" ? "granted" : "revoked";
  return inTransaction(pool, async (c: Tx) => {
    const prior = (
      await c.query<{ state: string }>(
        "SELECT state FROM member_role_grant_events WHERE request_id=$1",
        [input.requestId],
      )
    ).rows[0];
    if (prior)
      return { roleKey: input.roleKey, state: prior.state, duplicate: true };
    await c.query(
      `INSERT INTO member_role_grants(tenant_id,discord_user_id,role_key,state,reason,changed_by,last_request_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id,discord_user_id,role_key) DO UPDATE SET
         state=EXCLUDED.state, reason=EXCLUDED.reason, changed_by=EXCLUDED.changed_by,
         last_request_id=EXCLUDED.last_request_id, updated_at=now()`,
      [
        ctx.tenantId,
        input.discordUserId,
        input.roleKey,
        state,
        input.reason,
        ctx.userId,
        input.requestId,
      ],
    );
    await c.query(
      `INSERT INTO member_role_grant_events(tenant_id,discord_user_id,role_key,state,reason,changed_by,source,request_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ctx.tenantId,
        input.discordUserId,
        input.roleKey,
        state,
        input.reason,
        ctx.userId,
        input.source,
        input.requestId,
      ],
    );
    await enqueueRoleSync(
      c,
      ctx.tenantId,
      input.discordUserId,
      `staff-role:${input.roleKey}`,
    );
    await c.query(
      "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,$3)",
      [
        ctx.tenantId,
        ctx.userId,
        `staff.role.${state}.${input.roleKey}.${input.source}`,
      ],
    );
    return { roleKey: input.roleKey, state, duplicate: false };
  });
}

/** Current grants for a member, for the role sync and the customer page. */
export async function roleGrants(
  c: Tx,
  tenantId: string,
  discordUserId: string,
) {
  return (
    await c.query<{
      roleKey: GrantableRole;
      state: "granted" | "revoked";
      reason: string;
      updatedAt: Date;
    }>(
      `SELECT role_key AS "roleKey", state, reason, updated_at AS "updatedAt"
       FROM member_role_grants WHERE tenant_id=$1 AND discord_user_id=$2 ORDER BY role_key`,
      [tenantId, discordUserId],
    )
  ).rows;
}

/** The Discord account behind a KUSH user: verified link, else sign-in identity. */
async function discordIdFor(pool: Pool, tenantId: string, userId: string) {
  return (
    (
      await pool.query<{ id: string }>(
        `SELECT COALESCE(
           (SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified'),
           (SELECT subject FROM user_identities WHERE user_id=$2 AND provider='discord')) AS id`,
        [tenantId, userId],
      )
    ).rows[0]?.id ?? null
  );
}

export function registerMemberRoles(
  app: FastifyInstance,
  {
    pool,
    access,
    asStaff,
  }: {
    pool: Pool;
    access: StaffAccess;
    asStaff: (
      work: (ctx: StaffContext, request: FastifyRequest) => Promise<unknown>,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  },
) {
  const referrals = new ReferralService(pool);
  const uuidParam = {
    type: "object",
    properties: { userId: { type: "string", format: "uuid" } },
    required: ["userId"],
  };

  // ---- website: one customer, everything staff may see about them
  app.get(
    "/web/staff/customers/:userId",
    { schema: { params: uuidParam } },
    asStaff(async (ctx, request) => {
      demand(ctx, "customers.view");
      const { userId } = request.params as { userId: string };
      const customer = (
        await pool.query(
          `SELECT u.id, COALESCE(u.display_name, i.username, 'Customer') AS name, i.username, u.created_at AS "createdAt", u.disabled
           FROM support_members m JOIN users u ON u.id=m.user_id
           LEFT JOIN user_identities i ON i.user_id=u.id AND i.provider='discord'
           WHERE m.tenant_id=$1 AND m.user_id=$2`,
          [ctx.tenantId, userId],
        )
      ).rows[0];
      if (!customer) throw new SupportError(404, "Customer not found");
      const discordId = await discordIdFor(pool, ctx.tenantId, userId);
      const q = async (
        sql: string,
        values: unknown[] = [ctx.tenantId, userId],
      ) => (await pool.query(sql, values)).rows;
      const [orders, commissions, tickets] = await Promise.all([
        can(ctx, "orders.view")
          ? q(
              `SELECT id, number, description, status, subtotal_pence AS "subtotalPence", created_at AS "createdAt"
               FROM orders WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 10`,
            )
          : Promise.resolve(null),
        q(
          `SELECT id, title, category, status, updated_at AS "updatedAt" FROM commercial_requests
           WHERE tenant_id=$1 AND requester_id=$2 AND kind='commission' ORDER BY updated_at DESC LIMIT 10`,
        ),
        q(
          `SELECT id, number, category, status, updated_at AS "updatedAt" FROM support_tickets
           WHERE tenant_id=$1 AND customer_id=$2 ORDER BY updated_at DESC LIMIT 10`,
        ),
      ]);
      return {
        customer: { ...customer, discordId },
        orders,
        commissions,
        tickets,
        credit: {
          balancePence: await creditBalance(pool, ctx.tenantId, userId),
          history: await creditHistory(pool, ctx.tenantId, userId, 10),
        },
        referrals: discordId
          ? await referrals.summary(ctx.tenantId, discordId)
          : null,
        roles: discordId
          ? {
              grants: await roleGrants(pool, ctx.tenantId, discordId),
              history: await q(
                `SELECT e.role_key AS "roleKey", e.state, e.reason, e.source, e.created_at AS "createdAt",
                        COALESCE(u.display_name, 'Staff') AS "by"
                 FROM member_role_grant_events e JOIN users u ON u.id=e.changed_by
                 WHERE e.tenant_id=$1 AND e.discord_user_id=$2 ORDER BY e.created_at DESC LIMIT 20`,
                [ctx.tenantId, discordId],
              ),
              grantable: grantableRoleKeys.map((key) => ({
                key,
                label: grantableRoleLabels[key],
              })),
            }
          : null,
        moderation:
          discordId && can(ctx, "moderation.view")
            ? await q(
                `SELECT number, kind, reason, created_at AS "createdAt" FROM moderation_cases
                 WHERE tenant_id=$1 AND target_discord_id=$2 ORDER BY created_at DESC LIMIT 10`,
                [ctx.tenantId, discordId],
              )
            : null,
        can: {
          adjustCredit: can(ctx, "credit.adjust"),
          manageRoles: can(ctx, "roles.manage"),
        },
      };
    }),
  );

  app.post(
    "/web/staff/customers/:userId/roles",
    { schema: { params: uuidParam } },
    asStaff(async (ctx, request) => {
      const { userId } = request.params as { userId: string };
      const parsed = roleChangeSchema.safeParse(request.body);
      if (!parsed.success)
        throw new SupportError(
          400,
          parsed.error.issues[0]?.message ?? "Invalid request",
        );
      if (userId === ctx.userId)
        throw new SupportError(409, "You can't change your own roles");
      const input = parsed.data;
      const discordUserId = await discordIdFor(pool, ctx.tenantId, userId);
      if (!discordUserId)
        throw new SupportError(
          409,
          "This customer hasn't connected Discord yet",
        );
      return setRoleGrant(pool, ctx, {
        ...input,
        discordUserId,
        source: "website",
      });
    }),
  );

  // ---- Discord: /staff role, the same operation
  const botBody = roleChangeSchema
    .extend({
      actorDiscordId: z.string().regex(/^[0-9]{17,20}$/),
      discordUserId: z.string().regex(/^[0-9]{17,20}$/),
    })
    .strict();
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/discord/integration/tenants/:tenantId/staff/roles",
    {
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string", format: "uuid" } },
          required: ["tenantId"],
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const header = (name: string) =>
          typeof request.headers[name] === "string"
            ? (request.headers[name] as string)
            : "";
        verifyIntegrationSecret(
          header("x-kush-discord-secret") || undefined,
          process.env.KUSH_DISCORD_INTEGRATION_SECRET,
        );
        const found = await pool.query(
          "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
          [request.params.tenantId, header("x-kush-discord-guild-id")],
        );
        if (!found.rowCount)
          throw new SupportError(404, "Support resource not found");
        const { actorDiscordId, discordUserId, ...input } = botBody.parse(
          request.body,
        );
        if (actorDiscordId === discordUserId)
          throw new SupportError(409, "You can't change your own roles");
        const ctx = await access.fromDiscord(
          request.params.tenantId,
          actorDiscordId,
        );
        return await setRoleGrant(pool, ctx, {
          ...input,
          discordUserId,
          source: "discord",
        });
      } catch (error) {
        if (error instanceof SupportError)
          return reply.code(error.status).send({ error: error.message });
        if (error instanceof z.ZodError)
          return reply
            .code(400)
            .send({ error: error.issues[0]?.message ?? "Invalid request" });
        throw error;
      }
    },
  );
}
