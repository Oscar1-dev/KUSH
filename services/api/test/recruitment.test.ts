import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import type { DiscordOAuth, DiscordProfile } from "../src/account-service.js";
import type { DiscordMembers, MemberLookup } from "../src/staff-access.js";
import { currentStep, totpCode } from "../src/totp.js";
import { RecruitmentService } from "../src/recruitment-service.js";
import { ACCEPTANCE_STATEMENT } from "../src/agreements/staff-nda.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const WEBSITE = "test-website-secret-at-least-32-chars!!";
const BOT_SECRET = "test-integration-secret-32-characters!!";
const STAFF_GUILD = "923456789012345673";
const ROLE = {
  support: "523456789012345601",
  developer: "523456789012345602",
  moderator: "523456789012345603",
  manager: "523456789012345604",
  admin: "523456789012345605",
  owner: "523456789012345606",
  // A Discord role that is NOT mapped (e.g. "Verified Customer").
  customer: "523456789012345699",
};

const discordId = () =>
  `${Date.now()}${Math.floor(Math.random() * 1e6)}`
    .padEnd(18, "5")
    .slice(0, 18);

class FakeDiscord implements DiscordOAuth {
  codes = new Map<string, DiscordProfile>();
  authorizeUrl(params: URLSearchParams) {
    return `https://discord.test/authorize?${params}`;
  }
  async exchange(code: string) {
    return `access-${code}`;
  }
  async profile(token: string) {
    return this.codes.get(token.slice(7))!;
  }
}

/** Fake guild: who holds which Discord roles right now. */
class FakeGuild implements DiscordMembers {
  roles = new Map<string, string[]>();
  down = false;
  async member(id: string): Promise<MemberLookup> {
    if (this.down) return { state: "unavailable" };
    const roles = this.roles.get(id);
    return roles
      ? { state: "member", roleIds: roles }
      : { state: "not_member" };
  }
}

