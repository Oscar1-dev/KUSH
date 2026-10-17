import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "@kush/database";
import { z } from "@kush/contracts";
import { verifyIntegrationSecret } from "./discord-service.js";
import { reportCategoriesOf, SupportError } from "./support-service.js";

/**
 * Notification outbox: what the Discord bot should announce.
 *
 * Each job yields exactly ONE delivery (a channel post or one DM), so a
 * retry never repeats a delivery that already succeeded. Content is built
 * here at delivery time from current records; the bot only transports it.
 * Internal notes are never enqueued.
 */

export type NotificationKind =
  | "ticket.created"
  | "ticket.message"
  | "ticket.status"
  | "commission.created"
  | "commission.status"
  | "commission.quote"
  | "commission.milestone"
  | "application.created"
  | "application.channel"
  | "application.message"
  | "application.status"
  | "agreement.issued"
  | "staff.role_grant";

type Queryable = Pick<PoolClient, "query">;

export async function enqueueNotification(
  c: Queryable,
  tenantId: string,
  kind: NotificationKind,
  subjectId: string,
  detail: Record<string, unknown>,
  dedupeKey: string,
) {
  await c.query(
    `INSERT INTO notification_jobs(tenant_id,kind,subject_id,detail,dedupe_key)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,dedupe_key) DO NOTHING`,
    [tenantId, kind, subjectId, JSON.stringify(detail), dedupeKey],
  );
}

export type Delivery =
  | { target: "channel"; channelKey: string; content: string }
  | { target: "ticket_channel"; channelId: string; content: string }
  | { target: "dm"; discordUserId: string; content: string }
  | {
      target: "create_application_channel";
      applicationId: string;
      number: number;
      applicantDiscordId: string;
      content: string;
    }
  | {
      target: "grant_role";
      discordUserId: string;
      roleId: string;
      reason: string;
    }
  | { target: "none"; reason: string };

const MAX_ATTEMPTS = 8;
const site = () => process.env.KUSH_SITE_URL ?? "http://localhost:3000";
/** Discord message limit is 2000; keep mirrored text well inside it. */
const clip = (text: string, max = 1_500) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const ticketLabels: Record<string, string> = {
  open: "open",
  pending: "pending",
  in_progress: "in progress",
  waiting_for_customer: "waiting for your reply",
  resolved: "resolved",
  closed: "closed",
  reopened: "reopened",
};
const commissionLabels: Record<string, string> = {
  reviewing: "under review",
  awaiting_customer: "waiting for you",
  quoted: "quote ready",
  accepted: "accepted",
  in_progress: "in progress",
  awaiting_review: "ready for your review",
  completed: "delivered",
  cancelled: "cancelled",
};

export class NotificationService {
  constructor(private readonly pool: Pool) {}

  private async customerDiscord(
    c: Queryable,
    tenantId: string,
    userId: string,
  ) {
    const row = (
      await c.query<{ discord_user_id: string }>(
        `SELECT discord_user_id FROM discord_account_links
         WHERE tenant_id=$1 AND user_id=$2 AND state='verified'`,
        [tenantId, userId],
      )
    ).rows[0];
    return row?.discord_user_id ?? null;
  }

