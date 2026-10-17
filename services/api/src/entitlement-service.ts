import type { Pool, PoolClient } from "@kush/database";
import { z, type User } from "@kush/contracts";
import { SupportError } from "./support-service.js";

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
type Queryable = Pick<PoolClient, "query">;

export const purchaseEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      provider: z.literal("simulated"),
      eventId: z.string().min(1).max(200),
      type: z.literal("purchase.completed"),
      orderId: z.string().min(1).max(200),
      userId: z.uuid(),
      productSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
      // No .default() here: Ajv strict mode rejects defaults inside a union.
      expiresAt: z.iso.datetime().nullable().optional(),
    })
    .strict(),
  ...(
    [
      "purchase.refunded",
      "purchase.chargeback",
      "subscription.expired",
      "licence.revoked",
    ] as const
  ).map((type) =>
    z
      .object({
        provider: z.literal("simulated"),
        eventId: z.string().min(1).max(200),
        type: z.literal(type),
        orderId: z.string().min(1).max(200),
        reason: z.string().max(500).optional(),
      })
      .strict(),
  ),
]);
export type PurchaseEvent = z.infer<typeof purchaseEventSchema>;

const statusFor: Record<string, string> = {
  "purchase.refunded": "refunded",
  "purchase.chargeback": "revoked",
  "subscription.expired": "expired",
  "licence.revoked": "revoked",
};

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
export const productInputSchema = z
  .object({
    slug,
    name: z.string().trim().min(1).max(120),
    status: z.enum(["draft", "active", "retired"]).default("draft"),
    discordRoleId: snowflake.nullable().default(null),
  })
  .strict();
export const productPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["draft", "active", "retired"]).optional(),
    discordRoleId: snowflake.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const manualGrantSchema = z
  .object({
    userId: z.uuid(),
    productSlug: slug,
    reference: z.string().trim().min(1).max(200),
    expiresAt: z.iso.datetime().nullable().default(null),
  })
  .strict();
export const manualRevokeSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export interface DesiredRoles {
  /** Accepted the rules (current or earlier membership). */
  member: boolean;
  /** Has at least one active entitlement through a verified account link. */
  verifiedCustomer: boolean;
  /** Discord role IDs of products the member is entitled to. */
  productRoleIds: string[];
  /** Every product role the tenant uses, so stale ones can be removed. */
  managedProductRoleIds: string[];
  linked: boolean;
}

/** Queues (or coalesces into) one pending role sync for a member. */
export async function enqueueRoleSync(
  c: Queryable,
  tenantId: string,
  discordUserId: string,
  reason: string,
) {
  await c.query(
    `INSERT INTO role_sync_jobs(tenant_id,discord_user_id,reason)
     VALUES($1,$2,$3)
     ON CONFLICT (tenant_id,discord_user_id) WHERE status='pending'
     DO UPDATE SET reason=left(role_sync_jobs.reason||','||EXCLUDED.reason,200),next_attempt_at=now(),updated_at=now()`,
    [tenantId, discordUserId, reason],
  );
}

/** Retry delay after `attempts` failures: 1, 2, 4 … minutes, capped at 1 hour. */
export const retryDelayMs = (attempts: number) =>
  Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
export const MAX_SYNC_ATTEMPTS = 8;

/**
 * Entitlements and Discord role synchronisation. Roles are derived from
 * PostgreSQL state only; the bot applies the difference.
 */
export class EntitlementService {
  constructor(private readonly pool: Pool) {}