describe.skipIf(!databaseUrl)(
  "staff recruitment and NDA pipeline (real PostgreSQL)",
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let pool: ReturnType<typeof createDatabase>["pool"];
    let tenantId: string;
    const discord = new FakeDiscord();
    const guild = new FakeGuild();
    const previous = {
      website: process.env.KUSH_WEBSITE_SECRET,
      tenant: process.env.KUSH_SUPPORT_TENANT_ID,
      key: process.env.KUSH_MFA_KEY,
      integration: process.env.KUSH_DISCORD_INTEGRATION_SECRET,
    };

    const web = (
      method: "GET" | "POST",
      url: string,
      token: string,
      payload?: object,
    ) =>
      app.inject({
        method,
        url,
        headers: {
          "x-kush-website-secret": WEBSITE,
          authorization: `Bearer ${token}`,
        },
        ...(payload ? { payload } : {}),
      });

    interface Person {
      token: string;
      discordId: string;
      userId: string;
    }
    /** Signs in through OAuth; optionally switches 2FA on (verified session). */
    const person = async (
      roles: string[],
      options: { mfa?: boolean; name?: string } = {},
    ): Promise<Person> => {
      const id = discordId();
      guild.roles.set(id, roles);
      const binding = randomBytes(32).toString("base64url");
      const started = await app.inject({
        method: "POST",
        url: "/web/auth/discord/start",
        headers: { "x-kush-website-secret": WEBSITE },
        payload: { binding },
      });
      const state = new URL(started.json().authorizeUrl).searchParams.get(
        "state",
      )!;
      const code = randomUUID();
      discord.codes.set(code, {
        id,
        username: options.name ?? `TEST ${id.slice(-4)}`,
        avatar: null,
      });
      const { token } = (
        await app.inject({
          method: "POST",
          url: "/web/auth/discord/callback",
          headers: { "x-kush-website-secret": WEBSITE },
          payload: { state, code, binding, userAgent: "vitest" },
        })
      ).json();
      if (options.mfa !== false) {
        const { secret } = (
          await web("POST", "/web/account/mfa/totp/setup", token)
        ).json();
        await web("POST", "/web/account/mfa/totp/enable", token, {
          code: totpCode(secret, currentStep()),
        });
      }
      const userId = (await web("GET", "/web/account", token)).json().id;
      return { token, discordId: id, userId };
    };
    beforeAll(async () => {
      process.env.KUSH_WEBSITE_SECRET = WEBSITE;
      process.env.KUSH_MFA_KEY = "test-mfa-key-that-is-at-least-32-characters";
      process.env.KUSH_DISCORD_INTEGRATION_SECRET = BOT_SECRET;
      pool = createDatabase(databaseUrl!).pool;
      app = await buildApp(databaseUrl!, false, {
        oauth: () => discord,
        members: () => guild,
      });
      tenantId = (
        await pool.query<{ id: string }>(
          "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
          [
            "TEST recruitment",
            STAFF_GUILD,
            JSON.stringify({
              categories: [
                { key: "technical", label: "Technical" },
                { key: "billing", label: "Billing" },
                { key: "member-report", label: "Member report" },
              ],
              reportCategories: ["member-report"],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0]!.id;
      process.env.KUSH_SUPPORT_TENANT_ID = tenantId;
      for (const [role, staffRole] of [
        [ROLE.support, "support"],
        [ROLE.developer, "developer"],
        [ROLE.moderator, "moderator"],
        [ROLE.manager, "manager"],
        [ROLE.admin, "administrator"],
        [ROLE.owner, "owner"],
      ])
        await pool.query(
          "INSERT INTO staff_role_mappings(tenant_id,discord_role_id,staff_role) VALUES($1,$2,$3)",
          [tenantId, role, staffRole],
        );
    });

    afterAll(async () => {
      for (const [key, value] of [
        ["KUSH_WEBSITE_SECRET", previous.website],
        ["KUSH_SUPPORT_TENANT_ID", previous.tenant],
        ["KUSH_MFA_KEY", previous.key],
        ["KUSH_DISCORD_INTEGRATION_SECRET", previous.integration],
      ] as const)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      await app?.close();
      await pool?.end();
    });

    const DISCORD_SUPPORT_ROLE = "623456789012345611";
    const bot = (method: "GET" | "POST", path: string, payload?: object) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}${path}`,
        headers: {
          "x-kush-discord-secret": BOT_SECRET,
          "x-kush-discord-guild-id": STAFF_GUILD,
        },
        ...(payload ? { payload } : {}),
      });
    type Job = { id: string; kind: string; delivery: Record<string, string> };
    const drain = async () => {
      const jobs = (await bot("GET", "/notifications/jobs")).json()
        .jobs as Job[];
      for (const job of jobs)
        await bot("POST", `/notifications/jobs/${job.id}`, { ok: true });
      return jobs;
    };
    const application = (overrides: object = {}) => ({
      requestId: randomUUID(),
      positionKey: "support-agent",
      preferredName: "TEST Applicant",
      email: "applicant@test.invalid",
      experience: "TEST: two years running support for a gaming community.",
      skills: "Patience, clear writing, Discord moderation",
      availability: "Evenings and weekends, UK time",
      motivation: "TEST: I want to help KUSH customers get answers quickly.",
      portfolioUrl: null,
      ...overrides,
    });
    const detail = async (who: Person, id: string) =>
      (await web("GET", `/web/staff/applications/${id}`, who.token)).json();
    const move = async (who: Person, id: string, status: string) =>
      web("POST", `/web/staff/applications/${id}/status`, who.token, {
        expectedVersion: (await detail(who, id)).application.version,
        status,
      });

    it("lists open positions publicly (website only)", async () => {
      await pool.query(
        `INSERT INTO staff_positions(tenant_id,key,title,summary,staff_role,discord_role_id)
       VALUES($1,'support-agent','Support Agent','TEST: help customers through tickets and Discord.','support',$2),
             ($1,'developer','Developer','TEST: build and maintain KUSH commissions and tools.','developer',NULL)`,
        [tenantId, DISCORD_SUPPORT_ROLE],
      );
      await pool.query(
        "UPDATE staff_positions SET portfolio_required=true WHERE tenant_id=$1 AND key='developer'",
        [tenantId],
      );
      const response = await app.inject({
        method: "GET",
        url: "/web/careers/positions",
        headers: { "x-kush-website-secret": WEBSITE },
      });
      expect(
        response.json().positions.map((p: { key: string }) => p.key),
      ).toEqual(["developer", "support-agent"]);
    });

    it("runs the whole pipeline from application to activated staff role", async () => {
      await drain();
      const applicant = await person([], { mfa: false });
      const manager = await person([ROLE.manager]);
      const admin = await person([ROLE.admin]);
      const support = await person([ROLE.support]);

      // 1. Submit (idempotent on requestId).
      const input = application();
      const created = (
        await web(
          "POST",
          "/web/recruitment/applications",
          applicant.token,
          input,
        )
      ).json().application;
      const again = (
        await web(
          "POST",
          "/web/recruitment/applications",
          applicant.token,
          input,
        )
      ).json().application;
      expect(again.id).toBe(created.id);
      // A second open application for the same position is refused.
      expect(
        (
          await web(
            "POST",
            "/web/recruitment/applications",
            applicant.token,
            application(),
          )
        ).statusCode,
      ).toBe(409);

      // 2. Recruiters notified (no personal data); private channel requested.
      const jobs = await drain();
      const announced = jobs.find((j) => j.kind === "application.created")!;
      expect(announced.delivery.channelKey).toBe("staff:staff-chat");
      expect(announced.delivery.content).not.toContain("TEST Applicant");
      expect(announced.delivery.content).not.toContain(
        "applicant@test.invalid",
      );
      const channel = jobs.find((j) => j.kind === "application.channel")!;
      expect(channel.delivery).toMatchObject({
        target: "create_application_channel",
        applicantDiscordId: applicant.discordId,
      });
      const channelId = `8${Date.now()}`.padEnd(18, "2").slice(0, 18);
      await bot("POST", `/applications/${created.id}/channel`, { channelId });

      // 3. Review permissions: support cannot see applications at all.
      expect(
        (await web("GET", "/web/staff/applications", support.token)).statusCode,
      ).toBe(403);
      expect((await move(manager, created.id, "reviewing")).statusCode).toBe(
        200,
      );
      expect((await move(manager, created.id, "more_info")).statusCode).toBe(
        200,
      );

      // 4. Applicant answers in Discord: recorded, and back to reviewing.
      const reply = await bot(
        `POST`,
        `/application-channels/${channelId}/messages`,
        {
          discordUserId: applicant.discordId,
          messageId: "912345678901234567",
          content: "TEST: I can also cover Saturdays.",
        },
      );
      expect(reply.statusCode).toBe(200);
      expect((await detail(manager, created.id)).application.status).toBe(
        "reviewing",
      );
      // A random member cannot post into the application record.
      const stranger = await person([], { mfa: false });
      expect(
        (
          await bot("POST", `/application-channels/${channelId}/messages`, {
            discordUserId: stranger.discordId,
            messageId: "912345678901234568",
            content: "hi",
          })
        ).statusCode,
      ).toBe(403);

      // 5. Decisions need an administrator.
      expect(
        (await move(manager, created.id, "conditionally_accepted")).statusCode,
      ).toBe(403);
      expect(
        (await move(admin, created.id, "conditionally_accepted")).statusCode,
      ).toBe(200);

      // 6. No NDA can be issued until a version is explicitly activated.
      const issue = async () =>
        web(
          "POST",
          `/web/staff/applications/${created.id}/issue-nda`,
          admin.token,
          {
            expectedVersion: (await detail(admin, created.id)).application
              .version,
          },
        );
      expect((await issue()).statusCode).toBe(409);
      const templates = (
        await web("GET", "/web/staff/agreement-templates", admin.token)
      ).json().templates;
      expect(templates[0]).toMatchObject({ key: "staff-nda", status: "draft" });
      expect(
        (await web("GET", "/web/staff/agreement-templates", manager.token))
          .statusCode,
      ).toBe(403);
      await web(
        "POST",
        `/web/staff/agreement-templates/${templates[0].id}/status`,
        admin.token,
        { status: "active" },
      );
      const issued = await issue();
      expect(issued.statusCode).toBe(200);
      const agreementId = issued.json().agreementId as string;
      const notice = (await drain()).find(
        (j) => j.kind === "agreement.issued",
      )!;
      // The NDA arrives in the applicant's channel as a full text + choice
      // of signing in Discord or on the website.
      expect(notice.delivery).toMatchObject({
        target: "nda_prompt",
        channelId,
        discordUserId: applicant.discordId,
        agreementId,
      });
      expect(notice.delivery.body).toContain("NON-DISCLOSURE AGREEMENT");
      expect(notice.delivery.websiteUrl).toContain(
        `/account/agreements/${agreementId}`,
      );

      // 7. Signing: only the applicant, only with explicit acceptance.
      const nda = (
        await web("GET", `/web/agreements/${agreementId}`, applicant.token)
      ).json();
      expect(nda.body).toContain("NON-DISCLOSURE AGREEMENT");
      expect(nda.acceptanceStatement).toBe(ACCEPTANCE_STATEMENT);
      expect(
        (await web("GET", `/web/agreements/${agreementId}`, stranger.token))
          .statusCode,
      ).toBe(404);
      const sign = (overrides: object) =>
        web("POST", `/web/agreements/${agreementId}/sign`, applicant.token, {
          legalName: "Test Applicant Person",
          email: "applicant@test.invalid",
          signature: "Test Applicant Person",
          accept: true,
          statement: ACCEPTANCE_STATEMENT,
          bodySha256: nda.sha256,
          ...overrides,
        });
      expect((await sign({ accept: false })).statusCode).toBe(400);
      expect((await sign({ signature: "Someone Else" })).statusCode).toBe(400);
      expect((await sign({ statement: "I agree" })).statusCode).toBe(400);
      expect((await sign({ bodySha256: "0".repeat(64) })).statusCode).toBe(409);
      expect((await sign({})).statusCode).toBe(200);
      expect((await sign({})).statusCode).toBe(409); // once only
      expect((await detail(admin, created.id)).application.status).toBe(
        "nda_signed",
      );

      // 8. PDF copies: the signer, and agreement managers (not managers).
      const own = await web(
        "GET",
        `/web/agreements/${agreementId}/pdf`,
        applicant.token,
      );
      expect(own.headers["content-type"]).toBe("application/pdf");
      expect(own.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      expect(
        (
          await web(
            "GET",
            `/web/staff/agreements/${agreementId}/pdf`,
            manager.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await web(
            "GET",
            `/web/staff/agreements/${agreementId}/pdf`,
            admin.token,
          )
        ).statusCode,
      ).toBe(200);

      // 9. Signing never grants anything; approval and activation are explicit.
      expect(
        (
          await web(
            "POST",
            `/web/staff/applications/${created.id}/activate`,
            admin.token,
            {
              expectedVersion: (await detail(admin, created.id)).application
                .version,
            },
          )
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await web(
            "POST",
            `/web/staff/applications/${created.id}/approve`,
            manager.token,
            {
              expectedVersion: (await detail(manager, created.id)).application
                .version,
              staffRole: "support",
            },
          )
        ).statusCode,
      ).toBe(403);
      await drain();
      expect(
        (
          await web(
            "POST",
            `/web/staff/applications/${created.id}/approve`,
            admin.token,
            {
              expectedVersion: (await detail(admin, created.id)).application
                .version,
              staffRole: "support",
            },
          )
        ).statusCode,
      ).toBe(200);
      expect((await drain()).some((j) => j.kind === "staff.role_grant")).toBe(
        false,
      );
      const activated = await web(
        "POST",
        `/web/staff/applications/${created.id}/activate`,
        admin.token,
        {
          expectedVersion: (await detail(admin, created.id)).application
            .version,
        },
      );
      expect(activated.statusCode).toBe(200);
      const grant = (await drain()).find((j) => j.kind === "staff.role_grant")!;
      expect(grant.delivery).toMatchObject({
        target: "grant_role",
        discordUserId: applicant.discordId,
        roleId: DISCORD_SUPPORT_ROLE,
      });

      // 10. Applicant view: status history, no review notes or reviewer names.
      await web(
        "POST",
        `/web/staff/applications/${created.id}/review-note`,
        admin.token,
        {
          reviewNote: "TEST internal: strong candidate",
        },
      );
      const mine = (
        await web(
          "GET",
          `/web/recruitment/applications/${created.id}`,
          applicant.token,
        )
      ).json();
      expect(mine.application.status).toBe("activated");
      expect(JSON.stringify(mine)).not.toContain("strong candidate");
      expect(mine.events.map((e: { status: string }) => e.status)).toContain(
        "nda_signed",
      );
    });

    it("lets moderators skip the NDA but requires it for every role above", async () => {
      const applicant = await person([], { mfa: false });
      const admin = await person([ROLE.admin]);
      const created = (
        await web(
          "POST",
          "/web/recruitment/applications",
          applicant.token,
          application(),
        )
      ).json().application;
      await move(admin, created.id, "reviewing");
      await move(admin, created.id, "conditionally_accepted");
      const approve = async (staffRole: string) =>
        web(
          "POST",
          `/web/staff/applications/${created.id}/approve`,
          admin.token,
          {
            expectedVersion: (await detail(admin, created.id)).application
              .version,
            staffRole,
          },
        );
      // Support (above Moderator) without an NDA: refused.
      const refused = await approve("support");
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toMatch(/above Moderator need a signed NDA/);
      expect((await detail(admin, created.id)).actions.approvableRoles).toEqual(
        ["moderator"],
      );
      // Moderator: allowed straight from conditional acceptance.
      expect((await approve("moderator")).statusCode).toBe(200);
      const activated = await web(
        "POST",
        `/web/staff/applications/${created.id}/activate`,
        admin.token,
        {
          expectedVersion: (await detail(admin, created.id)).application
            .version,
        },
      );
      expect(activated.statusCode).toBe(200); // moderator role granted with no NDA
    });

    it("signs the NDA from Discord into the same record, and adds the team member", async () => {
      await drain();
      const applicant = await person([], { mfa: false });
      const admin = await person([ROLE.admin]);
      const stranger = await person([], { mfa: false });
      const created = (
        await web(
          "POST",
          "/web/recruitment/applications",
          applicant.token,
          application(),
        )
      ).json().application;
      await move(admin, created.id, "reviewing");
      await move(admin, created.id, "conditionally_accepted");
      const { agreementId } = (
        await web(
          "POST",
          `/web/staff/applications/${created.id}/issue-nda`,
          admin.token,
          {
            expectedVersion: (await detail(admin, created.id)).application
              .version,
          },
        )
      ).json();
      const sign = (discordUserId: string, overrides: object = {}) =>
        bot("POST", `/agreements/${agreementId}/sign`, {
          discordUserId,
          legalName: "Discord Signer",
          email: "discord-signer@test.invalid",
          signature: "Discord Signer",
          confirmation: "I ACCEPT",
          ...overrides,
        });
      // Someone else cannot sign it; the exact confirmation is required.
      expect((await sign(stranger.discordId)).statusCode).toBe(404);
      expect(
        (await sign(applicant.discordId, { confirmation: "yes" })).statusCode,
      ).toBe(400);
      expect(
        (await sign(applicant.discordId, { signature: "Somebody Else" }))
          .statusCode,
      ).toBe(400);
      expect((await sign(applicant.discordId)).statusCode).toBe(200);
      // Shows on the website as signed, with how it was signed.
      const onSite = (
        await web("GET", `/web/agreements/${agreementId}`, applicant.token)
      ).json();
      expect(onSite).toMatchObject({
        status: "signed",
        legalName: "Discord Signer",
      });
      const via = await pool.query(
        "SELECT signed_via FROM agreements WHERE id=$1",
        [agreementId],
      );
      expect(via.rows[0].signed_via).toBe("discord");
      expect((await detail(admin, created.id)).application.status).toBe(
        "nda_signed",
      );

      // Approve + activate: the person is on the team straight away.
      await web(
        "POST",
        `/web/staff/applications/${created.id}/approve`,
        admin.token,
        {
          expectedVersion: (await detail(admin, created.id)).application
            .version,
          staffRole: "support",
        },
      );
      await web(
        "POST",
        `/web/staff/applications/${created.id}/activate`,
        admin.token,
        {
          expectedVersion: (await detail(admin, created.id)).application
            .version,
        },
      );
      const team = (await web("GET", "/web/staff/team", admin.token)).json()
        .team as { userId: string; roles: string[] }[];
      expect(team.find((m) => m.userId === applicant.userId)?.roles).toEqual([
        "support",
      ]);
    });

    it("lets an applicant withdraw, voiding an unsigned NDA", async () => {
      const applicant = await person([], { mfa: false });
      const admin = await person([ROLE.admin]);
      const created = (
        await web(
          "POST",
          "/web/recruitment/applications",
          applicant.token,
          application(),
        )
      ).json().application;
      await move(admin, created.id, "reviewing");
      await move(admin, created.id, "conditionally_accepted");
      const { agreementId } = (
        await web(
          "POST",
          `/web/staff/applications/${created.id}/issue-nda`,
          admin.token,
          {
            expectedVersion: (await detail(admin, created.id)).application
              .version,
          },
        )
      ).json();
      expect(
        (
          await web(
            "POST",
            `/web/recruitment/applications/${created.id}/withdraw`,
            applicant.token,
          )
        ).statusCode,
      ).toBe(200);
      const nda = (
        await web("GET", `/web/agreements/${agreementId}`, applicant.token)
      ).json();
      expect(nda.status).toBe("voided");
    });

    it("requires a portfolio where the position does", async () => {
      const applicant = await person([], { mfa: false });
      const response = await web(
        "POST",
        "/web/recruitment/applications",
        applicant.token,
        application({ positionKey: "developer" }),
      );
      expect(response.statusCode).toBe(400);
    });

    it("refuses to start if a published NDA text was changed", async () => {
      const original = (
        await pool.query<{ body_sha256: string }>(
          "SELECT body_sha256 FROM agreement_templates WHERE key='staff-nda'",
        )
      ).rows[0]!.body_sha256;
      await pool.query(
        "UPDATE agreement_templates SET body_sha256=$1 WHERE key='staff-nda'",
        ["f".repeat(64)],
      );
      try {
        await expect(
          new RecruitmentService(pool).ensureTemplates(),
        ).rejects.toThrow(/changed after publication/);
      } finally {
        await pool.query(
          "UPDATE agreement_templates SET body_sha256=$1 WHERE key='staff-nda'",
          [original],
        );
      }
    });
  },
);
