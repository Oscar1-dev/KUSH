import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import { agreementPdf } from "./agreements/pdf.js";
import type { WebHelpers } from "./accounts.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { RecruitmentService } from "./recruitment-service.js";
import { ACCEPTANCE_STATEMENT } from "./agreements/staff-nda.js";
import { permissionsFor } from "./staff-access.js";
import { SupportError } from "./support-service.js";
import type { StaffHelpers } from "./web-staff.js";

const uuid = (name: string) => ({
  type: "object",
  properties: { [name]: { type: "string", format: "uuid" } },
  required: [name],
  additionalProperties: false,
});
const statuses = [
  "reviewing",
  "more_info",
  "interview",
  "conditionally_accepted",
  "rejected",
] as const;

/**
 * Staff recruitment and NDA routes.
 * - /web/careers, /web/recruitment, /web/agreements: website (applicants)
 * - /web/staff/applications, /web/staff/agreements: staff dashboard
 * - /discord/integration/.../applications: the bot (channel + mirroring)
 */
export async function registerRecruitment(
  app: FastifyInstance,
  { pool, web, staff }: { pool: Pool; web: WebHelpers; staff: StaffHelpers },
) {
  const service = new RecruitmentService(pool);
  // Best effort at startup; failures surface when agreements are used.
  service
    .ready()
    .catch((error: unknown) =>
      app.log.error(
        { error: error instanceof Error ? error.message : "unknown" },
        "Agreement templates not ready",
      ),
    );
  const { signedIn, body, website, handle } = web;
  const { asStaff, access } = staff;
  const params = <T>(request: FastifyRequest) => request.params as T;
  const sendPdf = async (
    reply: FastifyReply,
    record: Parameters<typeof agreementPdf>[0],
  ) =>
    reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        `attachment; filename="kush-agreement-${record.id}.pdf"`,
      )
      .send(Buffer.from(await agreementPdf(record)));

  const applySchema = z
    .object({
      requestId: z.uuid(),
      positionKey: z.string().regex(/^[a-z0-9-]{2,40}$/),
      preferredName: z.string().trim().min(1).max(80),
      email: z.email().max(254),
      experience: z.string().trim().min(20).max(5000),
      skills: z.string().trim().min(5).max(3000),
      availability: z.string().trim().min(2).max(500),
      motivation: z.string().trim().min(20).max(3000),
      portfolioUrl: z.url().max(500).nullable(),
    })
    .strict();
  const messageSchema = z
    .object({
      requestId: z.uuid(),
      content: z.string().trim().min(1).max(5000),
    })
    .strict();
  const staffMessageSchema = messageSchema
    .extend({ kind: z.enum(["message", "note"]) })
    .strict();
  const versionSchema = z
    .object({ expectedVersion: z.number().int().positive() })
    .strict();
  const transitionSchema = versionSchema
    .extend({
      status: z.enum(statuses),
      note: z.string().trim().max(2000).optional(),
    })
    .strict();
  const approveSchema = versionSchema
    .extend({
      staffRole: z.enum([
        "support",
        "developer",
        "moderator",
        "manager",
        "administrator",
      ]),
      note: z.string().trim().max(2000).optional(),
    })
    .strict();
  const noteSchema = z
    .object({ reviewNote: z.string().trim().max(5000).nullable() })
    .strict();
  const signSchema = z
    .object({
      legalName: z.string().trim().min(2).max(120),
      email: z.email().max(254),
      signature: z.string().trim().min(2).max(120),
      accept: z.literal(true),
      statement: z.string().max(400),
      bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict();
  const templateSchema = z
    .object({ status: z.enum(["active", "retired"]) })
    .strict();

  // ---------------------------------------------------------------- public

  app.get("/web/careers/positions", async (request, reply) =>
    handle(reply, async () => {
      website(request);
      return { positions: await service.positions() };
    }),
  );

  // ------------------------------------------------------------- applicants

  app.get(
    "/web/recruitment/applications",
    signedIn(async (session) => ({
      applications: await service.mine(session),
    })),
  );
  app.post(
    "/web/recruitment/applications",
    { schema: { body: body(applySchema) } },
    signedIn(async (session, request) => ({
      application: await service.apply(
        session,
        applySchema.parse(request.body),
      ),
    })),
  );
  app.get(
    "/web/recruitment/applications/:id",
    { schema: { params: uuid("id") } },
    signedIn((session, request) =>
      service.mineOne(session, params<{ id: string }>(request).id),
    ),
  );
  app.post(
    "/web/recruitment/applications/:id/messages",
    { schema: { params: uuid("id"), body: body(messageSchema) } },
    signedIn((session, request) =>
      service.addMessage(
        params<{ id: string }>(request).id,
        { userId: session.userId, isReviewer: false },
        { ...messageSchema.parse(request.body), source: "website" },
      ),
    ),
  );
  app.post(
    "/web/recruitment/applications/:id/withdraw",
    { schema: { params: uuid("id") } },
    signedIn((session, request) =>
      service.withdraw(session, params<{ id: string }>(request).id),
    ),
  );

  app.get(
    "/web/agreements/:id",
    { schema: { params: uuid("id") } },
    signedIn((session, request) =>
      service.agreementForSigner(session, params<{ id: string }>(request).id),
    ),
  );
  app.post(
    "/web/agreements/:id/sign",
    { schema: { params: uuid("id"), body: body(signSchema) } },
    signedIn((session, request) => {
      const input = signSchema.parse(request.body);
      const ip = request.headers["x-kush-visitor-ip"];
      return service.sign(session, params<{ id: string }>(request).id, {
        ...input,
        // Only a hash of the visitor's address is kept (audit, not tracking).
        ipHash:
          typeof ip === "string" && ip && ip !== "direct"
            ? createHash("sha256").update(`kush-ip:${ip}`).digest("hex")
            : null,
        userAgent: String(request.headers["x-kush-visitor-agent"] ?? ""),
      });
    }),
  );
  app.get(
    "/web/agreements/:id/pdf",
    { schema: { params: uuid("id") } },
    async (request, reply) =>
      signedIn(async (session) =>
        sendPdf(
          reply,
          await service.agreementRecord(
            { userId: session.userId },
            params<{ id: string }>(request).id,
          ),
        ),
      )(request, reply),
  );

  // ----------------------------------------------------------------- staff

  app.get(
    "/web/staff/applications",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { filter: { type: "string", enum: ["open", "all"] } },
          additionalProperties: false,
        },
      },
    },
    asStaff(async (ctx, request) => ({
      applications: await service.list(
        ctx,
        (request.query as { filter?: "open" | "all" }).filter ?? "open",
      ),
    })),
  );
  app.get(
    "/web/staff/applications/:id",
    { schema: { params: uuid("id") } },
    asStaff((ctx, request) =>
      service.detail(ctx, params<{ id: string }>(request).id),
    ),
  );
  app.post(
    "/web/staff/applications/:id/status",
    { schema: { params: uuid("id"), body: body(transitionSchema) } },
    asStaff((ctx, request) =>
      service.transition(
        ctx,
        params<{ id: string }>(request).id,
        transitionSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    "/web/staff/applications/:id/messages",
    { schema: { params: uuid("id"), body: body(staffMessageSchema) } },
    asStaff((ctx, request) =>
      service.staffMessage(
        ctx,
        params<{ id: string }>(request).id,
        staffMessageSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    "/web/staff/applications/:id/review-note",
    { schema: { params: uuid("id"), body: body(noteSchema) } },
    asStaff(async (ctx, request) => {
      await service.setReviewNote(
        ctx,
        params<{ id: string }>(request).id,
        noteSchema.parse(request.body).reviewNote,
      );
      return { saved: true };
    }),
  );
  app.post(
    "/web/staff/applications/:id/issue-nda",
    { schema: { params: uuid("id"), body: body(versionSchema) } },
    asStaff((ctx, request) =>
      service.issueNda(
        ctx,
        params<{ id: string }>(request).id,
        versionSchema.parse(request.body).expectedVersion,
      ),
    ),
  );
  app.post(
    "/web/staff/applications/:id/approve",
    { schema: { params: uuid("id"), body: body(approveSchema) } },
    asStaff((ctx, request) =>
      service.approve(
        ctx,
        params<{ id: string }>(request).id,
        approveSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    "/web/staff/applications/:id/activate",
    { schema: { params: uuid("id"), body: body(versionSchema) } },
    asStaff((ctx, request) =>
      service.activate(
        ctx,
        params<{ id: string }>(request).id,
        versionSchema.parse(request.body).expectedVersion,
      ),
    ),
  );

  app.get(
    "/web/staff/agreements",
    asStaff(async (ctx) => ({
      agreements: await service.agreementsForStaff(ctx),
    })),
  );
  app.get(
    "/web/staff/agreement-templates",
    asStaff(async (ctx) => ({ templates: await service.templates(ctx) })),
  );
  app.post(
    "/web/staff/agreement-templates/:id/status",
    { schema: { params: uuid("id"), body: body(templateSchema) } },
    asStaff((ctx, request) =>
      service.setTemplateStatus(
        ctx,
        params<{ id: string }>(request).id,
        templateSchema.parse(request.body).status,
      ),
    ),
  );
  app.get(
    "/web/staff/agreements/:id/pdf",
    { schema: { params: uuid("id") } },
    async (request, reply) =>
      asStaff(async (ctx) =>
        sendPdf(
          reply,
          await service.agreementRecord(
            { userId: ctx.userId, staff: ctx },
            params<{ id: string }>(request).id,
          ),
        ),
      )(request, reply),
  );

  // ------------------------------------------------------------------- bot

  const base = "/discord/integration/tenants/:tenantId";
  const bot = async (request: FastifyRequest) => {
    const secret = request.headers["x-kush-discord-secret"];
    verifyIntegrationSecret(
      typeof secret === "string" ? secret : undefined,
      process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    );
    const { tenantId } = request.params as { tenantId: string };
    const ok = await pool.query(
      "SELECT 1 FROM support_tenants WHERE id=$1 AND guild_id=$2",
      [tenantId, request.headers["x-kush-discord-guild-id"]],
    );
    if (!ok.rowCount) throw new SupportError(404, "Tenant not found");
    return tenantId;
  };
  const tenantParams = (extra: Record<string, object>) => ({
    type: "object",
    properties: { tenantId: { type: "string", format: "uuid" }, ...extra },
    required: ["tenantId", ...Object.keys(extra)],
    additionalProperties: false,
  });
  const snowflake = { type: "string", pattern: "^[0-9]{17,20}$" };

  app.post(
    `${base}/applications/:id/channel`,
    {
      schema: {
        params: tenantParams({ id: { type: "string", format: "uuid" } }),
        body: body(
          z.object({ channelId: z.string().regex(/^[0-9]{17,20}$/) }).strict(),
        ),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const { channelId } = request.body as { channelId: string };
        await pool.query(
          "UPDATE staff_applications SET discord_channel_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND discord_channel_id IS NULL",
          [tenantId, params<{ id: string }>(request).id, channelId],
        );
        return { recorded: true };
      }),
  );

  // The NDA signed from Discord: the clicker must be the agreement's owner
  // (verified Discord link). Same record and checks as the website.
  const discordSignSchema = z
    .object({
      discordUserId: z.string().regex(/^[0-9]{17,20}$/),
      legalName: z.string().trim().min(2).max(120),
      email: z.email().max(254),
      signature: z.string().trim().min(2).max(120),
      confirmation: z.string().trim().max(40),
    })
    .strict();
  app.post(
    `${base}/agreements/:id/sign`,
    {
      schema: {
        params: tenantParams({ id: { type: "string", format: "uuid" } }),
        body: body(discordSignSchema),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const input = discordSignSchema.parse(request.body);
        if (input.confirmation.toUpperCase() !== "I ACCEPT")
          throw new SupportError(
            400,
            'Type "I ACCEPT" to confirm you agree to the NDA',
          );
        const owner = (
          await pool.query<{ user_id: string }>(
            "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
            [tenantId, input.discordUserId],
          )
        ).rows[0];
        if (!owner)
          throw new SupportError(
            403,
            "Your Discord account is not linked to a KUSH account",
          );
        const id = params<{ id: string }>(request).id;
        const current = (
          await pool.query<{ sha: string }>(
            `SELECT t.body_sha256 AS sha FROM agreements g JOIN agreement_templates t ON t.id=g.template_id
             WHERE g.tenant_id=$1 AND g.id=$2 AND g.user_id=$3`,
            [tenantId, id, owner.user_id],
          )
        ).rows[0];
        // Someone else's NDA looks exactly like a missing one.
        if (!current) throw new SupportError(404, "Agreement not found");
        return service.sign({ userId: owner.user_id, via: "discord" }, id, {
          legalName: input.legalName,
          email: input.email,
          signature: input.signature,
          accept: true,
          statement: ACCEPTANCE_STATEMENT,
          bodySha256: current.sha,
          ipHash: null,
          userAgent: "Discord (bot modal)",
        });
      }),
  );

  app.get(
    `${base}/application-channels`,
    { schema: { params: tenantParams({}) } },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const rows = await pool.query<{
          id: string;
          discord_channel_id: string;
          status: string;
        }>(
          "SELECT id,discord_channel_id,status FROM staff_applications WHERE tenant_id=$1 AND discord_channel_id IS NOT NULL",
          [tenantId],
        );
        return {
          channels: rows.rows.map((r) => ({
            applicationId: r.id,
            channelId: r.discord_channel_id,
            status: r.status,
          })),
        };
      }),
  );

  // A Discord message in an application channel, from the applicant or a
  // reviewer. Reviewers are checked live (Discord roles), never assumed.
  app.post(
    `${base}/application-channels/:channelId/messages`,
    {
      schema: {
        params: tenantParams({ channelId: snowflake }),
        body: body(
          z
            .object({
              discordUserId: z.string().regex(/^[0-9]{17,20}$/),
              messageId: z.string().regex(/^[0-9]{17,20}$/),
              content: z.string().min(1).max(5000),
            })
            .strict(),
        ),
      },
    },
    async (request, reply) =>
      handle(reply, async () => {
        const tenantId = await bot(request);
        const input = request.body as {
          discordUserId: string;
          messageId: string;
          content: string;
        };
        const app = (
          await pool.query<{ id: string; user_id: string }>(
            "SELECT id,user_id FROM staff_applications WHERE tenant_id=$1 AND discord_channel_id=$2",
            [tenantId, params<{ channelId: string }>(request).channelId],
          )
        ).rows[0];
        if (!app) throw new SupportError(404, "Not an application channel");
        const author = (
          await pool.query<{ user_id: string }>(
            "SELECT user_id FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified'",
            [tenantId, input.discordUserId],
          )
        ).rows[0];
        if (!author)
          throw new SupportError(
            403,
            "Your Discord account is not linked to a KUSH account",
          );
        let isReviewer = false;
        if (author.user_id !== app.user_id) {
          const roles = await access.liveRoles(tenantId, input.discordUserId);
          isReviewer =
            roles !== "unavailable" &&
            permissionsFor(roles).includes("applications.review");
          if (!isReviewer)
            throw new SupportError(
              403,
              "Only the applicant and recruiters can post here",
            );
        }
        return service.addMessage(
          app.id,
          { userId: author.user_id, isReviewer },
          {
            content: input.content,
            requestId: `discord:${input.messageId}`,
            source: "discord",
          },
        );
      }),
  );
}