  /** Builds the one delivery a job stands for, from current records. */
  private async render(job: {
    tenant_id: string;
    kind: NotificationKind;
    subject_id: string;
    detail: Record<string, string>;
  }): Promise<Delivery> {
    const c = this.pool;
    if (
      job.kind.startsWith("application.") ||
      job.kind === "agreement.issued" ||
      job.kind === "staff.role_grant"
    )
      return this.renderRecruitment(job);
    if (
      job.kind === "commission.quote" ||
      job.kind === "commission.milestone"
    ) {
      const r = (
        await c.query<{
          category: string;
          requester_id: string;
          title: string;
        }>(
          "SELECT category,requester_id,title FROM commercial_requests WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, job.subject_id],
        )
      ).rows[0];
      if (!r) return { target: "none", reason: "commission no longer exists" };
      if (job.kind === "commission.quote")
        // To the team; category and link only (no customer details).
        return {
          target: "channel",
          channelKey: "staff:commission-management",
          content: `💬 A customer **${job.detail.decision === "accept" ? "accepted" : "declined"}** the quote for a **${r.category}** commission: ${site()}/staff/commissions/${job.subject_id}`,
        };
      const discordUserId = await this.customerDiscord(
        c,
        job.tenant_id,
        r.requester_id,
      );
      if (!discordUserId)
        return { target: "none", reason: "customer has no linked Discord" };
      return {
        target: "dm",
        discordUserId,
        content: `A milestone was completed on your KUSH commission **${clip(r.title, 120)}**. ${site()}/account/commissions/${job.subject_id}`,
      };
    }
    if (job.kind === "commission.created" || job.kind === "commission.status") {
      const r = (
        await c.query<{
          category: string;
          status: string;
          requester_id: string;
          title: string;
        }>(
          "SELECT category,status,requester_id,title FROM commercial_requests WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, job.subject_id],
        )
      ).rows[0];
      if (!r) return { target: "none", reason: "commission no longer exists" };
      if (job.kind === "commission.created")
        // #staff-chat carries no customer personal data: category + link only.
        return {
          target: "channel",
          channelKey: "staff:staff-chat",
          content: `📝 New **${r.category}** commission enquiry from the website.\nReview it: ${site()}/staff/commissions/${job.subject_id}`,
        };
      const discordUserId = await this.customerDiscord(
        c,
        job.tenant_id,
        r.requester_id,
      );
      if (!discordUserId)
        return { target: "none", reason: "customer has no linked Discord" };
      return {
        target: "dm",
        discordUserId,
        content: `Your KUSH commission **${clip(r.title, 120)}** is now **${commissionLabels[job.detail.status ?? r.status] ?? r.status}**.\n${site()}/account/commissions/${job.subject_id}`,
      };
    }

    const t = (
      await c.query<{
        number: number;
        category: string;
        status: string;
        customer_id: string;
        config: { reportCategories?: string[] };
      }>(
        `SELECT t.number,t.category,t.status,t.customer_id,s.config FROM support_tickets t
         JOIN support_tenants s ON s.id=t.tenant_id WHERE t.tenant_id=$1 AND t.id=$2`,
        [job.tenant_id, job.subject_id],
      )
    ).rows[0];
    if (!t) return { target: "none", reason: "ticket no longer exists" };
    const report = reportCategoriesOf(t.config).includes(t.category);
    const staffLink = `${site()}/staff/tickets/${job.subject_id}`;

    if (job.kind === "ticket.created") {
      if (report)
        return {
          target: "channel",
          channelKey: "staff:moderation-log",
          content: `🚩 New **member report** #${t.number} from the website.\n${staffLink}`,
        };
      // Billing tickets are confidential: no category detail beyond the label.
      return {
        target: "channel",
        channelKey: "staff:ticket-queue",
        content:
          t.category === "billing"
            ? `🔒 New **confidential billing** ticket #${t.number} from the website (managers only).\n${staffLink}`
            : `🎫 New **${t.category}** ticket #${t.number} from the website, waiting to be claimed.\n${staffLink}`,
      };
    }

    if (job.kind === "ticket.message") {
      const m = (
        await c.query<{ content: string; kind: string; author_id: string }>(
          "SELECT content,kind,author_id FROM support_messages WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, job.detail.messageId],
        )
      ).rows[0];
      // Notes never leave the staff dashboard, even if somehow enqueued.
      if (!m || m.kind !== "reply")
        return { target: "none", reason: "not a public reply" };
      const fromCustomer = m.author_id === t.customer_id;
      if (job.detail.audience === "channel") {
        const channel = (
          await c.query<{ channel_id: string }>(
            "SELECT channel_id FROM discord_ticket_channels WHERE tenant_id=$1 AND ticket_id=$2 AND state='active'",
            [job.tenant_id, job.subject_id],
          )
        ).rows[0];
        if (!channel)
          return { target: "none", reason: "ticket has no Discord channel" };
        return {
          target: "ticket_channel",
          channelId: channel.channel_id,
          content: `**${fromCustomer ? "Customer" : "KUSH team"}** (via the website):\n${clip(m.content)}`,
        };
      }
      if (fromCustomer)
        return { target: "none", reason: "customer's own reply" };
      const discordUserId = await this.customerDiscord(
        c,
        job.tenant_id,
        t.customer_id,
      );
      if (!discordUserId)
        return { target: "none", reason: "customer has no linked Discord" };
      return {
        target: "dm",
        discordUserId,
        content: `The KUSH team replied to your ticket **#${t.number}**.\n${site()}/account/support/${job.subject_id}`,
      };
    }

    // ticket.status: tell the customer about changes that matter to them.
    const status = job.detail.status ?? t.status;
    if (!["waiting_for_customer", "resolved", "closed"].includes(status))
      return { target: "none", reason: "status not customer-facing" };
    const discordUserId = await this.customerDiscord(
      c,
      job.tenant_id,
      t.customer_id,
    );
    if (!discordUserId)
      return { target: "none", reason: "customer has no linked Discord" };
    return {
      target: "dm",
      discordUserId,
      content: `Your KUSH ticket **#${t.number}** is now **${ticketLabels[status] ?? status}**.\n${site()}/account/support/${job.subject_id}`,
    };
  }

