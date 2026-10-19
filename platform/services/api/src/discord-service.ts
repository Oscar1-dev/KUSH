import { timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "@kush/database";
import type { DiscordTicketChannel, TicketQueue, User } from "@kush/contracts";
import { SupportError } from "./support-service.js";

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const notFound = () => fail(404, "Support resource not found");

/** Non-scrypt sentinel: verifyPassword() rejects it, so these users can never sign in. */
export const DISCORD_IDENTITY_PASSWORD = "DISCORD_IDENTITY_NO_LOGIN";
/** Open (not closed) tickets a single Discord member may hold at once. */
export const MAX_OPEN_DISCORD_TICKETS = 3;

export function verifyIntegrationSecret(
  secret: string | undefined,
  expected: string | undefined,
) {
  if (
    !expected ||
    !secret ||
    secret.length !== expected.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  )
    fail(401, "Integration authentication required");
}

type Queryable = Pick<PoolClient, "query">;

/**
 * Discord identity and ticket-channel persistence. The bot authenticates with
 * the integration secret; every call is then scoped to the tenant whose
 * guild ID matches, and ticket authorisation stays in SupportService.
 */
export class DiscordService {
  constructor(private readonly pool: Pool) {}

  private async tenantForGuild(
    c: Queryable,
    tenantId: string,
    guildId: string,
  ) {
    const result = await c.query<{ id: string }>(
      "SELECT id FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, guildId],
    );
    return result.rows[0] ?? notFound();
  }

  /**
   * Resolves a Discord member to a KUSH user: a verified account link first,
   * then an existing Discord identity. With `provision`, creates a Discord
   * identity (customer role, cannot sign in) so members without a KUSH
   * account can open tickets.
   */
  async actor(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    provision?: boolean;
  }): Promise<User> {
    if (!/^[0-9]{17,20}$/.test(input.discordUserId))
      fail(400, "Invalid Discord user");
    await this.tenantForGuild(this.pool, input.tenantId, input.guildId);
    const linked = await this.pool.query<User>(
      `SELECT u.id,u.email,u.role FROM discord_account_links l
       JOIN support_members m ON m.tenant_id=l.tenant_id AND m.user_id=l.user_id AND m.active
       JOIN users u ON u.id=l.user_id AND NOT u.disabled
       WHERE l.tenant_id=$1 AND l.discord_user_id=$2 AND l.state='verified'`,
      [input.tenantId, input.discordUserId],
    );
    if (linked.rows[0]) return linked.rows[0];
    const guest = await this.pool.query<User>(
      `SELECT u.id,u.email,u.role FROM discord_identities d
       JOIN support_members m ON m.tenant_id=d.tenant_id AND m.user_id=d.user_id AND m.active
       JOIN users u ON u.id=d.user_id AND NOT u.disabled
       WHERE d.tenant_id=$1 AND d.discord_user_id=$2`,
      [input.tenantId, input.discordUserId],
    );
    if (guest.rows[0]) return guest.rows[0];
    if (!input.provision) return notFound();

    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Serialise concurrent first tickets from the same member.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${input.tenantId}:${input.discordUserId}`,
      ]);
      const again = await c.query<User>(
        `SELECT u.id,u.email,u.role FROM discord_identities d JOIN users u ON u.id=d.user_id
         WHERE d.tenant_id=$1 AND d.discord_user_id=$2`,
        [input.tenantId, input.discordUserId],
      );
      if (again.rows[0]) {
        await c.query("COMMIT");
        return again.rows[0];
      }
      const user = (
        await c.query<User>(
          `INSERT INTO users(email,password_hash,role,kind) VALUES($1,$2,'customer','discord')
           RETURNING id,email,role`,
          [
            `discord-${input.tenantId}-${input.discordUserId}@discord.invalid`,
            DISCORD_IDENTITY_PASSWORD,
          ],
        )
      ).rows[0]!;
      await c.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')",
        [input.tenantId, user.id],
      );
      await c.query(
        "INSERT INTO discord_identities(tenant_id,discord_user_id,user_id) VALUES($1,$2,$3)",
        [input.tenantId, input.discordUserId, user.id],
      );
      await c.query(
        "INSERT INTO audit_events(actor_id,tenant_id,action) VALUES($1,$2,'discord.identity.created')",
        [user.id, input.tenantId],
      );
      await c.query("COMMIT");
      return user;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }

  /** Duplicate and spam prevention for Discord-created tickets. */
  async assertCanOpen(tenantId: string, user: User, requestId: string) {
    const replay = await this.pool.query(
      "SELECT 1 FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND create_request_id=$3",
      [tenantId, user.id, requestId],
    );
    if (replay.rowCount) return; // Idempotent retry of the same submission.
    const open = await this.pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND status<>'closed'",
      [tenantId, user.id],
    );
    if ((open.rows[0]?.count ?? 0) >= MAX_OPEN_DISCORD_TICKETS)
      fail(
        429,
        `You already have ${MAX_OPEN_DISCORD_TICKETS} open tickets. Please continue in an existing ticket.`,
      );
  }

  /** Records the private channel for a ticket the caller can see (checked by the route). */
  async setChannel(input: {
    tenantId: string;
    guildId: string;
    ticketId: string;
    channelId: string;
    queue: TicketQueue;
  }) {
    const result = await this.pool.query<{ channel_id: string }>(
      `INSERT INTO discord_ticket_channels(tenant_id,ticket_id,guild_id,channel_id,queue)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(tenant_id,ticket_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,queue=EXCLUDED.queue,state='active',updated_at=now()
       RETURNING channel_id`,
      [
        input.tenantId,
        input.ticketId,
        input.guildId,
        input.channelId,
        input.queue,
      ],
    );
    return { channelId: result.rows[0]!.channel_id };
  }

  async setChannelState(
    tenantId: string,
    guildId: string,
    channelId: string,
    state: "active" | "archived",
  ) {
    await this.tenantForGuild(this.pool, tenantId, guildId);
    const result = await this.pool.query(
      "UPDATE discord_ticket_channels SET state=$3,updated_at=now() WHERE tenant_id=$1 AND channel_id=$2",
      [tenantId, channelId, state],
    );
    if (!result.rowCount) notFound();
  }

  async ticketIdForChannel(tenantId: string, channelId: string) {
    const result = await this.pool.query<{ ticket_id: string }>(
      "SELECT ticket_id FROM discord_ticket_channels WHERE tenant_id=$1 AND channel_id=$2",
      [tenantId, channelId],
    );
    return result.rows[0]?.ticket_id ?? notFound();
  }

  async channelForTicket(tenantId: string, ticketId: string) {
    const result = await this.pool.query<{
      channel_id: string;
      queue: TicketQueue;
    }>(
      "SELECT channel_id,queue FROM discord_ticket_channels WHERE tenant_id=$1 AND ticket_id=$2",
      [tenantId, ticketId],
    );
    return result.rows[0] ?? null;
  }

  /** Service-level list for restart recovery: identifiers and state only, no content. */
  async channels(
    tenantId: string,
    guildId: string,
    state: "active" | "archived" = "active",
  ): Promise<DiscordTicketChannel[]> {
    await this.tenantForGuild(this.pool, tenantId, guildId);
    const result = await this.pool.query<{
      ticket_id: string;
      number: number;
      status: string;
      category: string;
      priority: string;
      channel_id: string;
      queue: TicketQueue;
      state: "active" | "archived";
      customer_discord: string | null;
      assignee_discord: string | null;
      participants: string[];
    }>(
      `SELECT d.ticket_id,t.number,t.status,t.category,t.priority,d.channel_id,d.queue,d.state,
         COALESCE(cl.discord_user_id, ci.discord_user_id) AS customer_discord,
         al.discord_user_id AS assignee_discord,
         ARRAY(SELECT p.discord_user_id FROM support_ticket_participants p WHERE p.tenant_id=t.tenant_id AND p.ticket_id=t.id ORDER BY p.created_at) AS participants
       FROM discord_ticket_channels d
       JOIN support_tickets t ON t.tenant_id=d.tenant_id AND t.id=d.ticket_id
       LEFT JOIN discord_account_links cl ON cl.tenant_id=t.tenant_id AND cl.user_id=t.customer_id AND cl.state='verified'
       LEFT JOIN discord_identities ci ON ci.tenant_id=t.tenant_id AND ci.user_id=t.customer_id
       LEFT JOIN discord_account_links al ON al.tenant_id=t.tenant_id AND al.user_id=t.assigned_user_id AND al.state='verified'
       WHERE d.tenant_id=$1 AND d.state=$2 ORDER BY t.number`,
      [tenantId, state],
    );
    return result.rows.map((row) => ({
      ticketId: row.ticket_id,
      number: row.number,
      status: row.status,
      category: row.category,
      priority: row.priority,
      channelId: row.channel_id,
      queue: row.queue,
      state: row.state,
      customerDiscordUserId: row.customer_discord,
      assigneeDiscordUserId: row.assignee_discord,
      participantDiscordUserIds: row.participants,
    }));
  }

  /** Maps a Discord member to the KUSH staff account they verified. */
  async linkedUserId(tenantId: string, discordUserId: string) {
    const result = await this.pool.query<{ user_id: string }>(
      "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
      [tenantId, discordUserId],
    );
    return (
      result.rows[0]?.user_id ??
      fail(400, "That member has not linked a KUSH staff account")
    );
  }
}
