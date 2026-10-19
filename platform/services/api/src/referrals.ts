import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "@kush/database";
import { z } from "@kush/contracts";
import type { WebSession } from "./account-service.js";
import type { WebHelpers } from "./accounts.js";
import { applyCredit } from "./credit.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { enqueueNotification } from "./notifications.js";
import { demand } from "./staff-access.js";
import { SupportError } from "./support-service.js";
import type { StaffHelpers } from "./web-staff.js";

/**
 * Referrals. Discord does not say who invited whom: the bot infers it by
 * comparing invite use counts when someone joins (confidence "exact" when
 * exactly one invite moved, "probable" otherwise), or the new member claims
 * it with the inviter's personal code ("claimed"). Either way a referral only
 * counts once it QUALIFIES: the account is old enough, the member has stayed
 * long enough, and nothing looks suspicious. Rewards are milestone-based,
 * each paid once per member (database-unique), credit via the idempotent
 * ledger.
 */

export interface Milestone {
  count: number;
  type: "credit" | "service_voucher" | "product_voucher";
  valuePence: number | null;
  label: string;
}
export interface ReferralSettings {
  minAccountAgeDays: number;
  minMembershipDays: number;
  /** Joins credited to one inviter within an hour before they're flagged. */
  burstLimit: number;
  /** Days after joining that a code can still be claimed. */
  claimWindowDays: number;
  milestones: Milestone[];
  /** Offers (catalogue ids) the free-service reward can be used on. Empty = staff decide. */
  eligibleServiceOfferIds: string[];
}
export const defaultReferralSettings: ReferralSettings = {
  minAccountAgeDays: 14,
  minMembershipDays: 7,
  burstLimit: 8,
  claimWindowDays: 7,
  milestones: [
    {
      count: 10,
      type: "credit",
      valuePence: 500,
      label: "£5 KUSH store credit",
    },
    {
      count: 20,
      type: "service_voucher",
      valuePence: null,
      label: "Customer role and one eligible free service",
    },
    {
      count: 25,
      type: "product_voucher",
      valuePence: 5000,
      label: "One eligible free product worth up to £50",
    },
  ],
  eligibleServiceOfferIds: [],
};

