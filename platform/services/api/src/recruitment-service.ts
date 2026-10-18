import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "@kush/database";
import type { WebSession } from "./account-service.js";
import {
  ACCEPTANCE_STATEMENT,
  STAFF_NDA_BODY,
  STAFF_NDA_KEY,
  STAFF_NDA_TITLE,
  STAFF_NDA_VERSION,
} from "./agreements/staff-nda.js";
import { enqueueNotification } from "./notifications.js";
import { can, demand, type StaffContext } from "./staff-access.js";
import { SupportError } from "./support-service.js";

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const notFound = () => fail(404, "Not found");
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
type Queryable = Pick<PoolClient, "query">;

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "more_info"
  | "interview"
  | "conditionally_accepted"
  | "nda_issued"
  | "nda_signed"
  | "approved"
  | "activated"
  | "rejected"
  | "withdrawn";

/**
 * The onboarding pipeline. Each move names who may make it:
 * "review" = applications.review, "decide" = applications.decide.
 * Issuing the NDA, signing it and activating have their own actions.
 */
const moves: Record<
  string,
  { to: ApplicationStatus; needs: "review" | "decide" }[]
> = {
  submitted: [
    { to: "reviewing", needs: "review" },
    { to: "rejected", needs: "review" },
  ],
  reviewing: [
    { to: "more_info", needs: "review" },
    { to: "interview", needs: "review" },
    { to: "conditionally_accepted", needs: "decide" },
    { to: "rejected", needs: "review" },
  ],
  more_info: [
    { to: "reviewing", needs: "review" },
    { to: "rejected", needs: "review" },
  ],
  interview: [
    { to: "reviewing", needs: "review" },
    { to: "conditionally_accepted", needs: "decide" },
    { to: "rejected", needs: "review" },
  ],
  conditionally_accepted: [{ to: "rejected", needs: "decide" }],
  nda_issued: [{ to: "rejected", needs: "decide" }],
  nda_signed: [{ to: "rejected", needs: "decide" }],
  approved: [{ to: "rejected", needs: "decide" }],
};
/** Owner rule (18 Oct 2026): every staff role above Moderator signs the NDA. */
export const ndaRequiredFor = (staffRole: string) => staffRole !== "moderator";

const FINAL: ApplicationStatus[] = ["activated", "rejected", "withdrawn"];
const NDA_DAYS = 14;
const tenantOf = () =>
  process.env.KUSH_SUPPORT_TENANT_ID ??
  fail(503, "Recruitment is not configured");

export interface ApplicationInput {
  requestId: string;
  positionKey: string;
  preferredName: string;
  email: string;
  experience: string;
  skills: string;
  availability: string;
  motivation: string;
  portfolioUrl: string | null;
}

export class RecruitmentService {
  constructor(private readonly pool: Pool) {}
  #templatesReady: Promise<void> | null = null;