  private async renderRecruitment(job: {
    tenant_id: string;
    kind: NotificationKind;
    subject_id: string;
    detail: Record<string, string>;
  }): Promise<Delivery> {
    const a = (
      await this.pool.query<{
        number: number;
        status: string;
        discord_user_id: string;
        discord_channel_id: string | null;
        title: string;
      }>(
        `SELECT a.number,a.status,a.discord_user_id,a.discord_channel_id,p.title FROM staff_applications a
         JOIN staff_positions p ON p.id=a.position_id WHERE a.tenant_id=$1 AND a.id=$2`,
        [job.tenant_id, job.subject_id],
      )
    ).rows[0];
    if (!a) return { target: "none", reason: "application no longer exists" };
    const staffLink = `${site()}/staff/applications/${job.subject_id}`;
    const mine = `${site()}/account/applications/${job.subject_id}`;
    // Applicant-facing updates go to their private channel when it exists,
    // otherwise by DM. Exactly one delivery either way.
    const toApplicant = (content: string): Delivery =>
      a.discord_channel_id
        ? {
            target: "ticket_channel",
            channelId: a.discord_channel_id,
            content: `<@${a.discord_user_id}> ${content}`,
          }
        : { target: "dm", discordUserId: a.discord_user_id, content };

    switch (job.kind) {
      case "application.created":
        // No applicant personal data in staff channels: number, role, link.
        return {
          target: "channel",
          channelKey: "staff:staff-chat",
          content: `🧑‍💼 New staff application **#${a.number}** for **${a.title}**. Recruiters can review it: ${staffLink}`,
        };
      case "application.channel":
        if (a.discord_channel_id)
          return { target: "none", reason: "channel already exists" };
        return {
          target: "create_application_channel",
          applicationId: job.subject_id,
          number: a.number,
          applicantDiscordId: a.discord_user_id,
          content: [
            `<@${a.discord_user_id}> thanks for applying to be **${a.title}** at KUSH (application **#${a.number}**).`,
            "This private channel is between you and the KUSH recruitment team. Messages here and on the website are kept together.",
            `Track your application: ${mine}`,
          ].join("\n"),
        };
      case "application.message": {
        const m = (
          await this.pool.query<{
            content: string;
            kind: string;
            from_applicant: boolean;
          }>(
            `SELECT m.content,m.kind,(m.author_id=x.user_id) AS from_applicant FROM staff_application_messages m
             JOIN staff_applications x ON x.id=m.application_id WHERE m.id=$1`,
            [job.detail.messageId],
          )
        ).rows[0];
        if (!m || m.kind !== "message")
          return { target: "none", reason: "not a shared message" };
        if (!a.discord_channel_id) {
          if (m.from_applicant)
            return { target: "none", reason: "no channel yet" };
          return {
            target: "dm",
            discordUserId: a.discord_user_id,
            content: `KUSH recruitment sent you a message about application #${a.number}: ${mine}`,
          };
        }
        return {
          target: "ticket_channel",
          channelId: a.discord_channel_id,
          content: `**${m.from_applicant ? "Applicant" : "KUSH recruitment"}** (via the website):\n${clip(m.content)}`,
        };
      }
      case "agreement.issued":
        return toApplicant(
          `you've been conditionally accepted. 🎉 Please read and sign the KUSH Staff NDA on the website (sign in with this Discord account): ${site()}/account/agreements/${job.detail.agreementId}`,
        );
      case "staff.role_grant":
        return {
          target: "grant_role",
          discordUserId: job.detail.discordUserId ?? a.discord_user_id,
          roleId: job.detail.roleId!,
          reason: `KUSH staff activation (application #${a.number})`,
        };
      default: {
        const words: Record<string, string> = {
          reviewing: "is now being reviewed by the KUSH team",
          more_info:
            "needs a little more information from you. Please reply here or on the website",
          interview:
            "has moved to an interview stage. The team will contact you here",
          conditionally_accepted:
            "has been conditionally accepted. Your NDA will follow shortly",
          nda_signed: "NDA is signed. The team will now confirm your role",
          approved: "has been approved. Your access will be activated shortly",
          activated:
            "is complete. Welcome to the KUSH team! Your staff role has been granted. Staff tools need two-factor authentication on your KUSH account",
          rejected:
            "was not successful this time. Thank you for your interest in KUSH",
          withdrawn: "has been withdrawn",
        };
        const status = job.detail.status ?? a.status;
        const text = words[status];
        if (!text)
          return { target: "none", reason: "status not applicant-facing" };
        return toApplicant(
          `your application **#${a.number}** ${text}. ${mine}`,
        );
      }
    }
  }

