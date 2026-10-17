import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "@kush/database";
import type { CommercialRequest, SupportRole, User } from "@kush/contracts";
import {
  commercialRequestInputSchema,
  commercialRequestPatchSchema,
  discordLinkStartSchema,
} from "@kush/contracts";
import { SupportError } from "./support-service.js";
import { enqueueRoleSync } from "./entitlement-service.js";

const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RequestRow = {
  id: string;
  tenant_id: string;
  requester_id: string;
  kind: CommercialRequest["kind"];
  status: CommercialRequest["status"];
  title: string;
  details: string;
  category: string;
  approximate_budget: string | null;
  preferred_timeframe: string | null;
  product_url: string | null;
  assigned_user_id: string | null;
  review_note: string | null;
  version: number;
  create_request_id: string;
  created_at: Date;
  updated_at: Date;
};
type Queryable = Pick<PoolClient, "query">;
const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const missing = () => fail(404, "Commercial resource not found");
const view = (
  row: RequestRow,
  includeReviewNote = true,
): CommercialRequest => ({
  id: row.id,
  tenantId: row.tenant_id,
  requesterId: row.requester_id,
  kind: row.kind,
  status: row.status,
  title: row.title,
  details: row.details,
  category: row.category,
  approximateBudget: row.approximate_budget,
  preferredTimeframe: row.preferred_timeframe,
  productUrl: row.product_url,
  assignedUserId: row.assigned_user_id,
  reviewNote: includeReviewNote ? row.review_note : null,
  version: row.version,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export const transitions: Record<
  CommercialRequest["kind"],
  Record<string, string[]>
> = {
  commission: {
    submitted: ["reviewing", "cancelled"],
    reviewing: ["awaiting_customer", "quoted", "cancelled"],
    awaiting_customer: ["reviewing", "cancelled"],
    quoted: ["accepted", "cancelled"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["awaiting_review", "cancelled"],
    awaiting_review: ["in_progress", "completed", "cancelled"],
    completed: [],
    cancelled: [],
  },
  marketplace: {
    submitted: ["reviewing", "cancelled"],
    reviewing: ["awaiting_customer", "approved", "rejected"],
    awaiting_customer: ["reviewing", "cancelled"],
    approved: ["published", "rejected"],
    published: [],
    rejected: [],
    cancelled: [],
  },
  partner: {
    submitted: ["reviewing", "cancelled"],
    reviewing: ["awaiting_customer", "approved", "rejected"],
    awaiting_customer: ["reviewing", "cancelled"],
    approved: [],
    rejected: [],
    cancelled: [],
  },
};

export class CommercialService {
  constructor(private readonly pool: Pool) {}
  private async tx<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof SupportError) throw error;
      if ((error as { code?: string }).code === "23505")
        fail(409, "Commercial record already exists");
      throw error;
    } finally {
      client.release();
    }
  }
  private async member(client: Queryable, tenantId: string, user: User) {
    const result = await client.query<{
      role: SupportRole;
      guild_id: string | null;
    }>(
      `SELECT m.role,t.guild_id FROM support_members m JOIN support_tenants t ON t.id=m.tenant_id
       JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND NOT u.disabled
       AND (m.role='customer' OR u.role IN ('admin','operator'))`,
      [tenantId, user.id],
    );
    const member = result.rows[0] ?? missing();
    // Moderators handle moderation reports only, never commercial records.
    if (member.role === "moderator") missing();
    return member;
  }
  private async audit(
    client: Queryable,
    tenantId: string,
    userId: string,
    action: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(actor_id,tenant_id,action) VALUES($1,$2,$3)",
      [userId, tenantId, action],
    );
  }
  private canSee(row: RequestRow, user: User, role: SupportRole) {
    if (role === "customer" && row.requester_id !== user.id) missing();
    if (role === "staff" && row.assigned_user_id !== user.id) missing();
  }
  async list(user: User, tenantId: string, kind?: string) {
    const member = await this.member(this.pool, tenantId, user);
    const params: unknown[] = [tenantId];
    let where = "tenant_id=$1";
    if (member.role === "customer") {
      params.push(user.id);
      where += ` AND requester_id=$${params.length}`;
    }
    if (member.role === "staff") {
      params.push(user.id);
      where += ` AND assigned_user_id=$${params.length}`;
    }
    if (kind) {
      params.push(kind);
      where += ` AND kind=$${params.length}`;
    }
    const rows = await this.pool.query<RequestRow>(
      `SELECT * FROM commercial_requests WHERE ${where} ORDER BY created_at,id`,
      params,
    );
    return rows.rows.map((row) => view(row, member.role !== "customer"));
  }
  async get(user: User, tenantId: string, requestId: string) {
    const member = await this.member(this.pool, tenantId, user);
    const result = await this.pool.query<RequestRow>(
      "SELECT * FROM commercial_requests WHERE tenant_id=$1 AND id=$2",
      [tenantId, requestId],
    );
    const row = result.rows[0] ?? missing();
    this.canSee(row, user, member.role);
    return view(row, member.role !== "customer");
  }
  async create(user: User, tenantId: string, raw: unknown) {
    const input = commercialRequestInputSchema.parse(raw);
    return this.tx(async (client) => {
      const member = await this.member(client, tenantId, user);
      const prior = await client.query<RequestRow>(
        "SELECT * FROM commercial_requests WHERE tenant_id=$1 AND requester_id=$2 AND create_request_id=$3",
        [tenantId, user.id, input.requestId],
      );
      if (prior.rows[0]) {
        const row = prior.rows[0];
        this.canSee(row, user, member.role);
        const same =
          row.kind === input.kind &&
          row.title === input.title &&
          row.details === input.details &&
          row.category === input.category &&
          row.approximate_budget === input.approximateBudget &&
          row.preferred_timeframe === input.preferredTimeframe &&
          row.product_url === input.productUrl;
        if (!same)
          fail(409, "Request ID was already used with different content");
        return view(row, member.role !== "customer");
      }
      const assigned = member.role === "staff" ? user.id : null;
      const result = await client.query<RequestRow>(
        `INSERT INTO commercial_requests(tenant_id,requester_id,kind,title,details,category,approximate_budget,preferred_timeframe,product_url,assigned_user_id,create_request_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          tenantId,
          user.id,
          input.kind,
          input.title,
          input.details,
          input.category,
          input.approximateBudget,
          input.preferredTimeframe,
          input.productUrl,
          assigned,
          input.requestId,
        ],
      );
      await this.audit(
        client,
        tenantId,
        user.id,
        `commercial.${input.kind}.created`,
      );
      return view(result.rows[0]!, member.role !== "customer");
    });
  }
  async update(user: User, tenantId: string, id: string, raw: unknown) {
    const input = commercialRequestPatchSchema.parse(raw);
    return this.tx(async (client) => {
      const member = await this.member(client, tenantId, user);
      if (member.role === "customer") fail(403, "Staff permission required");
      const found = await client.query<RequestRow>(
        "SELECT * FROM commercial_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, id],
      );
      const row = found.rows[0] ?? missing();
      this.canSee(row, user, member.role);
      if (row.version !== input.expectedVersion)
        fail(409, "Request changed; reload before retrying");
      if (input.assignedUserId !== undefined && member.role !== "owner")
        fail(403, "Tenant owner permission required");
      if (input.assignedUserId) {
        const staff = await client.query(
          "SELECT 1 FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND m.role IN ('owner','staff') AND NOT u.disabled AND u.role IN ('admin','operator')",
          [tenantId, input.assignedUserId],
        );
        if (!staff.rowCount) fail(400, "Assignee is not active staff");
      }
      if (
        input.status &&
        !(transitions[row.kind][row.status] ?? []).includes(input.status)
      )
        fail(409, "Invalid status transition");
      const result = await client.query<RequestRow>(
        `UPDATE commercial_requests SET status=COALESCE($3,status),assigned_user_id=CASE WHEN $4 THEN $5 ELSE assigned_user_id END,
         review_note=CASE WHEN $6 THEN $7 ELSE review_note END,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [
          tenantId,
          id,
          input.status ?? null,
          input.assignedUserId !== undefined,
          input.assignedUserId ?? null,
          input.reviewNote !== undefined,
          input.reviewNote ?? null,
        ],
      );
      await this.audit(
        client,
        tenantId,
        user.id,
        `commercial.${row.kind}.updated`,
      );
      return view(result.rows[0]!);
    });
  }
  async startLink(user: User, tenantId: string, raw: unknown) {
    const input = discordLinkStartSchema.parse(raw);
    return this.tx(async (client) => {
      await this.member(client, tenantId, user);
      const duplicate = await client.query(
        "SELECT 1 FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND request_id=$3",
        [tenantId, user.id, input.requestId],
      );
      if (duplicate.rowCount)
        fail(409, "Link request was already issued; request a new code");
      const code = [...randomBytes(16)]
        .map((byte) => LINK_ALPHABET[byte & 31])
        .join("");
      const hash = createHash("sha256")
        .update(`${tenantId}:${user.id}:${code}`)
        .digest("hex");
      await client.query(
        `INSERT INTO discord_account_links(tenant_id,user_id,code_hash,request_id,expires_at)
         VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(tenant_id,user_id) DO UPDATE
         SET discord_user_id=NULL,state='pending',code_hash=EXCLUDED.code_hash,request_id=EXCLUDED.request_id,expires_at=EXCLUDED.expires_at,verified_at=NULL`,
        [tenantId, user.id, hash, input.requestId],
      );
      await this.audit(client, tenantId, user.id, "discord.link.started");
      return { code, expiresInSeconds: 600 };
    });
  }
  async completeLink(
    secret: string | undefined,
    expectedSecret: string | undefined,
    tenantId: string,
    input: { code: string; discordUserId: string; guildId: string },
  ) {
    if (
      !expectedSecret ||
      !secret ||
      secret.length !== expectedSecret.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret))
    )
      fail(401, "Integration authentication required");
    const outcome = await this.tx(async (client) => {
      const tenant = await client.query<{ guild_id: string | null }>(
        "SELECT guild_id FROM support_tenants WHERE id=$1 FOR UPDATE",
        [tenantId],
      );
      if (!tenant.rows[0] || tenant.rows[0].guild_id !== input.guildId)
        missing();
      const attempts = await client.query<{
        failed_attempts: number;
        window_started_at: Date;
      }>(
        `INSERT INTO discord_link_attempts(tenant_id,discord_user_id) VALUES($1,$2)
         ON CONFLICT(tenant_id,discord_user_id) DO UPDATE SET
         failed_attempts=CASE WHEN discord_link_attempts.window_started_at < now()-interval '10 minutes' THEN 0 ELSE discord_link_attempts.failed_attempts END,
         window_started_at=CASE WHEN discord_link_attempts.window_started_at < now()-interval '10 minutes' THEN now() ELSE discord_link_attempts.window_started_at END
         RETURNING failed_attempts,window_started_at`,
        [tenantId, input.discordUserId],
      );
      if (attempts.rows[0]!.failed_attempts >= 5)
        return { error: "rate" as const };
      const pending = await client.query<{
        id: string;
        user_id: string;
        code_hash: string;
      }>(
        "SELECT id,user_id,code_hash FROM discord_account_links WHERE tenant_id=$1 AND state='pending' AND expires_at>now() FOR UPDATE",
        [tenantId],
      );
      const match = pending.rows.find(
        (row) =>
          createHash("sha256")
            .update(`${tenantId}:${row.user_id}:${input.code}`)
            .digest("hex") === row.code_hash,
      );
      if (!match) {
        const failed = await client.query<{ failed_attempts: number }>(
          "UPDATE discord_link_attempts SET failed_attempts=failed_attempts+1 WHERE tenant_id=$1 AND discord_user_id=$2 RETURNING failed_attempts",
          [tenantId, input.discordUserId],
        );
        return {
          error:
            failed.rows[0]!.failed_attempts >= 5
              ? ("rate" as const)
              : ("invalid" as const),
        };
      }
      await client.query(
        "UPDATE discord_account_links SET discord_user_id=$3,state='verified',verified_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, match.id, input.discordUserId],
      );
      await this.audit(
        client,
        tenantId,
        match.user_id,
        "discord.link.verified",
      );
      await client.query(
        "DELETE FROM discord_link_attempts WHERE tenant_id=$1 AND discord_user_id=$2",
        [tenantId, input.discordUserId],
      );
      // Same transaction: a verified link always gets its roles reconciled.
      await enqueueRoleSync(client, tenantId, input.discordUserId, "linked");
      return {
        userId: match.user_id,
        discordUserId: input.discordUserId,
        state: "verified" as const,
      };
    });
    if ("error" in outcome) {
      if (outcome.error === "rate")
        fail(429, "Too many link attempts; try again later");
      fail(400, "Link code is invalid or expired");
    }
    return outcome;
  }

  async linkedUser(
    secret: string | undefined,
    expectedSecret: string | undefined,
    tenantId: string,
    discordUserId: string,
    guildId: string,
  ): Promise<User> {
    if (
      !expectedSecret ||
      !secret ||
      secret.length !== expectedSecret.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret))
    )
      fail(401, "Integration authentication required");
    const result = await this.pool.query<User>(
      `SELECT u.id,u.email,u.role FROM discord_account_links l
       JOIN support_tenants t ON t.id=l.tenant_id
       JOIN support_members m ON m.tenant_id=l.tenant_id AND m.user_id=l.user_id AND m.active
       JOIN users u ON u.id=l.user_id AND NOT u.disabled
       WHERE l.tenant_id=$1 AND l.discord_user_id=$2 AND l.state='verified' AND t.guild_id=$3`,
      [tenantId, discordUserId, guildId],
    );
    return result.rows[0] ?? missing();
  }
}