type Tx = Pick<PoolClient, "query">;
const DAY = 86_400_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class ReferralService {
  constructor(private readonly pool: Pool) {}

  async settings(c: Tx, tenantId: string): Promise<ReferralSettings> {
    const row = (
      await c.query<{ value: Partial<ReferralSettings> }>(
        "SELECT value FROM platform_settings WHERE tenant_id=$1 AND key='referrals'",
        [tenantId],
      )
    ).rows[0];
    return { ...defaultReferralSettings, ...(row?.value ?? {}) };
  }

  /** The member's personal code, created on first use. */
  async codeFor(tenantId: string, discordUserId: string) {
    const existing = (
      await this.pool.query<{ code: string }>(
        "SELECT code FROM referral_codes WHERE tenant_id=$1 AND discord_user_id=$2",
        [tenantId, discordUserId],
      )
    ).rows[0];
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from(
        { length: 8 },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join("");
      const inserted = await this.pool.query(
        "INSERT INTO referral_codes(tenant_id, discord_user_id, code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING code",
        [tenantId, discordUserId, code],
      );
      if (inserted.rowCount) return code;
      const raced = (
        await this.pool.query<{ code: string }>(
          "SELECT code FROM referral_codes WHERE tenant_id=$1 AND discord_user_id=$2",
          [tenantId, discordUserId],
        )
      ).rows[0];
      if (raced) return raced.code;
    }
    throw new SupportError(503, "Couldn't create a referral code. Try again");
  }

  /** Records a referral at join time (or a claimed code). First one wins. */
  async record(
    tenantId: string,
    input: {
      inviterDiscordId: string;
      invitedDiscordId: string;
      source: "invite" | "code";
      inviteCode?: string | null;
      confidence: "exact" | "probable" | "claimed";
      accountCreatedAt: Date;
      joinedAt: Date;
    },
  ) {
    if (input.inviterDiscordId === input.invitedDiscordId)
      return { recorded: false, reason: "You can't refer yourself" };
    const settings = await this.settings(this.pool, tenantId);
    const recent = Number(
      (
        await this.pool.query<{ n: string }>(
          "SELECT count(*) AS n FROM referrals WHERE tenant_id=$1 AND inviter_discord_id=$2 AND created_at > now() - interval '1 hour'",
          [tenantId, input.inviterDiscordId],
        )
      ).rows[0]!.n,
    );
    const youngAccount =
      Date.now() - input.accountCreatedAt.getTime() <
      settings.minAccountAgeDays * DAY;
    const status =
      youngAccount || recent >= settings.burstLimit ? "flagged" : "pending";
    const reason = youngAccount
      ? `Account younger than ${settings.minAccountAgeDays} days`
      : recent >= settings.burstLimit
        ? "Many joins credited to this inviter in the last hour"
        : null;
    const inserted = await this.pool.query(
      `INSERT INTO referrals(tenant_id, inviter_discord_id, invited_discord_id, source, invite_code, confidence, account_created_at, joined_at, status, status_reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id, invited_discord_id) DO NOTHING RETURNING id`,
      [
        tenantId,
        input.inviterDiscordId,
        input.invitedDiscordId,
        input.source,
        input.inviteCode ?? null,
        input.confidence,
        input.accountCreatedAt,
        input.joinedAt,
        status,
        reason,
      ],
    );
    return inserted.rowCount
      ? { recorded: true, status }
      : { recorded: false, reason: "This member was already referred" };
  }

  /** A new member claims the code of whoever invited them. */
  async claim(
    tenantId: string,
    input: {
      invitedDiscordId: string;
      code: string;
      accountCreatedAt: Date;
      joinedAt: Date;
    },
  ) {
    const settings = await this.settings(this.pool, tenantId);
    if (Date.now() - input.joinedAt.getTime() > settings.claimWindowDays * DAY)
      throw new SupportError(
        409,
        `Codes can only be claimed in your first ${settings.claimWindowDays} days`,
      );
    const owner = (
      await this.pool.query<{ discord_user_id: string }>(
        "SELECT discord_user_id FROM referral_codes WHERE tenant_id=$1 AND code=$2",
        [tenantId, input.code.toUpperCase()],
      )
    ).rows[0];
    if (!owner) throw new SupportError(404, "That code doesn't exist");
    const result = await this.record(tenantId, {
      inviterDiscordId: owner.discord_user_id,
      invitedDiscordId: input.invitedDiscordId,
      source: "code",
      confidence: "claimed",
      accountCreatedAt: input.accountCreatedAt,
      joinedAt: input.joinedAt,
    });
    if (!result.recorded)
      throw new SupportError(
        409,
        result.reason ?? "Couldn't record that referral",
      );
    return { inviterDiscordId: owner.discord_user_id, status: result.status };
  }

  /** Leaving before qualifying disqualifies a pending referral. */
  async left(tenantId: string, discordUserId: string) {
    await this.pool.query(
      `UPDATE referrals SET left_at=now(), updated_at=now(),
         status=CASE WHEN status IN ('pending','flagged') THEN 'disqualified' ELSE status END,
         status_reason=CASE WHEN status IN ('pending','flagged') THEN 'Left before qualifying' ELSE status_reason END
       WHERE tenant_id=$1 AND invited_discord_id=$2 AND left_at IS NULL`,
      [tenantId, discordUserId],
    );
  }

  /** Qualifies eligible referrals, then issues any milestones crossed. */
  async run(tenantId: string) {
    const settings = await this.settings(this.pool, tenantId);
    const qualified = await this.pool.query<{ inviter_discord_id: string }>(
      `UPDATE referrals SET status='qualified', qualified_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND status='pending' AND left_at IS NULL
         AND joined_at <= now() - make_interval(days => $2)
         AND account_created_at <= now() - make_interval(days => $3)
       RETURNING inviter_discord_id`,
      [tenantId, settings.minMembershipDays, settings.minAccountAgeDays],
    );
    const inviters = new Set(
      qualified.rows.map((row) => row.inviter_discord_id),
    );
    // Also retry inviters with milestones waiting on an account link.
    for (const row of (
      await this.pool.query<{ inviter_discord_id: string }>(
        `SELECT inviter_discord_id FROM referrals WHERE tenant_id=$1 AND status='qualified'
         GROUP BY inviter_discord_id HAVING count(*) >= $2`,
        [tenantId, Math.min(...settings.milestones.map((m) => m.count))],
      )
    ).rows)
      inviters.add(row.inviter_discord_id);
    let issued = 0;
    for (const inviter of inviters)
      issued += await this.issue(tenantId, inviter, settings);
    return { qualified: qualified.rowCount ?? 0, issued };
  }

  private async issue(
    tenantId: string,
    inviter: string,
    settings: ReferralSettings,
  ) {
    const c = await this.pool.connect();
    let issued = 0;
    try {
      await c.query("BEGIN");
      const count = Number(
        (
          await c.query<{ n: string }>(
            "SELECT count(*) AS n FROM referrals WHERE tenant_id=$1 AND inviter_discord_id=$2 AND status='qualified'",
            [tenantId, inviter],
          )
        ).rows[0]!.n,
      );
      const user = (
        await c.query<{ user_id: string }>(
          "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
          [tenantId, inviter],
        )
      ).rows[0];
      for (const milestone of settings.milestones.filter(
        (m) => m.count <= count,
      )) {
        // Rewards need a KUSH account (credit lives there); retried after linking.
        if (!user) break;
        const reward = await c.query<{ id: string }>(
          `INSERT INTO referral_rewards(tenant_id, discord_user_id, milestone, reward_type, value_pence)
           VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, discord_user_id, milestone) DO NOTHING RETURNING id`,
          [
            tenantId,
            inviter,
            milestone.count,
            milestone.type,
            milestone.valuePence,
          ],
        );
        if (!reward.rowCount) continue;
        if (milestone.type === "credit" && milestone.valuePence) {
          const credit = await applyCredit(c, {
            tenantId,
            userId: user.user_id,
            amountPence: milestone.valuePence,
            kind: "reward",
            idempotencyKey: `referral:${inviter}:${milestone.count}`,
            reference: `Referral milestone ${milestone.count}`,
          });
          await c.query(
            "UPDATE referral_rewards SET credit_transaction_id=$2, status='redeemed', redeemed_at=now() WHERE id=$1",
            [reward.rows[0]!.id, credit.id],
          );
        }
        await enqueueNotification(
          c,
          tenantId,
          "referral.reward",
          reward.rows[0]!.id,
          {
            discordUserId: inviter,
            milestone: String(milestone.count),
            label: milestone.label,
            type: milestone.type,
          },
          `referral.reward:${reward.rows[0]!.id}`,
        );
        issued += 1;
      }
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
    return issued;
  }

  async summary(tenantId: string, discordUserId: string) {
    const settings = await this.settings(this.pool, tenantId);
    const counts = (
      await this.pool.query<{ status: string; n: string }>(
        "SELECT status, count(*) AS n FROM referrals WHERE tenant_id=$1 AND inviter_discord_id=$2 GROUP BY status",
        [tenantId, discordUserId],
      )
    ).rows.reduce<Record<string, number>>(
      (all, row) => ({ ...all, [row.status]: Number(row.n) }),
      {},
    );
    const rewards = (
      await this.pool.query(
        `SELECT milestone, reward_type AS "type", value_pence AS "valuePence", status, issued_at AS "issuedAt"
         FROM referral_rewards WHERE tenant_id=$1 AND discord_user_id=$2 ORDER BY milestone`,
        [tenantId, discordUserId],
      )
    ).rows;
    const qualified = counts.qualified ?? 0;
    const next = settings.milestones.find((m) => m.count > qualified) ?? null;
    const linked = Boolean(
      (
        await this.pool.query(
          "SELECT 1 FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
          [tenantId, discordUserId],
        )
      ).rowCount,
    );
    return {
      code: await this.codeFor(tenantId, discordUserId),
      qualified,
      pending: counts.pending ?? 0,
      underReview: counts.flagged ?? 0,
      disqualified: counts.disqualified ?? 0,
      rewards,
      milestones: settings.milestones,
      next: next ? { ...next, remaining: next.count - qualified } : null,
      linked,
      rules: {
        minAccountAgeDays: settings.minAccountAgeDays,
        minMembershipDays: settings.minMembershipDays,
      },
    };
  }

  async leaderboard(tenantId: string) {
    return (
      await this.pool.query<{ discordUserId: string; qualified: number }>(
        `SELECT inviter_discord_id AS "discordUserId", count(*)::int AS qualified FROM referrals
         WHERE tenant_id=$1 AND status='qualified' GROUP BY inviter_discord_id ORDER BY qualified DESC, min(qualified_at) LIMIT 10`,
        [tenantId],
      )
    ).rows;
  }
}

export async function registerReferrals(
  app: FastifyInstance,
  { pool, web, staff }: { pool: Pool; web: WebHelpers; staff: StaffHelpers },
) {
  const referrals = new ReferralService(pool);
  const { signedIn, body } = web;
  const { asStaff } = staff;
  const snowflake = z.string().regex(/^[0-9]{17,20}$/);
  const date = z.coerce.date();

  // Qualification runs on a timer for the configured tenant.
  const configured = process.env.KUSH_SUPPORT_TENANT_ID;
  if (configured && process.env.NODE_ENV !== "test") {
    const timer = setInterval(
      () =>
        void referrals
          .run(configured)
          .catch((error: unknown) =>
            app.log.warn({ error }, "referrals.run.failed"),
          ),
      10 * 60_000,
    );
    app.addHook("onClose", async () => clearInterval(timer));
  }

  const handle = async (reply: FastifyReply, work: () => Promise<unknown>) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await work();
    } catch (error) {
      if (error instanceof SupportError)
        return reply.code(error.status).send({ error: error.message });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "Invalid request" });
      throw error;
    }
  };
  const bot = async (request: FastifyRequest) => {
    const header = (name: string) =>
      typeof request.headers[name] === "string"
        ? (request.headers[name] as string)
        : "";
    verifyIntegrationSecret(
      header("x-kush-discord-secret") || undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    const { tenantId } = request.params as { tenantId: string };
    if (
      !(
        await pool.query(
          "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
          [tenantId, header("x-kush-discord-guild-id")],
        )
      ).rowCount
    )
      throw new SupportError(404, "Support resource not found");
    return tenantId;
  };
  const base = "/discord/integration/tenants/:tenantId/referrals";
  const tenantParams = {
    type: "object",
    properties: { tenantId: { type: "string", format: "uuid" } },
    required: ["tenantId"],
  };

  const joinSchema = z
    .object({
      invitedDiscordId: snowflake,
      accountCreatedAt: date,
      joinedAt: date,
      inviter: z
        .object({
          discordUserId: snowflake,
          inviteCode: z.string().max(40).nullable(),
          confidence: z.enum(["exact", "probable"]),
        })
        .nullable(),
    })
    .strict();
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/joins`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const input = joinSchema.parse(request.body);
        if (!input.inviter) return { recorded: false };
        return referrals.record(tenantId, {
          inviterDiscordId: input.inviter.discordUserId,
          invitedDiscordId: input.invitedDiscordId,
          source: "invite",
          inviteCode: input.inviter.inviteCode,
          confidence: input.inviter.confidence,
          accountCreatedAt: input.accountCreatedAt,
          joinedAt: input.joinedAt,
        });
      }),
  );
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/leaves`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        await referrals.left(
          tenantId,
          z.object({ discordUserId: snowflake }).strict().parse(request.body)
            .discordUserId,
        );
        return { ok: true };
      }),
  );
  const claimSchema = z
    .object({
      invitedDiscordId: snowflake,
      code: z.string().trim().min(6).max(10),
      accountCreatedAt: date,
      joinedAt: date,
    })
    .strict();
  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    `${base}/claim`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () =>
        referrals.claim(await bot(request), claimSchema.parse(request.body)),
      ),
  );
  app.get<{
    Params: { tenantId: string };
    Querystring: { discordUserId?: string };
  }>(
    `${base}/me`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () =>
        referrals.summary(
          await bot(request),
          snowflake.parse(request.query.discordUserId),
        ),
      ),
  );
  app.get<{ Params: { tenantId: string } }>(
    `${base}/leaderboard`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => ({
        leaders: await referrals.leaderboard(await bot(request)),
      })),
  );
  app.post<{ Params: { tenantId: string } }>(
    `${base}/run`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => referrals.run(await bot(request))),
  );

  // Customer view (website).
  app.get(
    "/web/workspace/referrals",
    signedIn(async (session: WebSession) => {
      const tenantId = process.env.KUSH_SUPPORT_TENANT_ID;
      if (!tenantId) throw new SupportError(503, "Not configured");
      const link = (
        await pool.query<{ discord_user_id: string }>(
          "SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified'",
          [tenantId, session.userId],
        )
      ).rows[0];
      if (!link) return { linked: false };
      return await referrals.summary(tenantId, link.discord_user_id);
    }),
  );

  // Staff review.
  app.get(
    "/web/staff/referrals",
    asStaff(async (ctx) => {
      demand(ctx, "referrals.review");
      return {
        referrals: (
          await pool.query(
            `SELECT id, inviter_discord_id AS "inviterDiscordId", invited_discord_id AS "invitedDiscordId", source, confidence, status,
                    status_reason AS "statusReason", joined_at AS "joinedAt", account_created_at AS "accountCreatedAt", left_at AS "leftAt", qualified_at AS "qualifiedAt"
             FROM referrals WHERE tenant_id=$1 ORDER BY (status='flagged') DESC, created_at DESC LIMIT 200`,
            [ctx.tenantId],
          )
        ).rows,
        rewards: (
          await pool.query(
            `SELECT id, discord_user_id AS "discordUserId", milestone, reward_type AS "type", value_pence AS "valuePence", status, issued_at AS "issuedAt", redeemed_note AS "redeemedNote"
             FROM referral_rewards WHERE tenant_id=$1 ORDER BY issued_at DESC LIMIT 200`,
            [ctx.tenantId],
          )
        ).rows,
        leaderboard: await referrals.leaderboard(ctx.tenantId),
        settings: await referrals.settings(pool, ctx.tenantId),
      };
    }),
  );
  const reviewSchema = z
    .object({
      decision: z.enum(["approve", "disqualify"]),
      reason: z.string().trim().min(3).max(300),
    })
    .strict();
  app.post(
    "/web/staff/referrals/:referralId/review",
    {
      schema: {
        params: {
          type: "object",
          properties: { referralId: { type: "string", format: "uuid" } },
          required: ["referralId"],
        },
        body: body(reviewSchema),
      },
    },
    asStaff(async (ctx, request) => {
      demand(ctx, "referrals.review");
      const { decision, reason } = reviewSchema.parse(request.body);
      const { referralId } = request.params as { referralId: string };
      // Approving a flagged referral puts it back in the normal queue: it
      // still has to meet the membership rules to qualify.
      const result = await pool.query(
        `UPDATE referrals SET status=$3, status_reason=$4, reviewed_by=$5, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND status IN ('flagged','pending') RETURNING id`,
        [
          ctx.tenantId,
          referralId,
          decision === "approve" ? "pending" : "disqualified",
          reason,
          ctx.userId,
        ],
      );
      if (!result.rowCount)
        throw new SupportError(409, "That referral can't be changed now");
      await pool.query(
        "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,$3)",
        [ctx.tenantId, ctx.userId, `staff.referral.${decision}`],
      );
      return { saved: true };
    }),
  );
  const rewardSchema = z
    .object({ note: z.string().trim().min(3).max(300) })
    .strict();
  app.post(
    "/web/staff/referrals/rewards/:rewardId/redeem",
    {
      schema: {
        params: {
          type: "object",
          properties: { rewardId: { type: "string", format: "uuid" } },
          required: ["rewardId"],
        },
        body: body(rewardSchema),
      },
    },
    asStaff(async (ctx, request) => {
      demand(ctx, "referrals.review");
      const { rewardId } = request.params as { rewardId: string };
      // Vouchers (free service / product) are fulfilled by staff, once.
      const result = await pool.query(
        "UPDATE referral_rewards SET status='redeemed', redeemed_at=now(), redeemed_note=$3 WHERE tenant_id=$1 AND id=$2 AND status='issued' AND reward_type<>'credit' RETURNING id",
        [ctx.tenantId, rewardId, rewardSchema.parse(request.body).note],
      );
      if (!result.rowCount)
        throw new SupportError(
          409,
          "That reward was already redeemed or can't be redeemed here",
        );
      await pool.query(
        "INSERT INTO audit_events(tenant_id, actor_id, action) VALUES($1,$2,'staff.referral.reward.redeemed')",
        [ctx.tenantId, ctx.userId],
      );
      return { saved: true };
    }),
  );
}