  /**
   * Runs ensureTemplates once (retried after a failure). Called before any
   * use of agreement texts, so the API can start while the database is down
   * and a tampered text still blocks issuing.
   */
  ready() {
    this.#templatesReady ??= this.ensureTemplates().catch((error: unknown) => {
      this.#templatesReady = null;
      throw error;
    });
    return this.#templatesReady;
  }

  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        (error as { code?: string }).code === "23505" &&
        !(error instanceof SupportError)
      )
        fail(409, "You already have an open application for this position");
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(
    c: Queryable,
    actor: string | null,
    action: string,
    tenantId: string,
  ) {
    return c.query(
      "INSERT INTO audit_events(actor_id,action,tenant_id) VALUES($1,$2,$3)",
      [actor, action, tenantId],
    );
  }

  private event(
    c: Queryable,
    applicationId: string,
    actor: string | null,
    from: string | null,
    to: string,
    note?: string,
  ) {
    return c.query(
      "INSERT INTO staff_application_events(application_id,actor_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$5)",
      [applicationId, actor, from, to, note ?? null],
    );
  }

  // --------------------------------------------------------------- templates

  /**
   * Makes sure the bundled NDA version exists. A published version's text
   * can never change silently: if the stored hash differs, startup fails.
   */
  async ensureTemplates() {
    const hash = sha256(STAFF_NDA_BODY);
    const existing = (
      await this.pool.query<{ body_sha256: string }>(
        "SELECT body_sha256 FROM agreement_templates WHERE key=$1 AND version=$2",
        [STAFF_NDA_KEY, STAFF_NDA_VERSION],
      )
    ).rows[0];
    if (existing && existing.body_sha256 !== hash)
      throw new Error(
        `Agreement ${STAFF_NDA_KEY} ${STAFF_NDA_VERSION} text changed after publication; give it a new version`,
      );
    if (!existing)
      await this.pool.query(
        "INSERT INTO agreement_templates(key,version,title,body,body_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [
          STAFF_NDA_KEY,
          STAFF_NDA_VERSION,
          STAFF_NDA_TITLE,
          STAFF_NDA_BODY,
          hash,
        ],
      );
  }

  async templates(staff: StaffContext) {
    demand(staff, "agreements.manage");
    await this.ready();
    return (
      await this.pool.query(
        `SELECT t.id,t.key,t.version,t.title,t.status,t.body_sha256 AS "sha256",t.created_at AS "createdAt",
                (SELECT count(*)::int FROM agreements a WHERE a.template_id=t.id AND a.status='signed') AS "signedCount"
         FROM agreement_templates t ORDER BY t.key,t.created_at DESC`,
      )
    ).rows;
  }

  /** The owner/administrator's explicit approval to use a text for signing. */
  async setTemplateStatus(
    staff: StaffContext,
    templateId: string,
    status: "active" | "retired",
  ) {
    demand(staff, "agreements.manage");
    return this.tx(async (c) => {
      const t = (
        await c.query<{ key: string; status: string }>(
          "SELECT key,status FROM agreement_templates WHERE id=$1 FOR UPDATE",
          [templateId],
        )
      ).rows[0];
      if (!t) notFound();
      if (status === "active") {
        // One active version per agreement type.
        await c.query(
          "UPDATE agreement_templates SET status='retired' WHERE key=$1 AND status='active' AND id<>$2",
          [t!.key, templateId],
        );
      }
      await c.query("UPDATE agreement_templates SET status=$2 WHERE id=$1", [
        templateId,
        status,
      ]);
      await this.audit(
        c,
        staff.userId,
        `agreement.template.${status}`,
        staff.tenantId,
      );
      return { status };
    });
  }

  // --------------------------------------------------------------- positions

  async positions(tenantId = tenantOf()) {
    return (
      await this.pool.query(
        `SELECT key,title,summary,responsibilities,requirements,staff_role AS "staffRole",
                portfolio_required AS "portfolioRequired"
         FROM staff_positions WHERE tenant_id=$1 AND open ORDER BY title`,
        [tenantId],
      )
    ).rows;
  }

  // -------------------------------------------------------------- applicants

  private async discordOf(c: Queryable, tenantId: string, userId: string) {
    const row = (
      await c.query<{ discord_user_id: string }>(
        "SELECT discord_user_id FROM discord_account_links WHERE tenant_id=$1 AND user_id=$2 AND state='verified'",
        [tenantId, userId],
      )
    ).rows[0];
    return (
      row?.discord_user_id ??
      fail(400, "Link your Discord account before applying")
    );
  }

  async apply(session: WebSession, input: ApplicationInput) {
    const tenantId = tenantOf();
    return this.tx(async (c) => {
      const previous = (
        await c.query<{ id: string; number: number }>(
          "SELECT id,number FROM staff_applications WHERE tenant_id=$1 AND user_id=$2 AND request_id=$3",
          [tenantId, session.userId, input.requestId],
        )
      ).rows[0];
      if (previous) return previous;
      const position = (
        await c.query<{
          id: string;
          portfolio_required: boolean;
          title: string;
        }>(
          "SELECT id,portfolio_required,title FROM staff_positions WHERE tenant_id=$1 AND key=$2 AND open",
          [tenantId, input.positionKey],
        )
      ).rows[0];
      if (!position) fail(400, "That position is not open");
      if (position!.portfolio_required && !input.portfolioUrl)
        fail(400, "This position needs a portfolio link");
      const discordUserId = await this.discordOf(c, tenantId, session.userId);
      const number = (
        await c.query<{ n: number }>(
          "UPDATE support_tenants SET next_application_number=next_application_number+1 WHERE id=$1 RETURNING next_application_number-1 AS n",
          [tenantId],
        )
      ).rows[0]!.n;
      const created = (
        await c.query<{ id: string; number: number }>(
          `INSERT INTO staff_applications(tenant_id,number,user_id,position_id,discord_user_id,preferred_name,email,
             experience,skills,availability,motivation,portfolio_url,request_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,number`,
          [
            tenantId,
            number,
            session.userId,
            position!.id,
            discordUserId,
            input.preferredName,
            input.email,
            input.experience,
            input.skills,
            input.availability,
            input.motivation,
            input.portfolioUrl,
            input.requestId,
          ],
        )
      ).rows[0]!;
      await this.event(c, created.id, session.userId, null, "submitted");
      await this.audit(
        c,
        session.userId,
        "recruitment.application.submitted",
        tenantId,
      );
      // Announce to recruiters, and open the private Discord application channel.
      await enqueueNotification(
        c,
        tenantId,
        "application.created",
        created.id,
        {},
        `application.created:${created.id}`,
      );
      await enqueueNotification(
        c,
        tenantId,
        "application.channel",
        created.id,
        {},
        `application.channel:${created.id}`,
      );
      return created;
    });
  }

  /** What the applicant sees: no review notes, no reviewer identities. */
  private applicantView = `a.id,a.number,a.status,a.preferred_name AS "preferredName",a.email,a.experience,a.skills,
    a.availability,a.motivation,a.portfolio_url AS "portfolioUrl",a.version,a.created_at AS "createdAt",
    a.updated_at AS "updatedAt",a.discord_channel_id AS "discordChannelId",p.title AS "positionTitle",p.key AS "positionKey"`;

  async mine(session: WebSession) {
    return (
      await this.pool.query(
        `SELECT ${this.applicantView} FROM staff_applications a JOIN staff_positions p ON p.id=a.position_id
         WHERE a.tenant_id=$1 AND a.user_id=$2 ORDER BY a.created_at DESC`,
        [tenantOf(), session.userId],
      )
    ).rows;
  }

  async mineOne(session: WebSession, id: string) {
    const tenantId = tenantOf();
    const application = (
      await this.pool.query(
        `SELECT ${this.applicantView} FROM staff_applications a JOIN staff_positions p ON p.id=a.position_id
         WHERE a.tenant_id=$1 AND a.user_id=$2 AND a.id=$3`,
        [tenantId, session.userId, id],
      )
    ).rows[0];
    if (!application) notFound();
    const [messages, events, agreement] = await Promise.all([
      this.pool.query(
        `SELECT m.id,m.content,m.created_at AS "createdAt",(m.author_id=$2) AS "fromYou"
         FROM staff_application_messages m WHERE m.application_id=$1 AND m.kind='message' ORDER BY m.created_at`,
        [id, session.userId],
      ),
      this.pool.query(
        `SELECT to_status AS status,created_at AS "createdAt" FROM staff_application_events
         WHERE application_id=$1 ORDER BY created_at`,
        [id],
      ),
      this.pool.query(
        `SELECT g.id,g.status,g.expires_at AS "expiresAt",g.signed_at AS "signedAt"
         FROM agreements g WHERE g.application_id=$1 AND g.user_id=$2 ORDER BY g.issued_at DESC LIMIT 1`,
        [id, session.userId],
      ),
    ]);
    return {
      application,
      messages: messages.rows,
      events: events.rows,
      agreement: agreement.rows[0] ?? null,
    };
  }

  /** Messages from the applicant or reviewers (website or Discord). */
  async addMessage(
    applicationId: string,
    author: { userId: string; isReviewer: boolean },
    input: {
      content: string;
      requestId: string;
      kind?: "message" | "note";
      source: "website" | "discord";
    },
  ) {
    const kind = input.kind ?? "message";
    if (kind === "note" && !author.isReviewer)
      fail(403, "Only reviewers can add notes");
    return this.tx(async (c) => {
      const app = (
        await c.query<{
          tenant_id: string;
          user_id: string;
          status: ApplicationStatus;
        }>(
          "SELECT tenant_id,user_id,status FROM staff_applications WHERE id=$1 FOR UPDATE",
          [applicationId],
        )
      ).rows[0];
      if (!app || (!author.isReviewer && app.user_id !== author.userId))
        notFound();
      if (FINAL.includes(app!.status) && !author.isReviewer)
        fail(409, "This application is closed");
      const inserted = await c.query<{ id: string }>(
        `INSERT INTO staff_application_messages(application_id,author_id,kind,content,request_id) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (application_id,author_id,request_id) DO NOTHING RETURNING id`,
        [applicationId, author.userId, kind, input.content, input.requestId],
      );
      const messageId = inserted.rows[0]?.id;
      // Website messages are mirrored into the Discord channel (Discord ones
      // are already there). Notes never leave the dashboard.
      if (messageId && kind === "message" && input.source === "website")
        await enqueueNotification(
          c,
          app!.tenant_id,
          "application.message",
          applicationId,
          { messageId },
          `application.message:${messageId}`,
        );
      // An applicant answering a request for more information moves it back.
      if (messageId && !author.isReviewer && app!.status === "more_info") {
        await c.query(
          "UPDATE staff_applications SET status='reviewing',version=version+1,updated_at=now() WHERE id=$1",
          [applicationId],
        );
        await this.event(
          c,
          applicationId,
          author.userId,
          "more_info",
          "reviewing",
          "Applicant replied",
        );
      } else if (messageId) {
        await c.query(
          "UPDATE staff_applications SET updated_at=now() WHERE id=$1",
          [applicationId],
        );
      }
      return { recorded: Boolean(messageId) };
    });
  }

  async withdraw(session: WebSession, id: string) {
    return this.tx(async (c) => {
      const app = (
        await c.query<{ tenant_id: string; status: ApplicationStatus }>(
          "SELECT tenant_id,status FROM staff_applications WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, session.userId],
        )
      ).rows[0];
      if (!app) notFound();
      if (FINAL.includes(app!.status))
        fail(409, "This application is already closed");
      await c.query(
        "UPDATE staff_applications SET status='withdrawn',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await c.query(
        "UPDATE agreements SET status='voided',voided_reason='Application withdrawn' WHERE application_id=$1 AND status='issued'",
        [id],
      );
      await this.event(c, id, session.userId, app!.status, "withdrawn");
      await this.audit(
        c,
        session.userId,
        "recruitment.application.withdrawn",
        app!.tenant_id,
      );
      await enqueueNotification(
        c,
        app!.tenant_id,
        "application.status",
        id,
        { status: "withdrawn" },
        `application.status:${id}:withdrawn`,
      );
      return { status: "withdrawn" };
    });
  }

  // ------------------------------------------------------------------ staff

  async list(staff: StaffContext, filter: "open" | "all") {
    demand(staff, "applications.review");
    return (
      await this.pool.query(
        `SELECT a.id,a.number,a.status,a.preferred_name AS "preferredName",a.created_at AS "createdAt",
                a.updated_at AS "updatedAt",p.title AS "positionTitle"
         FROM staff_applications a JOIN staff_positions p ON p.id=a.position_id
         WHERE a.tenant_id=$1 ${filter === "open" ? "AND a.status NOT IN ('activated','rejected','withdrawn')" : ""}
         ORDER BY a.updated_at DESC LIMIT 200`,
        [staff.tenantId],
      )
    ).rows;
  }

  async detail(staff: StaffContext, id: string) {
    demand(staff, "applications.review");
    const application = (
      await this.pool.query(
        `SELECT ${this.applicantView},a.review_note AS "reviewNote",a.discord_user_id AS "discordUserId",
                a.approved_staff_role AS "approvedStaffRole",p.staff_role AS "positionStaffRole",
                p.discord_role_id AS "positionDiscordRoleId"
         FROM staff_applications a JOIN staff_positions p ON p.id=a.position_id
         WHERE a.tenant_id=$1 AND a.id=$2`,
        [staff.tenantId, id],
      )
    ).rows[0];
    if (!application) notFound();
    const [messages, events, agreements] = await Promise.all([
      this.pool.query(
        `SELECT m.id,m.kind,m.content,m.created_at AS "createdAt",(m.author_id=a.user_id) AS "fromApplicant",
                COALESCE(u.display_name,i.username,'KUSH team') AS "authorName"
         FROM staff_application_messages m JOIN staff_applications a ON a.id=m.application_id
         JOIN users u ON u.id=m.author_id LEFT JOIN user_identities i ON i.user_id=m.author_id AND i.provider='discord'
         WHERE m.application_id=$1 ORDER BY m.created_at`,
        [id],
      ),
      this.pool.query(
        `SELECT e.from_status AS "from",e.to_status AS "to",e.note,e.created_at AS "createdAt",
                COALESCE(u.display_name,i.username) AS "actorName"
         FROM staff_application_events e LEFT JOIN users u ON u.id=e.actor_id
         LEFT JOIN user_identities i ON i.user_id=e.actor_id AND i.provider='discord'
         WHERE e.application_id=$1 ORDER BY e.created_at`,
        [id],
      ),
      can(staff, "agreements.manage")
        ? this.pool.query(
            `SELECT g.id,g.status,g.issued_at AS "issuedAt",g.expires_at AS "expiresAt",g.signed_at AS "signedAt",
                    g.legal_name AS "legalName",t.version
             FROM agreements g JOIN agreement_templates t ON t.id=g.template_id WHERE g.application_id=$1 ORDER BY g.issued_at DESC`,
            [id],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const status = application.status as ApplicationStatus;
    const decide = can(staff, "applications.decide");
    return {
      application,
      messages: messages.rows,
      events: events.rows,
      agreements: agreements.rows,
      actions: {
        moves: (moves[status] ?? [])
          .filter((m) => m.needs === "review" || decide)
          .map((m) => m.to),
        issueNda: decide && status === "conditionally_accepted",
        approve:
          decide &&
          (status === "nda_signed" ||
            ((status === "conditionally_accepted" || status === "nda_issued") &&
              !ndaRequiredFor(String(application.positionStaffRole)))),
        // Roles allowed at approval: without a signed NDA, Moderator only.
        approvableRoles:
          status === "nda_signed"
            ? ["support", "developer", "moderator", "manager", "administrator"]
            : ["moderator"],
        activate: decide && status === "approved",
      },
    };
  }

  async transition(
    staff: StaffContext,
    id: string,
    input: {
      expectedVersion: number;
      status: ApplicationStatus;
      note?: string | undefined;
    },
  ) {
    demand(staff, "applications.review");
    return this.tx(async (c) => {
      const app = await this.lock(c, staff, id, input.expectedVersion);
      const move = (moves[app.status] ?? []).find((m) => m.to === input.status);
      if (!move)
        fail(409, "That change is not allowed from the current status");
      if (move!.needs === "decide") demand(staff, "applications.decide");
      if (input.status === "rejected")
        await c.query(
          "UPDATE agreements SET status='voided',voided_reason='Application rejected' WHERE application_id=$1 AND status='issued'",
          [id],
        );
      await this.setStatus(c, staff, id, app.status, input.status, input.note);
      return { status: input.status };
    });
  }

  private async lock(
    c: PoolClient,
    staff: StaffContext,
    id: string,
    expectedVersion: number,
  ) {
    const app = (
      await c.query<{
        status: ApplicationStatus;
        version: number;
        user_id: string;
        discord_user_id: string;
        position_id: string;
      }>(
        "SELECT status,version,user_id,discord_user_id,position_id FROM staff_applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [staff.tenantId, id],
      )
    ).rows[0];
    if (!app) notFound();
    if (app!.version !== expectedVersion)
      fail(409, "Application changed; reload before retrying");
    return app!;
  }

  private async setStatus(
    c: PoolClient,
    staff: StaffContext,
    id: string,
    from: ApplicationStatus,
    to: ApplicationStatus,
    note?: string,
    extra = "",
  ) {
    await c.query(
      `UPDATE staff_applications SET status=$2,version=version+1,updated_at=now(),decided_by=$3${extra} WHERE id=$1`,
      [id, to, staff.userId],
    );
    await this.event(c, id, staff.userId, from, to, note);
    await this.audit(
      c,
      staff.userId,
      `recruitment.application.${to}`,
      staff.tenantId,
    );
    await enqueueNotification(
      c,
      staff.tenantId,
      "application.status",
      id,
      { status: to },
      `application.status:${id}:${to}:${Date.now()}`,
    );
  }

  async staffMessage(
    staff: StaffContext,
    id: string,
    input: { content: string; requestId: string; kind: "message" | "note" },
  ) {
    demand(staff, "applications.review");
    const exists = await this.pool.query(
      "SELECT 1 FROM staff_applications WHERE tenant_id=$1 AND id=$2",
      [staff.tenantId, id],
    );
    if (!exists.rowCount) notFound();
    const result = await this.addMessage(
      id,
      { userId: staff.userId, isReviewer: true },
      { ...input, source: "website" },
    );
    await this.audit(
      this.pool,
      staff.userId,
      `recruitment.application.${input.kind}`,
      staff.tenantId,
    );
    return result;
  }

  async setReviewNote(staff: StaffContext, id: string, note: string | null) {
    demand(staff, "applications.review");
    const updated = await this.pool.query(
      "UPDATE staff_applications SET review_note=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [staff.tenantId, id, note],
    );
    if (!updated.rowCount) notFound();
    await this.audit(
      this.pool,
      staff.userId,
      "recruitment.application.review_note",
      staff.tenantId,
    );
  }

  /** Conditional acceptance -> NDA issued (needs an ACTIVE template). */
  async issueNda(staff: StaffContext, id: string, expectedVersion: number) {
    demand(staff, "applications.decide");
    await this.ready();
    return this.tx(async (c) => {
      const app = await this.lock(c, staff, id, expectedVersion);
      if (app.status !== "conditionally_accepted")
        fail(409, "Conditionally accept the application first");
      const template = (
        await c.query<{ id: string }>(
          "SELECT id FROM agreement_templates WHERE key=$1 AND status='active'",
          [STAFF_NDA_KEY],
        )
      ).rows[0];
      if (!template)
        fail(
          409,
          "No NDA version is active yet. An administrator must review and activate one under Agreements.",
        );
      const agreement = (
        await c.query<{ id: string }>(
          `INSERT INTO agreements(tenant_id,template_id,user_id,application_id,issued_by,expires_at)
           VALUES($1,$2,$3,$4,$5,now() + make_interval(days => $6)) RETURNING id`,
          [
            staff.tenantId,
            template!.id,
            app.user_id,
            id,
            staff.userId,
            NDA_DAYS,
          ],
        )
      ).rows[0]!;
      await this.setStatus(c, staff, id, app.status, "nda_issued");
      await enqueueNotification(
        c,
        staff.tenantId,
        "agreement.issued",
        id,
        { agreementId: agreement.id },
        `agreement.issued:${agreement.id}`,
      );
      return { agreementId: agreement.id };
    });
  }

  /** Identity and role approval: an administrator confirms the final role. */
  async approve(
    staff: StaffContext,
    id: string,
    input: {
      expectedVersion: number;
      staffRole: string;
      note?: string | undefined;
    },
  ) {
    demand(staff, "applications.decide");
    return this.tx(async (c) => {
      const app = await this.lock(c, staff, id, input.expectedVersion);
      // Owner rule: Moderators do not need the NDA; every role above does.
      const ndaRequired = ndaRequiredFor(input.staffRole);
      if (ndaRequired) {
        if (app.status !== "nda_signed")
          fail(409, "Roles above Moderator need a signed NDA first");
        const signed = await c.query(
          "SELECT 1 FROM agreements WHERE application_id=$1 AND status='signed'",
          [id],
        );
        if (!signed.rowCount) fail(409, "No signed NDA on record");
      } else if (
        !["conditionally_accepted", "nda_issued", "nda_signed"].includes(
          app.status,
        )
      )
        fail(409, "Conditionally accept the application first");
      await c.query(
        "UPDATE staff_applications SET approved_staff_role=$2 WHERE id=$1",
        [id, input.staffRole],
      );
      await this.setStatus(c, staff, id, app.status, "approved", input.note);
      return { status: "approved" };
    });
  }

  /**
   * Activation: the explicit administrator action that grants the Discord
   * role (via the bot). Dashboard access then follows from that live role.
   */
  async activate(staff: StaffContext, id: string, expectedVersion: number) {
    demand(staff, "applications.decide");
    return this.tx(async (c) => {
      const app = await this.lock(c, staff, id, expectedVersion);
      if (app.status !== "approved")
        fail(409, "Approve the identity and role first");
      const role = (
        await c.query<{
          approved_staff_role: string;
          discord_role_id: string | null;
        }>(
          `SELECT a.approved_staff_role,
                  COALESCE(
                    (SELECT p2.discord_role_id FROM staff_positions p2 WHERE p2.tenant_id=a.tenant_id AND p2.staff_role=a.approved_staff_role AND p2.discord_role_id IS NOT NULL ORDER BY (p2.id=a.position_id) DESC LIMIT 1),
                    (SELECT m.discord_role_id FROM staff_role_mappings m WHERE m.tenant_id=a.tenant_id AND m.staff_role=a.approved_staff_role ORDER BY m.created_at LIMIT 1)
                  ) AS discord_role_id
           FROM staff_applications a WHERE a.id=$1`,
          [id],
        )
      ).rows[0]!;
      if (!role.discord_role_id)
        fail(409, "No Discord role is mapped to that staff role");
      await this.setStatus(c, staff, id, app.status, "activated");
      // On the team from now on (the roster refreshes from live Discord roles
      // whenever they use the staff dashboard).
      await c.query(
        `INSERT INTO staff_members(tenant_id,user_id,discord_user_id,roles,application_id) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id,user_id) DO UPDATE SET discord_user_id=EXCLUDED.discord_user_id,
           roles=EXCLUDED.roles,application_id=EXCLUDED.application_id,last_verified_at=now(),
           offboarded_at=NULL,offboarded_reason=NULL,offboarded_by_discord_id=NULL`,
        [
          staff.tenantId,
          app.user_id,
          app.discord_user_id,
          [role.approved_staff_role],
          id,
        ],
      );
      await enqueueNotification(
        c,
        staff.tenantId,
        "staff.role_grant",
        id,
        { discordUserId: app.discord_user_id, roleId: role.discord_role_id! },
        `staff.role_grant:${id}`,
      );
      return { status: "activated", staffRole: role.approved_staff_role };
    });
  }

  // ------------------------------------------------------------- agreements

  async agreementForSigner(session: WebSession, agreementId: string) {
    const row = (
      await this.pool.query(
        `SELECT g.id,g.status,g.issued_at AS "issuedAt",g.expires_at AS "expiresAt",g.signed_at AS "signedAt",
                g.legal_name AS "legalName",g.email,g.signature,t.title,t.version,t.body,t.body_sha256 AS "sha256",
                (g.status='issued' AND g.expires_at < now()) AS expired
         FROM agreements g JOIN agreement_templates t ON t.id=g.template_id
         WHERE g.tenant_id=$1 AND g.id=$2 AND g.user_id=$3`,
        [tenantOf(), agreementId, session.userId],
      )
    ).rows[0];
    return row
      ? { ...row, acceptanceStatement: ACCEPTANCE_STATEMENT }
      : notFound();
  }

  /** `signer.via`: the website form or the Discord modal (same record). */
  async sign(
    signer: { userId: string; via?: "website" | "discord" },
    agreementId: string,
    input: {
      legalName: string;
      email: string;
      signature: string;
      accept: true;
      statement: string;
      bodySha256: string;
      ipHash: string | null;
      userAgent: string;
    },
  ) {
    const tenantId = tenantOf();
    if (input.statement !== ACCEPTANCE_STATEMENT)
      fail(400, "The acceptance statement does not match");
    if (
      input.signature.trim().toLowerCase() !==
      input.legalName.trim().toLowerCase()
    )
      fail(400, "Type your full legal name exactly as your signature");
    return this.tx(async (c) => {
      const g = (
        await c.query<{
          status: string;
          expired: boolean;
          application_id: string | null;
          sha: string;
        }>(
          `SELECT g.status,(g.expires_at < now()) AS expired,g.application_id,t.body_sha256 AS sha
           FROM agreements g JOIN agreement_templates t ON t.id=g.template_id
           WHERE g.tenant_id=$1 AND g.id=$2 AND g.user_id=$3 FOR UPDATE OF g`,
          [tenantId, agreementId, signer.userId],
        )
      ).rows[0];
      if (!g) notFound();
      if (g!.status !== "issued")
        fail(409, "This agreement is not open for signing");
      if (g!.expired)
        fail(409, "This agreement has expired. Ask KUSH to issue a new one.");
      // The signer must have been shown exactly the text being recorded.
      if (input.bodySha256 !== g!.sha)
        fail(409, "The agreement text changed; reload and read it again");
      await c.query(
        `UPDATE agreements SET status='signed',signed_at=now(),legal_name=$2,email=$3,signature=$4,
           accepted_statement=$5,signed_body_sha256=$6,signer_ip_hash=$7,signer_user_agent=$8,signed_via=$9 WHERE id=$1`,
        [
          agreementId,
          input.legalName.trim(),
          input.email.trim(),
          input.signature.trim(),
          ACCEPTANCE_STATEMENT,
          g!.sha,
          input.ipHash,
          input.userAgent.slice(0, 300),
          signer.via ?? "website",
        ],
      );
      await this.audit(
        c,
        signer.userId,
        `agreement.signed.${signer.via ?? "website"}`,
        tenantId,
      );
      if (g!.application_id) {
        const app = (
          await c.query<{ status: string }>(
            "SELECT status FROM staff_applications WHERE id=$1 FOR UPDATE",
            [g!.application_id],
          )
        ).rows[0];
        if (app?.status === "nda_issued") {
          await c.query(
            "UPDATE staff_applications SET status='nda_signed',version=version+1,updated_at=now() WHERE id=$1",
            [g!.application_id],
          );
          await this.event(
            c,
            g!.application_id,
            signer.userId,
            "nda_issued",
            "nda_signed",
          );
          await enqueueNotification(
            c,
            tenantId,
            "application.status",
            g!.application_id,
            { status: "nda_signed" },
            `application.status:${g!.application_id}:nda_signed`,
          );
        }
      }
      return { signed: true };
    });
  }

  async agreementsForStaff(staff: StaffContext) {
    demand(staff, "agreements.manage");
    return (
      await this.pool.query(
        `SELECT g.id,g.status,g.issued_at AS "issuedAt",g.signed_at AS "signedAt",g.expires_at AS "expiresAt",
                g.legal_name AS "legalName",t.title,t.version,a.number AS "applicationNumber",
                COALESCE(u.display_name,i.username) AS "accountName"
         FROM agreements g JOIN agreement_templates t ON t.id=g.template_id
         JOIN users u ON u.id=g.user_id LEFT JOIN user_identities i ON i.user_id=g.user_id AND i.provider='discord'
         LEFT JOIN staff_applications a ON a.id=g.application_id
         WHERE g.tenant_id=$1 ORDER BY g.issued_at DESC LIMIT 200`,
        [staff.tenantId],
      )
    ).rows;
  }

  /** Full record for a PDF: the signer themselves, or agreements.manage. */
  async agreementRecord(
    viewer: { userId: string; staff?: StaffContext },
    agreementId: string,
  ) {
    // Staff route: the permission is checked before anything is looked up.
    if (viewer.staff) demand(viewer.staff, "agreements.manage");
    const row = (
      await this.pool.query<{
        id: string;
        status: string;
        user_id: string;
        issued_at: Date;
        signed_at: Date | null;
        expires_at: Date;
        legal_name: string | null;
        email: string | null;
        signature: string | null;
        accepted_statement: string | null;
        signed_body_sha256: string | null;
        signer_ip_hash: string | null;
        signer_user_agent: string | null;
        title: string;
        version: string;
        body: string;
        body_sha256: string;
      }>(
        `SELECT g.*,t.title,t.version,t.body,t.body_sha256 FROM agreements g JOIN agreement_templates t ON t.id=g.template_id
         WHERE g.tenant_id=$1 AND g.id=$2`,
        [tenantOf(), agreementId],
      )
    ).rows[0];
    if (!row) notFound();
    const allowed =
      row!.user_id === viewer.userId ||
      (viewer.staff && can(viewer.staff, "agreements.manage"));
    if (!allowed) notFound();
    if (viewer.staff && row!.user_id !== viewer.userId)
      await this.audit(
        this.pool,
        viewer.userId,
        "agreement.pdf.viewed",
        viewer.staff.tenantId,
      );
    return row!;
  }
}
