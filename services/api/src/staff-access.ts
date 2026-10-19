import { readFileSync } from "node:fs";
import type { Pool } from "@kush/database";
import type { WebSession } from "./account-service.js";
import { SupportError } from "./support-service.js";

/**
 * Staff authorisation for the website's staff dashboard.
 *
 * The rules:
 * - Staff roles come from the member's CURRENT Discord roles, fetched live
 *   from Discord by the backend, mapped by role ID (never by name) through
 *   `staff_role_mappings`. Nothing the browser sends is trusted.
 * - If Discord cannot be reached, access is refused (fail closed).
 * - Staff must have 2FA on, and the session must have passed it recently.
 * - Being staff never grants product ownership; staff routes do not touch
 *   entitlements.
 */

export const staffRoles = [
  "support",
  "developer",
  "moderator",
  "manager",
  "administrator",
  "owner",
] as const;
export type StaffRole = (typeof staffRoles)[number];

export const permissions = [
  "tickets.assigned", // see and work tickets assigned to me
  "tickets.queue", // see the unassigned queue and claim from it
  "tickets.all", // see every (non-report) ticket
  "tickets.billing", // confidential billing tickets
  "tickets.assign", // assign tickets to other staff
  "reports.handle", // member reports (moderation)
  "commissions.assigned", // see and progress commissions assigned to me
  "commissions.all", // see every commission
  "commissions.manage", // review, quote, cancel, internal notes
  "commissions.assign",
  "team.view",
  "audit.view",
  "applications.review", // read and progress staff applications
  "applications.decide", // accept, issue NDA, approve, activate
  "agreements.manage", // NDA templates and signed agreements
  "customers.view", // customer accounts list
  "operations.view", // bot/outbox health, catalogue, orders, settings
  "moderation.view", // moderation cases (also recorded from Discord)
  "vouches.manage", // remove fake or abusive vouches
  "team.offboard", // remove someone from the staff team
  "catalogue.manage", // services, offers and prices
  "products.manage", // sellable products and their Stripe records
  "orders.view", // orders and payment status
  "payments.manage", // record offline payments
  "refunds.manage", // issue refunds
  "credit.adjust", // manual store-credit adjustments
  "referrals.review", // review flagged referrals, rewards
  "stats.view", // business overview numbers
] as const;
export type Permission = (typeof permissions)[number];

const grants: Record<StaffRole, Permission[]> = {
  support: ["tickets.assigned", "tickets.queue"],
  developer: ["commissions.assigned"],
  moderator: ["reports.handle", "moderation.view", "vouches.manage"],
  manager: [
    "tickets.assigned",
    "tickets.queue",
    "tickets.all",
    "tickets.billing",
    "tickets.assign",
    "commissions.assigned",
    "commissions.all",
    "commissions.manage",
    "commissions.assign",
    "team.view",
    "applications.review",
    "customers.view",
    "moderation.view",
    "catalogue.manage",
    "orders.view",
    "referrals.review",
    "stats.view",
  ],
  administrator: [
    "tickets.assigned",
    "tickets.queue",
    "tickets.all",
    "tickets.billing",
    "tickets.assign",
    "commissions.assigned",
    "commissions.all",
    "commissions.manage",
    "commissions.assign",
    "team.view",
    "audit.view",
    "applications.review",
    "applications.decide",
    "agreements.manage",
    "customers.view",
    "operations.view",
    "moderation.view",
    "vouches.manage",
    "team.offboard",
    "catalogue.manage",
    "products.manage",
    "orders.view",
    "payments.manage",
    "refunds.manage",
    "credit.adjust",
    "referrals.review",
    "stats.view",
  ],
  owner: [...permissions],
};

/** Union of every role's grants (users may hold several roles). */
export const permissionsFor = (roles: StaffRole[]) =>
  [...new Set(roles.flatMap((role) => grants[role]))].sort() as Permission[];

/** A staff session must have passed 2FA within this window. */
export const STAFF_MFA_HOURS = 12;

// ------------------------------------------------- live Discord membership

export type MemberLookup =
  | { state: "member"; roleIds: string[] }
  | { state: "not_member" }
  | { state: "unavailable" };

/** Injectable so tests never call Discord. */
export interface DiscordMembers {
  member(discordUserId: string): Promise<MemberLookup>;
}