  private async tenant(c: Queryable, tenantId: string, guildId: string) {
    const result = await c.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, guildId],
    );
    if (!result.rowCount) fail(404, "Support resource not found");
  }

  async enqueueSync(
    c: Queryable,
    tenantId: string,
    discordUserId: string,
    reason: string,
  ) {
    await enqueueRoleSync(c, tenantId, discordUserId, reason);
  }

  async acceptRules(
    tenantId: string,
    guildId: string,
    discordUserId: string,
    version: string,
  ) {
    await this.tenant(this.pool, tenantId, guildId);
    await this.pool.query(
      `INSERT INTO discord_members(tenant_id,discord_user_id,rules_accepted_at,rules_version,in_guild)
       VALUES($1,$2,now(),$3,true)
       ON CONFLICT (tenant_id,discord_user_id) DO UPDATE SET
         rules_accepted_at=COALESCE(discord_members.rules_accepted_at,now()),
         rules_version=EXCLUDED.rules_version,in_guild=true,left_at=NULL,updated_at=now()`,
      [tenantId, discordUserId, version],
    );
    await this.enqueueSync(this.pool, tenantId, discordUserId, "rules");
  }

  async membership(
    tenantId: string,
    guildId: string,
    discordUserId: string,
    present: boolean,
  ) {
    await this.tenant(this.pool, tenantId, guildId);
    await this.pool.query(
      `INSERT INTO discord_members(tenant_id,discord_user_id,in_guild,left_at)
       VALUES($1,$2,$3,CASE WHEN $3 THEN NULL ELSE now() END)
       ON CONFLICT (tenant_id,discord_user_id) DO UPDATE SET
         in_guild=$3,left_at=CASE WHEN $3 THEN NULL ELSE now() END,updated_at=now()`,
      [tenantId, discordUserId, present],
    );
    if (present)
      await this.enqueueSync(this.pool, tenantId, discordUserId, "joined");
  }

  async desiredRoles(
    tenantId: string,
    guildId: string,
    discordUserId: string,
  ): Promise<DesiredRoles> {
    await this.tenant(this.pool, tenantId, guildId);
    const member = await this.pool.query(
      "SELECT 1 FROM discord_members WHERE tenant_id=$1 AND discord_user_id=$2 AND rules_accepted_at IS NOT NULL",
      [tenantId, discordUserId],
    );
    const link = await this.pool.query<{ user_id: string }>(
      `SELECT l.user_id FROM discord_account_links l JOIN users u ON u.id=l.user_id AND NOT u.disabled
       WHERE l.tenant_id=$1 AND l.discord_user_id=$2 AND l.state='verified'`,
      [tenantId, discordUserId],
    );
    const userId = link.rows[0]?.user_id;
    const entitled = userId
      ? await this.pool.query<{ discord_role_id: string | null }>(
          `SELECT DISTINCT p.discord_role_id FROM entitlements e
           JOIN products p ON p.tenant_id=e.tenant_id AND p.id=e.product_id
           WHERE e.tenant_id=$1 AND e.user_id=$2 AND e.status='active'
             AND e.starts_at<=now() AND (e.expires_at IS NULL OR e.expires_at>now())`,
          [tenantId, userId],
        )
      : { rows: [] as { discord_role_id: string | null }[] };
    const managed = await this.pool.query<{ discord_role_id: string }>(
      "SELECT DISTINCT discord_role_id FROM products WHERE tenant_id=$1 AND discord_role_id IS NOT NULL",
      [tenantId],
    );
    return {
      member: Boolean(member.rowCount),
      verifiedCustomer: entitled.rows.length > 0,
      productRoleIds: entitled.rows
        .map((row) => row.discord_role_id)
        .filter((id): id is string => Boolean(id))
        .sort(),
      managedProductRoleIds: managed.rows
        .map((row) => row.discord_role_id)
        .sort(),
      linked: Boolean(userId),
    };
  }

  /** Marks lapsed subscriptions expired and queues their role removal. */
  async sweepExpired(tenantId: string) {
    const expired = await this.pool.query<{ discord_user_id: string | null }>(
      `WITH lapsed AS (
         UPDATE entitlements SET status='expired',status_reason='Expiry date passed',updated_at=now()
         WHERE tenant_id=$1 AND status='active' AND expires_at IS NOT NULL AND expires_at<=now()
         RETURNING user_id)
       SELECT DISTINCT l.discord_user_id FROM lapsed
       LEFT JOIN discord_account_links l ON l.tenant_id=$1 AND l.user_id=lapsed.user_id AND l.state='verified'`,
      [tenantId],
    );
    for (const row of expired.rows)
      if (row.discord_user_id)
        await this.enqueueSync(
          this.pool,
          tenantId,
          row.discord_user_id,
          "expired",
        );
    return expired.rowCount ?? 0;
  }

  async dueJobs(tenantId: string, guildId: string, limit = 25) {
    await this.tenant(this.pool, tenantId, guildId);
    await this.sweepExpired(tenantId);
    const result = await this.pool.query<{
      id: string;
      discord_user_id: string;
      reason: string;
      attempts: number;
    }>(
      `SELECT id,discord_user_id,reason,attempts FROM role_sync_jobs
       WHERE tenant_id=$1 AND status='pending' AND next_attempt_at<=now()
       ORDER BY next_attempt_at LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      discordUserId: row.discord_user_id,
      reason: row.reason,
      attempts: row.attempts,
    }));
  }

  async finishJob(
    tenantId: string,
    guildId: string,
    jobId: string,
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    await this.tenant(this.pool, tenantId, guildId);
    if (outcome.ok) {
      await this.pool.query(
        "UPDATE role_sync_jobs SET status='done',updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, jobId],
      );
      return;
    }
    const current = await this.pool.query<{ attempts: number }>(
      "SELECT attempts FROM role_sync_jobs WHERE tenant_id=$1 AND id=$2",
      [tenantId, jobId],
    );
    const attempts = (current.rows[0]?.attempts ?? 0) + 1;
    await this.pool.query(
      `UPDATE role_sync_jobs SET attempts=$3,last_error=left($4,500),status=$5,
         next_attempt_at=now()+($6::integer * interval '1 millisecond'),updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [
        tenantId,
        jobId,
        attempts,
        outcome.error,
        attempts >= MAX_SYNC_ATTEMPTS ? "failed" : "pending",
        retryDelayMs(attempts),
      ],
    );
  }

  /** Queues every member the tenant knows about: startup and manual reconciliation. */
  async enqueueAll(tenantId: string, guildId: string, reason = "reconcile") {
    await this.tenant(this.pool, tenantId, guildId);
    const members = await this.pool.query<{ discord_user_id: string }>(
      `SELECT discord_user_id FROM discord_members WHERE tenant_id=$1 AND in_guild
       UNION SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND state='verified' AND discord_user_id IS NOT NULL`,
      [tenantId],
    );
    for (const row of members.rows)
      await this.enqueueSync(this.pool, tenantId, row.discord_user_id, reason);
    return members.rowCount ?? 0;
  }

  /**
   * Applies a verified purchase event exactly once. Only the simulated
   * provider exists, and only when KUSH_SIMULATED_PURCHASES=true; a real
   * provider needs its own signature-verified webhook and owner approval.
   */
  async processPurchaseEvent(tenantId: string, raw: unknown) {
    if (process.env.KUSH_SIMULATED_PURCHASES !== "true")
      fail(403, "Simulated purchases are disabled");
    const event = purchaseEventSchema.parse(raw);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const previous = await c.query<{ result: string }>(
        "SELECT result FROM purchase_events WHERE tenant_id=$1 AND provider=$2 AND event_id=$3",
        [tenantId, event.provider, event.eventId],
      );
      if (previous.rows[0]) {
        await c.query("COMMIT");
        return { duplicate: true, result: previous.rows[0].result };
      }
      let result: string;
      let affectedUser: string | undefined;
      if (event.type === "purchase.completed") {
        const product = await c.query<{ id: string }>(
          "SELECT id FROM products WHERE tenant_id=$1 AND slug=$2",
          [tenantId, event.productSlug],
        );
        if (!product.rows[0]) fail(400, "Unknown product");
        const user = await c.query(
          "SELECT 1 FROM users WHERE id=$1 AND NOT disabled",
          [event.userId],
        );
        if (!user.rowCount) fail(400, "Unknown customer account");
        await c.query(
          `INSERT INTO entitlements(tenant_id,user_id,product_id,status,source,source_reference,expires_at)
           VALUES($1,$2,$3,'active','simulated',$4,$5)
           ON CONFLICT (tenant_id,source,source_reference) DO UPDATE SET
             status='active',expires_at=EXCLUDED.expires_at,status_reason=NULL,updated_at=now()`,
          [
            tenantId,
            event.userId,
            product.rows[0]!.id,
            event.orderId,
            event.expiresAt ?? null,
          ],
        );
        affectedUser = event.userId;
        result = "entitlement.active";
      } else {
        const updated = await c.query<{ user_id: string }>(
          `UPDATE entitlements SET status=$4,status_reason=$5,updated_at=now()
           WHERE tenant_id=$1 AND source='simulated' AND source_reference=$2
             AND status <> $3 RETURNING user_id`,
          [
            tenantId,
            event.orderId,
            statusFor[event.type],
            statusFor[event.type],
            event.reason ?? event.type,
          ],
        );
        affectedUser = updated.rows[0]?.user_id;
        result = affectedUser
          ? `entitlement.${statusFor[event.type]}`
          : "no-matching-entitlement";
      }
      await c.query(
        "INSERT INTO purchase_events(tenant_id,provider,event_id,type,payload,result) VALUES($1,$2,$3,$4,$5,$6)",
        [
          tenantId,
          event.provider,
          event.eventId,
          event.type,
          JSON.stringify(event),
          result,
        ],
      );
      if (affectedUser) {
        const link = await c.query<{ discord_user_id: string }>(
          "SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified' AND discord_user_id IS NOT NULL",
          [tenantId, affectedUser],
        );
        // Not linked yet: the entitlement waits and is applied on linking.
        if (link.rows[0])
          await this.enqueueSync(
            c,
            tenantId,
            link.rows[0].discord_user_id,
            `purchase:${event.type}`,
          );
        await c.query(
          "INSERT INTO audit_events(actor_id,tenant_id,action) VALUES(NULL,$1,$2)",
          [tenantId, `entitlement.${event.type}`],
        );
      }
      await c.query("COMMIT");
      return { duplicate: false, result };
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }

  /** Revokes the member's own Discord link and queues role removal. */
  async unlink(tenantId: string, userId: string) {
    const revoked = await this.pool.query<{ discord_user_id: string | null }>(
      `UPDATE discord_account_links SET state='revoked' WHERE tenant_id=$1 AND user_id=$2 AND state='verified'
       RETURNING discord_user_id`,
      [tenantId, userId],
    );
    for (const row of revoked.rows)
      if (row.discord_user_id)
        await this.enqueueSync(
          this.pool,
          tenantId,
          row.discord_user_id,
          "unlinked",
        );
    return revoked.rowCount ?? 0;
  }

  // ------------------------------------------------ owner administration

  private async role(c: Queryable, tenantId: string, user: User) {
    const result = await c.query<{ role: string }>(
      `SELECT m.role FROM support_members m JOIN users u ON u.id=m.user_id
       WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND NOT u.disabled`,
      [tenantId, user.id],
    );
    return result.rows[0]?.role ?? fail(404, "Support resource not found");
  }

  private async owner(c: Queryable, tenantId: string, user: User) {
    if ((await this.role(c, tenantId, user)) !== "owner")
      fail(403, "Tenant owner permission required");
  }

  private async guildOf(tenantId: string) {
    const result = await this.pool.query<{ guild_id: string | null }>(
      "SELECT guild_id FROM support_tenants WHERE id=$1",
      [tenantId],
    );
    return result.rows[0]?.guild_id ?? fail(404, "Support resource not found");
  }

  async listProducts(user: User, tenantId: string) {
    await this.owner(this.pool, tenantId, user);
    const result = await this.pool.query(
      `SELECT id,slug,name,status,discord_role_id AS "discordRoleId",created_at AS "createdAt"
       FROM products WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return result.rows;
  }

  async createProduct(user: User, tenantId: string, raw: unknown) {
    await this.owner(this.pool, tenantId, user);
    const input = productInputSchema.parse(raw);
    try {
      const result = await this.pool.query(
        `INSERT INTO products(tenant_id,slug,name,status,discord_role_id) VALUES($1,$2,$3,$4,$5)
         RETURNING id,slug,name,status,discord_role_id AS "discordRoleId"`,
        [tenantId, input.slug, input.name, input.status, input.discordRoleId],
      );
      await this.audit(tenantId, user.id, "product.created");
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        fail(409, "A product with that slug exists");
      throw error;
    }
  }

  async updateProduct(
    user: User,
    tenantId: string,
    productId: string,
    raw: unknown,
  ) {
    await this.owner(this.pool, tenantId, user);
    const input = productPatchSchema.parse(raw);
    const result = await this.pool.query(
      `UPDATE products SET name=COALESCE($3,name),status=COALESCE($4,status),
         discord_role_id=CASE WHEN $5 THEN $6 ELSE discord_role_id END,updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id,slug,name,status,discord_role_id AS "discordRoleId"`,
      [
        tenantId,
        productId,
        input.name ?? null,
        input.status ?? null,
        input.discordRoleId !== undefined,
        input.discordRoleId ?? null,
      ],
    );
    if (!result.rows[0]) fail(404, "Support resource not found");
    await this.audit(tenantId, user.id, "product.updated");
    // A changed product role affects every holder.
    if (input.discordRoleId !== undefined) {
      const guildId = await this.guildOf(tenantId);
      await this.enqueueAll(tenantId, guildId, "product-role");
    }
    return result.rows[0];
  }

  /** Owners may list anyone's entitlements; anyone else only their own. */
  async listEntitlements(user: User, tenantId: string, forUserId?: string) {
    const role = await this.role(this.pool, tenantId, user);
    const target = role === "owner" ? (forUserId ?? null) : user.id;
    const result = await this.pool.query(
      `SELECT e.id,e.user_id AS "userId",p.slug AS "productSlug",p.name AS "productName",e.status,
         e.source,e.source_reference AS "reference",e.expires_at AS "expiresAt",
         e.status_reason AS "reason",e.created_at AS "createdAt"
       FROM entitlements e JOIN products p ON p.tenant_id=e.tenant_id AND p.id=e.product_id
       WHERE e.tenant_id=$1 AND ($2::uuid IS NULL OR e.user_id=$2)
       ORDER BY e.created_at DESC LIMIT 200`,
      [tenantId, target],
    );
    return result.rows;
  }

  /** The caller's own entitlements, whatever their tenant role. */
  async listOwnEntitlements(user: User, tenantId: string) {
    await this.role(this.pool, tenantId, user);
    const result = await this.pool.query(
      `SELECT e.id,p.slug AS "productSlug",p.name AS "productName",e.status,
         e.expires_at AS "expiresAt",e.created_at AS "createdAt"
       FROM entitlements e JOIN products p ON p.tenant_id=e.tenant_id AND p.id=e.product_id
       WHERE e.tenant_id=$1 AND e.user_id=$2 ORDER BY e.created_at DESC`,
      [tenantId, user.id],
    );
    return result.rows;
  }

  /** A linked member's own entitlements, for !licenses. */
  async entitlementsForDiscord(
    tenantId: string,
    guildId: string,
    discordUserId: string,
  ) {
    await this.tenant(this.pool, tenantId, guildId);
    const result = await this.pool.query(
      `SELECT p.name AS "productName",e.status,e.expires_at AS "expiresAt"
       FROM discord_account_links l
       JOIN entitlements e ON e.tenant_id=l.tenant_id AND e.user_id=l.user_id
       JOIN products p ON p.tenant_id=e.tenant_id AND p.id=e.product_id
       WHERE l.tenant_id=$1 AND l.discord_user_id=$2 AND l.state='verified'
       ORDER BY p.name`,
      [tenantId, discordUserId],
    );
    return {
      linked: await this.isLinked(tenantId, discordUserId),
      entitlements: result.rows,
    };
  }

  private async isLinked(tenantId: string, discordUserId: string) {
    const result = await this.pool.query(
      "SELECT 1 FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
      [tenantId, discordUserId],
    );
    return Boolean(result.rowCount);
  }

  async grantManual(user: User, tenantId: string, raw: unknown) {
    await this.owner(this.pool, tenantId, user);
    const input = manualGrantSchema.parse(raw);
    const product = await this.pool.query<{ id: string }>(
      "SELECT id FROM products WHERE tenant_id=$1 AND slug=$2",
      [tenantId, input.productSlug],
    );
    if (!product.rows[0]) fail(400, "Unknown product");
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO entitlements(tenant_id,user_id,product_id,status,source,source_reference,expires_at,status_reason)
       VALUES($1,$2,$3,'active','manual',$4,$5,'Granted manually')
       ON CONFLICT (tenant_id,source,source_reference)
       DO UPDATE SET status='active',expires_at=EXCLUDED.expires_at,updated_at=now()
       RETURNING id`,
      [
        tenantId,
        input.userId,
        product.rows[0]!.id,
        input.reference,
        input.expiresAt,
      ],
    );
    await this.afterChange(
      tenantId,
      input.userId,
      user.id,
      "entitlement.granted.manual",
    );
    return { id: result.rows[0]!.id };
  }

  async revokeManual(
    user: User,
    tenantId: string,
    entitlementId: string,
    raw: unknown,
  ) {
    await this.owner(this.pool, tenantId, user);
    const input = manualRevokeSchema.parse(raw);
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE entitlements SET status='revoked',status_reason=$3,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 RETURNING user_id`,
      [tenantId, entitlementId, input.reason],
    );
    const target =
      result.rows[0]?.user_id ?? fail(404, "Support resource not found");
    await this.afterChange(
      tenantId,
      target,
      user.id,
      "entitlement.revoked.manual",
    );
    return { revoked: true };
  }

  private async audit(
    tenantId: string,
    actorId: string | null,
    action: string,
  ) {
    await this.pool.query(
      "INSERT INTO audit_events(actor_id,tenant_id,action) VALUES($1,$2,$3)",
      [actorId, tenantId, action],
    );
  }

  private async afterChange(
    tenantId: string,
    userId: string,
    actorId: string,
    action: string,
  ) {
    await this.audit(tenantId, actorId, action);
    const link = await this.pool.query<{ discord_user_id: string }>(
      "SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified' AND discord_user_id IS NOT NULL",
      [tenantId, userId],
    );
    if (link.rows[0])
      await this.enqueueSync(
        this.pool,
        tenantId,
        link.rows[0].discord_user_id,
        action,
      );
  }
}