  /** Claims due jobs (2-minute lease) and returns what to deliver. */
  async due(tenantId: string, limit = 20) {
    const jobs = await this.pool.query<{
      id: string;
      tenant_id: string;
      kind: NotificationKind;
      subject_id: string;
      detail: Record<string, string>;
      attempts: number;
    }>(
      `UPDATE notification_jobs SET leased_until=now()+interval '2 minutes',attempts=attempts+1
       WHERE id IN (
         SELECT id FROM notification_jobs
         WHERE tenant_id=$1 AND status='pending' AND next_attempt_at<=now()
           AND (leased_until IS NULL OR leased_until<now())
         ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       RETURNING id,tenant_id,kind,subject_id,detail,attempts`,
      [tenantId, limit],
    );
    const out = [];
    for (const job of jobs.rows) {
      try {
        out.push({
          id: job.id,
          kind: job.kind,
          delivery: await this.render(job),
        });
      } catch (error) {
        await this.finish(tenantId, job.id, {
          ok: false,
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "render failed",
        });
      }
    }
    return out;
  }

  async finish(
    tenantId: string,
    jobId: string,
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    if (outcome.ok) {
      await this.pool.query(
        "UPDATE notification_jobs SET status='done',completed_at=now(),leased_until=NULL,last_error=NULL WHERE tenant_id=$1 AND id=$2",
        [tenantId, jobId],
      );
      return;
    }
    // Exponential backoff from 15 s; give up after MAX_ATTEMPTS.
    await this.pool.query(
      `UPDATE notification_jobs SET leased_until=NULL,last_error=$3,
         status=CASE WHEN attempts >= $4 THEN 'failed' ELSE 'pending' END,
         next_attempt_at=now() + make_interval(secs => 15 * power(2, LEAST(attempts, 10)))
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, jobId, outcome.error.slice(0, 500), MAX_ATTEMPTS],
    );
  }
}

export async function registerNotifications(
  app: FastifyInstance,
  { pool }: { pool: Pool },
) {
  const service = new NotificationService(pool);
  const base = "/discord/integration/tenants/:tenantId/notifications";
  const bot = async (request: FastifyRequest) => {
    const secret = request.headers["x-kush-discord-secret"];
    verifyIntegrationSecret(
      typeof secret === "string" ? secret : undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    // The tenant must belong to the guild the bot says it is serving.
    const guild = request.headers["x-kush-discord-guild-id"];
    const { tenantId } = request.params as { tenantId: string };
    const match = await pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, guild],
    );
    if (!match.rowCount) throw new SupportError(404, "Tenant not found");
    return tenantId;
  };
  const tenantParams = {
    type: "object",
    properties: {
      tenantId: { type: "string", format: "uuid" },
      jobId: { type: "string", format: "uuid" },
    },
    required: ["tenantId"],
    additionalProperties: false,
  };
  const finishSchema = z
    .object({ ok: z.boolean(), error: z.string().max(500).optional() })
    .strict();
  const handle = async (
    reply: import("fastify").FastifyReply,
    work: () => Promise<unknown>,
  ) => {
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

  app.get(
    `${base}/jobs`,
    { schema: { params: tenantParams } },
    async (request, reply) =>
      handle(reply, async () => ({
        jobs: await service.due(await bot(request)),
      })),
  );
  app.post(
    `${base}/jobs/:jobId`,
    {
      schema: {
        params: { ...tenantParams, required: ["tenantId", "jobId"] },
        body: z.toJSONSchema(finishSchema, { target: "draft-7", io: "input" }),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const input = finishSchema.parse(request.body);
        await service.finish(
          tenantId,
          (request.params as { jobId: string }).jobId,
          input.ok
            ? { ok: true }
            : { ok: false, error: input.error ?? "unknown" },
        );
        return { recorded: true };
      }),
  );
}