/** Discord REST with the bot's own credentials; short in-memory cache. */
export function discordMembersFromEnv(): DiscordMembers | null {
  const guildId = process.env.KUSH_DISCORD_GUILD_ID;
  const tokenFile = process.env.KUSH_DISCORD_BOT_TOKEN_FILE;
  if (!guildId || !tokenFile) return null;
  const apiBase =
    process.env.KUSH_DISCORD_API_BASE ?? "https://discord.com/api/v10";
  const cache = new Map<string, { at: number; value: MemberLookup }>();
  return {
    async member(discordUserId) {
      const hit = cache.get(discordUserId);
      if (hit && Date.now() - hit.at < 60_000) return hit.value;
      let value: MemberLookup;
      try {
        const token = readFileSync(tokenFile, "utf8").trim();
        const response = await fetch(
          `${apiBase}/guilds/${guildId}/members/${discordUserId}`,
          {
            headers: { authorization: `Bot ${token}` },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (response.status === 404) value = { state: "not_member" };
        else if (!response.ok) value = { state: "unavailable" };
        else {
          const body = (await response.json()) as { roles?: unknown };
          value = Array.isArray(body.roles)
            ? {
                state: "member",
                roleIds: body.roles.filter(
                  (r): r is string => typeof r === "string",
                ),
              }
            : { state: "unavailable" };
        }
      } catch {
        value = { state: "unavailable" };
      }
      // Never cache an outage: the next request tries Discord again.
      if (value.state !== "unavailable")
        cache.set(discordUserId, { at: Date.now(), value });
      return value;
    },
  };
}

export interface StaffContext {
  tenantId: string;
  userId: string;
  discordUserId: string;
  roles: StaffRole[];
  permissions: Permission[];
  session: WebSession;
}

export type StaffDenial =
  | "not_linked"
  | "not_staff"
  | "mfa_setup_required"
  | "mfa_required"
  | "discord_unavailable";

export class StaffAccessError extends SupportError {
  constructor(readonly reason: StaffDenial) {
    super(
      reason === "discord_unavailable" ? 503 : 403,
      {
        not_linked: "Sign in with Discord to use staff tools",
        not_staff: "Staff access required",
        mfa_setup_required: "Staff must turn on two-factor authentication",
        mfa_required: "Confirm your two-factor code to continue",
        discord_unavailable:
          "Discord could not confirm your staff roles. Try again shortly.",
      }[reason],
    );
  }
}

export class StaffAccess {
  constructor(
    private readonly pool: Pool,
    private readonly members: () => DiscordMembers | null,
  ) {}

  private async audit(actor: string, action: string, tenantId: string) {
    await this.pool
      .query(
        "INSERT INTO audit_events(actor_id,action,tenant_id) VALUES($1,$2,$3)",
        [actor, action, tenantId],
      )
      .catch(() => undefined);
  }

  /** Roles for a Discord user right now, or why they have none. */
  async liveRoles(
    tenantId: string,
    discordUserId: string,
  ): Promise<StaffRole[] | "unavailable"> {
    const lookup = this.members();
    if (!lookup) return "unavailable";
    const member = await lookup.member(discordUserId);
    if (member.state === "unavailable") return "unavailable";
    if (member.state === "not_member" || member.roleIds.length === 0) return [];
    const mapped = await this.pool.query<{ staff_role: StaffRole }>(
      "SELECT DISTINCT staff_role FROM staff_role_mappings WHERE tenant_id=$1 AND discord_role_id = ANY($2::text[])",
      [tenantId, member.roleIds],
    );
    return mapped.rows
      .map((row) => row.staff_role)
      .sort((a, b) => staffRoles.indexOf(a) - staffRoles.indexOf(b));
  }

  /** Resolves (and enforces) staff access for a website session. */
  async require(session: WebSession): Promise<StaffContext> {
    const tenantId = process.env.KUSH_SUPPORT_TENANT_ID;
    if (!tenantId)
      throw new SupportError(503, "Staff tools are not configured");
    const identity = (
      await this.pool.query<{ subject: string }>(
        `SELECT i.subject FROM user_identities i
         JOIN discord_account_links l ON l.user_id=i.user_id AND l.tenant_id=$2
           AND l.discord_user_id=i.subject AND l.state='verified'
         WHERE i.user_id=$1 AND i.provider='discord'`,
        [session.userId, tenantId],
      )
    ).rows[0];
    if (!identity) throw new StaffAccessError("not_linked");

    const roles = await this.liveRoles(tenantId, identity.subject);
    if (roles === "unavailable") {
      await this.audit(
        session.userId,
        "staff.access.discord_unavailable",
        tenantId,
      );
      throw new StaffAccessError("discord_unavailable");
    }
    if (roles.length === 0) {
      await this.audit(session.userId, "staff.access.denied", tenantId);
      throw new StaffAccessError("not_staff");
    }
    if (!session.mfaEnabled) throw new StaffAccessError("mfa_setup_required");
    if (
      !session.mfaVerifiedAt ||
      Date.now() - session.mfaVerifiedAt.getTime() > STAFF_MFA_HOURS * 3_600_000
    )
      throw new StaffAccessError("mfa_required");

    await this.pool.query(
      `INSERT INTO staff_members(tenant_id,user_id,discord_user_id,roles) VALUES($1,$2,$3,$4)
       ON CONFLICT (tenant_id,user_id) DO UPDATE SET discord_user_id=EXCLUDED.discord_user_id,roles=EXCLUDED.roles,last_verified_at=now(),
         offboarded_at=NULL,offboarded_reason=NULL,offboarded_by_discord_id=NULL`,
      [tenantId, session.userId, identity.subject, roles],
    );
    return {
      tenantId,
      userId: session.userId,
      discordUserId: identity.subject,
      roles,
      permissions: permissionsFor(roles),
      session,
    };
  }

  /** Live check of a proposed assignee (never trusts the roster alone). */
  async assigneeRoles(tenantId: string, userId: string) {
    const member = (
      await this.pool.query<{ discord_user_id: string }>(
        "SELECT discord_user_id FROM staff_members WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, userId],
      )
    ).rows[0];
    if (!member) return [];
    const roles = await this.liveRoles(tenantId, member.discord_user_id);
    if (roles === "unavailable")
      throw new StaffAccessError("discord_unavailable");
    return roles;
  }
}

export const can = (staff: StaffContext, permission: Permission) =>
  staff.permissions.includes(permission);

export function demand(staff: StaffContext, permission: Permission) {
  if (!can(staff, permission))
    throw new SupportError(403, "Your staff role does not allow this");
}
