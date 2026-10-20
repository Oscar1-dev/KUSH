import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import type { DiscordOAuth, DiscordProfile } from "../src/account-service.js";
import type { DiscordMembers, MemberLookup } from "../src/staff-access.js";
import { permissionsFor } from "../src/staff-access.js";
import { currentStep, totpCode } from "../src/totp.js";
import { tokenHash } from "../src/password.js";
import { FakeStripeGateway } from "../src/stripe-gateway.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const WEBSITE = "test-website-secret-at-least-32-chars!!";
const BOT_SECRET = "test-integration-secret-32-characters!!";
const STAFF_GUILD = "923456789012345672";
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

describe("permission sets", () => {
  it("unions the grants of multiple roles", () => {
    expect(permissionsFor(["support", "developer"])).toEqual([
      "commissions.assigned",
      "tickets.assigned",
      "tickets.queue",
    ]);
    expect(permissionsFor(["moderator"])).toEqual([
      "moderation.view",
      "reports.handle",
      "vouches.manage",
    ]);
    expect(permissionsFor([])).toEqual([]);
  });
});

describe.skipIf(!databaseUrl)("staff dashboard (real PostgreSQL)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pool: ReturnType<typeof createDatabase>["pool"];
  let tenantId: string;
  const discord = new FakeDiscord();
  const guild = new FakeGuild();
  const stripe = new FakeStripeGateway();
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
  const openTicket = async (customer: Person, category: string) =>
    (
      await web("POST", "/web/workspace/tickets", customer.token, {
        requestId: randomUUID(),
        category,
        description: `TEST ${category} ticket for staff tests`,
      })
    ).json().ticket as { id: string; version: number };
  const ticketsFor = async (who: Person, scope: string) => {
    const response = await web(
      "GET",
      `/web/staff/tickets?scope=${scope}`,
      who.token,
    );
    return response.statusCode === 200
      ? (response.json().tickets as { id: string }[]).map((t) => t.id)
      : response.statusCode;
  };
  const version = async (who: Person, ticketId: string) =>
    (await web("GET", `/web/staff/tickets/${ticketId}`, who.token)).json()
      .ticket.version as number;

  beforeAll(async () => {
    process.env.KUSH_WEBSITE_SECRET = WEBSITE;
    process.env.KUSH_MFA_KEY = "test-mfa-key-that-is-at-least-32-characters";
    process.env.KUSH_DISCORD_INTEGRATION_SECRET = BOT_SECRET;
    pool = createDatabase(databaseUrl!).pool;
    app = await buildApp(databaseUrl!, false, {
      oauth: () => discord,
      members: () => guild,
      payments: stripe,
    });
    tenantId = (
      await pool.query<{ id: string }>(
        "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
        [
          "TEST staff",
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

  it("refuses customers, unmapped roles and people who left the server", async () => {
    const customer = await person([ROLE.customer]);
    const me = await web("GET", "/web/staff/me", customer.token);
    expect(me.statusCode).toBe(403);
    expect(me.json().reason).toBe("not_staff");
    const gone = await person([ROLE.support]);
    guild.roles.delete(gone.discordId);
    expect((await web("GET", "/web/staff/me", gone.token)).json().reason).toBe(
      "not_staff",
    );
  });

  it("requires 2FA for staff, even with a staff role", async () => {
    const noMfa = await person([ROLE.support], { mfa: false });
    const me = await web("GET", "/web/staff/me", noMfa.token);
    expect(me.statusCode).toBe(403);
    expect(me.json().reason).toBe("mfa_setup_required");

    const stale = await person([ROLE.support]);
    await pool.query(
      "UPDATE sessions SET mfa_verified_at=now() - interval '13 hours' WHERE token_hash=$1",
      [tokenHash(stale.token)],
    );
    expect((await web("GET", "/web/staff/me", stale.token)).json().reason).toBe(
      "mfa_required",
    );
  });

  it("fails closed when Discord is unavailable", async () => {
    const support = await person([ROLE.support]);
    guild.down = true;
    try {
      const me = await web("GET", "/web/staff/me", support.token);
      expect(me.statusCode).toBe(503);
      expect(me.json().reason).toBe("discord_unavailable");
    } finally {
      guild.down = false;
    }
  });

  it("revokes access as soon as the Discord role is removed", async () => {
    const support = await person([ROLE.support]);
    expect((await web("GET", "/web/staff/me", support.token)).statusCode).toBe(
      200,
    );
    guild.roles.set(support.discordId, [ROLE.customer]);
    expect((await web("GET", "/web/staff/me", support.token)).statusCode).toBe(
      403,
    );
  });

  it("scopes support to assigned + queue, never billing or reports", async () => {
    const customer = await person([], { mfa: false });
    const technical = await openTicket(customer, "technical");
    const billing = await openTicket(customer, "billing");
    const report = await openTicket(customer, "member-report");
    const support = await person([ROLE.support]);

    const queue = (await ticketsFor(support, "queue")) as string[];
    expect(queue).toContain(technical.id);
    expect(queue).not.toContain(billing.id);
    expect(queue).not.toContain(report.id);
    expect(await ticketsFor(support, "all")).toBe(403);
    expect(await ticketsFor(support, "reports")).toBe(403);
    expect(
      (await web("GET", `/web/staff/tickets/${billing.id}`, support.token))
        .statusCode,
    ).toBe(404);

    // Must claim before replying; then it moves to "assigned".
    const reply = (expectedVersion: number) =>
      web(
        "POST",
        `/web/staff/tickets/${technical.id}/messages`,
        support.token,
        {
          requestId: randomUUID(),
          expectedVersion,
          kind: "reply",
          content: "TEST staff reply",
        },
      );
    expect((await reply(technical.version)).statusCode).toBe(403);
    expect(
      (
        await web(
          "POST",
          `/web/staff/tickets/${technical.id}/claim`,
          support.token,
          {
            expectedVersion: technical.version,
          },
        )
      ).statusCode,
    ).toBe(200);
    expect(await ticketsFor(support, "assigned")).toContain(technical.id);
    expect((await reply(await version(support, technical.id))).statusCode).toBe(
      200,
    );

    // Another support member can no longer see it (assigned elsewhere).
    const other = await person([ROLE.support]);
    expect(
      (await web("GET", `/web/staff/tickets/${technical.id}`, other.token))
        .statusCode,
    ).toBe(404);
    // The customer sees the reply, and nothing staff-only.
    const seen = (
      await web("GET", `/web/workspace/tickets/${technical.id}`, customer.token)
    ).json().messages;
    expect(seen.map((m: { content: string }) => m.content)).toEqual([
      "TEST staff reply",
    ]);
  });

  it("keeps internal notes away from customers", async () => {
    const customer = await person([], { mfa: false });
    const ticket = await openTicket(customer, "technical");
    const manager = await person([ROLE.manager]);
    const note = await web(
      "POST",
      `/web/staff/tickets/${ticket.id}/messages`,
      manager.token,
      {
        requestId: randomUUID(),
        expectedVersion: ticket.version,
        kind: "note",
        content: "TEST internal: check refund history",
      },
    );
    expect(note.statusCode).toBe(200);
    const staffView = (
      await web("GET", `/web/staff/tickets/${ticket.id}`, manager.token)
    ).json();
    expect(staffView.messages[0]).toMatchObject({ kind: "note" });
    const customerView = (
      await web("GET", `/web/workspace/tickets/${ticket.id}`, customer.token)
    ).json();
    expect(customerView.messages).toEqual([]);
  });

  it("gives moderators reports only", async () => {
    const customer = await person([], { mfa: false });
    const report = await openTicket(customer, "member-report");
    const technical = await openTicket(customer, "technical");
    const moderator = await person([ROLE.moderator]);
    const reports = (await ticketsFor(moderator, "reports")) as string[];
    expect(reports).toContain(report.id);
    expect(reports).not.toContain(technical.id);
    expect(await ticketsFor(moderator, "queue")).toBe(403);
    expect(
      (await web("GET", `/web/staff/tickets/${technical.id}`, moderator.token))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await web(
          "POST",
          `/web/staff/tickets/${report.id}/status`,
          moderator.token,
          {
            expectedVersion: report.version,
            status: "in_progress",
          },
        )
      ).statusCode,
    ).toBe(200);
  });

  it("supports multiple roles at once", async () => {
    const both = await person([ROLE.support, ROLE.moderator]);
    const me = (await web("GET", "/web/staff/me", both.token)).json();
    expect(me.roles).toEqual(["support", "moderator"]);
    expect(me.permissions).toEqual(
      expect.arrayContaining(["tickets.queue", "reports.handle"]),
    );
    expect(await ticketsFor(both, "reports")).not.toBe(403);
    expect(await ticketsFor(both, "queue")).not.toBe(403);
  });

  it("lets developers progress only their own commissions", async () => {
    const customer = await person([], { mfa: false });
    const created = (
      await web("POST", "/web/workspace/commissions", customer.token, {
        requestId: randomUUID(),
        category: "software",
        title: "TEST internal tool",
        details: "TEST: a small internal dashboard for stock levels.",
        approximateBudget: null,
        preferredTimeframe: null,
      })
    ).json().commission as { id: string; version: number };
    const developer = await person([ROLE.developer]);
    const manager = await person([ROLE.manager]);
    const commission = (who: Person) =>
      web("GET", `/web/staff/commissions/${created.id}`, who.token);
    const update = (who: Person, payload: object) =>
      web("POST", `/web/staff/commissions/${created.id}`, who.token, payload);

    // Not assigned yet: the developer cannot see it at all.
    expect((await commission(developer)).statusCode).toBe(404);
    expect(
      (await web("GET", "/web/staff/commissions?scope=all", developer.token))
        .statusCode,
    ).toBe(403);

    // The developer must be known to the roster (has used the dashboard).
    await web("GET", "/web/staff/me", developer.token);
    let v = (await commission(manager)).json().commission.version;
    expect(
      (
        await web(
          "POST",
          `/web/staff/commissions/${created.id}/assign`,
          manager.token,
          {
            expectedVersion: v,
            userId: developer.userId,
          },
        )
      ).statusCode,
    ).toBe(200);
    // Work starts only once paid: review → quote → customer accepts →
    // an administrator records the (offline) payment.
    v = (await commission(manager)).json().commission.version;
    expect(
      (await update(manager, { expectedVersion: v, status: "reviewing" }))
        .statusCode,
    ).toBe(200);
    // Quoting is its own action; a manager can't just flip the status.
    v = (await commission(manager)).json().commission.version;
    expect(
      (await update(manager, { expectedVersion: v, status: "accepted" }))
        .statusCode,
    ).toBe(409);
    const quoteId = (
      await web(
        "POST",
        `/web/staff/commissions/${created.id}/quotes`,
        manager.token,
        {
          amount: "£120",
          amountPence: 12_000,
          summary: "TEST: stock dashboard, one revision round.",
          timeframe: "2 weeks",
        },
      )
    ).json().quoteId as string;
    expect(
      (
        await web(
          "POST",
          `/web/workspace/commissions/${created.id}/quotes/${quoteId}/accept`,
          customer.token,
          {},
        )
      ).json(),
    ).toEqual({ status: "payment_pending" });
    const offline = (who: Person) =>
      web(
        "POST",
        `/web/staff/commissions/${created.id}/quotes/${quoteId}/offline-payment`,
        who.token,
        {
          amountPence: 12_000,
          note: "TEST bank transfer",
          requestId: randomUUID(),
        },
      );
    expect((await offline(manager)).statusCode).toBe(403);
    const admin = await person([ROLE.admin]);
    expect((await offline(admin)).statusCode).toBe(200);
    expect((await commission(manager)).json().commission.status).toBe("paid");
    v = (await commission(developer)).json().commission.version;
    // Developers cannot quote, cancel or write review notes...
    expect(
      (await update(developer, { expectedVersion: v, status: "cancelled" }))
        .statusCode,
    ).toBe(409);
    expect(
      (await update(developer, { expectedVersion: v, reviewNote: "x" }))
        .statusCode,
    ).toBe(403);
    // ...but can move the work along.
    expect(
      (await update(developer, { expectedVersion: v, status: "in_progress" }))
        .statusCode,
    ).toBe(200);
    // The customer sees the progress but not the internal review note.
    v = (await commission(manager)).json().commission.version;
    await update(manager, {
      expectedVersion: v,
      reviewNote: "TEST internal margin note",
    });
    const customerView = (
      await web(
        "GET",
        `/web/workspace/commissions/${created.id}`,
        customer.token,
      )
    ).json().commission;
    expect(customerView.status).toBe("in_progress");
    expect(JSON.stringify(customerView)).not.toContain("margin");
  });

  it("checks assignees live, not from the roster", async () => {
    const customer = await person([], { mfa: false });
    const ticket = await openTicket(customer, "technical");
    const manager = await person([ROLE.manager]);
    const support = await person([ROLE.support]);
    await web("GET", "/web/staff/me", support.token); // joins the roster
    guild.roles.set(support.discordId, []); // ...then loses the role
    const assigned = await web(
      "POST",
      `/web/staff/tickets/${ticket.id}/assign`,
      manager.token,
      { expectedVersion: ticket.version, userId: support.userId },
    );
    expect(assigned.statusCode).toBe(400);
    // Support cannot assign at all.
    const other = await person([ROLE.support]);
    expect(
      (
        await web(
          "POST",
          `/web/staff/tickets/${ticket.id}/assign`,
          other.token,
          {
            expectedVersion: ticket.version,
            userId: other.userId,
          },
        )
      ).statusCode,
    ).toBe(403);
  });

  it("limits the audit log to administrators and records staff actions", async () => {
    const manager = await person([ROLE.manager]);
    const admin = await person([ROLE.admin]);
    expect(
      (await web("GET", "/web/staff/audit", manager.token)).statusCode,
    ).toBe(403);
    const events = (await web("GET", "/web/staff/audit", admin.token)).json()
      .events as { action: string }[];
    expect(events.some((e) => e.action.startsWith("staff."))).toBe(true);
  });

  describe("Discord notification outbox", () => {
    const botCall = (
      method: "GET" | "POST",
      path: string,
      payload?: object,
      guild = STAFF_GUILD,
      secret = BOT_SECRET,
    ) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}/notifications${path}`,
        headers: {
          "x-kush-discord-secret": secret,
          "x-kush-discord-guild-id": guild,
        },
        ...(payload ? { payload } : {}),
      });
    type Job = { id: string; kind: string; delivery: Record<string, string> };
    /** Claims everything due and confirms it, returning what was delivered. */
    const drain = async () => {
      const jobs = (await botCall("GET", "/jobs")).json().jobs as Job[];
      for (const job of jobs)
        await botCall("POST", `/jobs/${job.id}`, { ok: true });
      return jobs;
    };

    it("opens Discord ticket channels for website tickets, except billing", async () => {
      await drain();
      const customer = await person([], { mfa: false });
      const technical = await openTicket(customer, "technical");
      const billing = await openTicket(customer, "billing");
      const report = await openTicket(customer, "member-report");
      const jobs = await drain();
      const of = (id: string) =>
        jobs.find(
          (j) =>
            (j.delivery as { ticketId?: string }).ticketId === id ||
            j.delivery.content?.includes(id),
        )!.delivery as Record<string, unknown>;
      // Linked customer: the bot opens the same private channel as Discord.
      expect(of(technical.id)).toMatchObject({
        target: "create_ticket_channel",
        queue: "support",
        customerDiscordId: customer.discordId,
        fallback: { target: "channel", channelKey: "staff:ticket-queue" },
      });
      expect(of(report.id)).toMatchObject({
        target: "create_ticket_channel",
        queue: "reports",
        fallback: { channelKey: "staff:moderation-log" },
      });
      // Billing never gets a Discord channel (Support Leads could see it).
      expect(of(billing.id)).toMatchObject({ target: "channel" });
      expect(of(billing.id).content).toMatch(/confidential billing/);
      // Ticket text never goes to the staff channel, only a link.
      expect(JSON.stringify(jobs)).not.toContain("TEST technical ticket");
      // Delivered jobs are done: nothing more to claim.
      expect(await drain()).toEqual([]);
    });

    it("announces website tickets from unlinked customers instead", async () => {
      await drain();
      const customer = await person([], { mfa: false });
      await pool.query(
        "UPDATE discord_account_links SET state='revoked' WHERE user_id=$1",
        [customer.userId],
      );
      const ticket = await openTicket(customer, "technical");
      const job = (await drain()).find((j) =>
        j.delivery.content?.includes(ticket.id),
      )!;
      expect(job.delivery).toMatchObject({
        target: "channel",
        channelKey: "staff:ticket-queue",
      });
    });

    it("mirrors staff replies and DMs the customer, but never internal notes", async () => {
      const customer = await person([], { mfa: false });
      const ticket = await openTicket(customer, "technical");
      const manager = await person([ROLE.manager]);
      await drain();
      const send = async (kind: string, content: string) =>
        web("POST", `/web/staff/tickets/${ticket.id}/messages`, manager.token, {
          requestId: randomUUID(),
          expectedVersion: await version(manager, ticket.id),
          kind,
          content,
        });
      await send("note", "TEST secret internal note");
      expect(await drain()).toEqual([]);
      // Give the ticket a Discord channel so the mirror has somewhere to go.
      const channelId = `7${Date.now()}`.padEnd(18, "1").slice(0, 18);
      await pool.query(
        "INSERT INTO discord_ticket_channels(tenant_id,ticket_id,guild_id,channel_id,queue) VALUES($1,$2,$3,$4,'support')",
        [tenantId, ticket.id, STAFF_GUILD, channelId],
      );
      await send("reply", "TEST public answer");
      const jobs = await drain();
      const channel = jobs.find(
        (j) => j.delivery.target === "ticket_channel",
      )!.delivery;
      expect(channel).toMatchObject({ channelId });
      expect(channel.content).toContain("TEST public answer");
      const dm = jobs.find((j) => j.delivery.target === "dm")!.delivery;
      expect(dm.discordUserId).toBe(customer.discordId);
      // The DM only says there is a reply; the content stays on KUSH.
      expect(dm.content).not.toContain("TEST public answer");
      expect(JSON.stringify(jobs)).not.toContain("secret internal note");
    });

    it("announces commissions without customer data, and DMs status changes", async () => {
      await drain();
      const customer = await person([], { mfa: false });
      const created = (
        await web("POST", "/web/workspace/commissions", customer.token, {
          requestId: randomUUID(),
          category: "creative",
          title: "TEST private brand refresh",
          details: "TEST: refresh the logo and colours for a private client.",
          approximateBudget: null,
          preferredTimeframe: null,
        })
      ).json().commission;
      const jobs = await drain();
      // The commission's conversation ticket gets its private channel too.
      expect(jobs.some((job) => job.kind === "ticket.created")).toBe(true);
      const announced = jobs.find((job) => job.kind === "commission.created");
      expect(announced!.delivery).toMatchObject({
        channelKey: "staff:staff-chat",
      });
      expect(announced!.delivery.content).not.toContain("private brand");
      const manager = await person([ROLE.manager]);
      const v = (
        await web("GET", `/web/staff/commissions/${created.id}`, manager.token)
      ).json().commission.version;
      await web("POST", `/web/staff/commissions/${created.id}`, manager.token, {
        expectedVersion: v,
        status: "reviewing",
      });
      const [dm] = await drain();
      expect(dm!.delivery).toMatchObject({
        target: "dm",
        discordUserId: customer.discordId,
      });
      expect(dm!.delivery.content).toContain("under review");
    });

    it("leases jobs, retries with backoff and gives up after 8 attempts", async () => {
      await drain();
      const customer = await person([], { mfa: false });
      await openTicket(customer, "technical");
      const [job] = (await botCall("GET", "/jobs")).json().jobs as Job[];
      // Leased: a second poll does not hand out the same job.
      const again = (await botCall("GET", "/jobs")).json().jobs as Job[];
      expect(again.map((j) => j.id)).not.toContain(job!.id);
      await botCall("POST", `/jobs/${job!.id}`, {
        ok: false,
        error: "Discord 503",
      });
      const row = (
        await pool.query(
          "SELECT status,attempts,next_attempt_at > now() AS later,last_error FROM notification_jobs WHERE id=$1",
          [job!.id],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: "pending",
        attempts: 1,
        later: true,
        last_error: "Discord 503",
      });
      await pool.query("UPDATE notification_jobs SET attempts=8 WHERE id=$1", [
        job!.id,
      ]);
      await botCall("POST", `/jobs/${job!.id}`, {
        ok: false,
        error: "still down",
      });
      const final = await pool.query(
        "SELECT status FROM notification_jobs WHERE id=$1",
        [job!.id],
      );
      expect(final.rows[0].status).toBe("failed");
    });

    it("rejects the wrong bot secret or guild", async () => {
      expect(
        (
          await botCall(
            "GET",
            "/jobs",
            undefined,
            STAFF_GUILD,
            "x".repeat(BOT_SECRET.length),
          )
        ).statusCode,
      ).toBe(401);
      expect(
        (await botCall("GET", "/jobs", undefined, "999999999999999999"))
          .statusCode,
      ).toBe(404);
    });
  });

  describe("insights: notifications, summary and staff views", () => {
    it("builds the customer feed from real events and tracks reading", async () => {
      const customer = await person([], { mfa: false });
      const ticket = await openTicket(customer, "technical");
      const manager = await person([ROLE.manager]);
      const reply = async (kind: string) =>
        web("POST", `/web/staff/tickets/${ticket.id}/messages`, manager.token, {
          requestId: randomUUID(),
          expectedVersion: await version(manager, ticket.id),
          kind,
          content: `TEST ${kind}`,
        });
      await reply("note");
      await reply("reply");
      const feed = (
        await web("GET", "/web/account/notifications", customer.token)
      ).json();
      expect(feed.unread).toBe(1); // the reply, never the note
      expect(feed.notifications[0].href).toBe(`/account/support/${ticket.id}`);
      await web("POST", "/web/account/notifications/seen", customer.token);
      expect(
        (await web("GET", "/web/account/notifications", customer.token)).json()
          .unread,
      ).toBe(0);
      // Someone else's feed never shows it.
      const other = await person([], { mfa: false });
      expect(
        (await web("GET", "/web/account/notifications", other.token)).json()
          .notifications,
      ).toEqual([]);
      const summary = (
        await web("GET", "/web/account/summary", customer.token)
      ).json();
      expect(summary).toMatchObject({ tickets: 1, products: 0 });
    });

    it("limits customers to managers and operations to administrators", async () => {
      const support = await person([ROLE.support]);
      const manager = await person([ROLE.manager]);
      const admin = await person([ROLE.admin]);
      expect(
        (await web("GET", "/web/staff/customers", support.token)).statusCode,
      ).toBe(403);
      expect(
        (await web("GET", "/web/staff/customers", manager.token)).statusCode,
      ).toBe(200);
      for (const path of ["operations", "catalog", "settings"]) {
        expect(
          (await web("GET", `/web/staff/${path}`, manager.token)).statusCode,
        ).toBe(403);
        expect(
          (await web("GET", `/web/staff/${path}`, admin.token)).statusCode,
        ).toBe(200);
      }
      const catalog = (
        await web("GET", "/web/staff/catalog", admin.token)
      ).json();
      expect(catalog.paymentsLive).toBe(false);
    });

    it("lets administrators retry a failed delivery", async () => {
      const admin = await person([ROLE.admin]);
      const customer = await person([], { mfa: false });
      await openTicket(customer, "technical");
      const job = (
        await pool.query<{ id: string }>(
          "UPDATE notification_jobs SET status='failed',attempts=8,last_error='Discord 503' WHERE id=(SELECT id FROM notification_jobs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1) RETURNING id",
          [tenantId],
        )
      ).rows[0]!;
      const ops = (
        await web("GET", "/web/staff/operations", admin.token)
      ).json();
      expect(ops.problems.map((p: { id: string }) => p.id)).toContain(job.id);
      expect(
        (
          await web(
            "POST",
            `/web/staff/operations/jobs/${job.id}/retry`,
            admin.token,
          )
        ).statusCode,
      ).toBe(200);
      const row = (
        await pool.query(
          "SELECT status,attempts FROM notification_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0];
      expect(row).toEqual({ status: "pending", attempts: 0 });
    });
  });

  describe("commission workflow: conversation, quotes, milestones", () => {
    const newCommission = async (customer: Person) =>
      (
        await web("POST", "/web/workspace/commissions", customer.token, {
          requestId: randomUUID(),
          category: "website",
          title: "TEST shop website",
          details: "TEST: a small shop website with ten products.",
          approximateBudget: null,
          preferredTimeframe: null,
        })
      ).json().commission as { id: string };
    const staffView = async (who: Person, id: string) =>
      (await web("GET", `/web/staff/commissions/${id}`, who.token)).json();
    const move = async (who: Person, id: string, status: string) =>
      web("POST", `/web/staff/commissions/${id}`, who.token, {
        expectedVersion: (await staffView(who, id)).commission.version,
        status,
      });

    it("links a conversation ticket and runs quote acceptance", async () => {
      const customer = await person([], { mfa: false });
      const manager = await person([ROLE.manager]);
      const created = await newCommission(customer);
      const mine = (
        await web(
          "GET",
          `/web/workspace/commissions/${created.id}`,
          customer.token,
        )
      ).json();
      expect(mine.ticketId).toBeTruthy();
      // The linked ticket is a normal conversation the customer can open.
      expect(
        (
          await web(
            "GET",
            `/web/workspace/tickets/${mine.ticketId}`,
            customer.token,
          )
        ).statusCode,
      ).toBe(200);

      const quote = (payload: object = {}) =>
        web(
          "POST",
          `/web/staff/commissions/${created.id}/quotes`,
          manager.token,
          {
            amount: "£450",
            summary: "TEST: design, build and launch, two revision rounds.",
            timeframe: "4 weeks",
            ...payload,
          },
        );
      expect((await quote()).statusCode).toBe(409); // still "submitted"
      await move(manager, created.id, "reviewing");
      const proposed = await quote();
      expect(proposed.statusCode).toBe(200);
      expect((await quote()).statusCode).toBe(409); // one open quote at a time
      const quoteId = proposed.json().quoteId as string;

      const view = (
        await web(
          "GET",
          `/web/workspace/commissions/${created.id}`,
          customer.token,
        )
      ).json();
      expect(view.commission.status).toBe("quoted");
      expect(view.quotes[0]).toMatchObject({
        amount: "£450",
        status: "proposed",
      });

      // Only the requester can decide.
      const stranger = await person([], { mfa: false });
      expect(
        (
          await web(
            "POST",
            `/web/workspace/commissions/${created.id}/quotes/${quoteId}/accept`,
            stranger.token,
            {},
          )
        ).statusCode,
      ).toBe(404);
      const accepted = await web(
        "POST",
        `/web/workspace/commissions/${created.id}/quotes/${quoteId}/accept`,
        customer.token,
        {},
      );
      // Accepting waits for the deposit; staff confirm it by hand.
      expect(accepted.json()).toEqual({ status: "payment_pending" });
      expect(
        (
          await web(
            "POST",
            `/web/workspace/commissions/${created.id}/quotes/${quoteId}/accept`,
            customer.token,
            {},
          )
        ).statusCode,
      ).toBe(409);
      const announce = await pool.query(
        "SELECT detail FROM notification_jobs WHERE kind='commission.quote' AND subject_id=$1",
        [created.id],
      );
      expect(announce.rows[0].detail).toEqual({ decision: "accept" });
    });

    it("sends a declined quote back to review", async () => {
      const customer = await person([], { mfa: false });
      const manager = await person([ROLE.manager]);
      const created = await newCommission(customer);
      await move(manager, created.id, "reviewing");
      const { quoteId } = (
        await web(
          "POST",
          `/web/staff/commissions/${created.id}/quotes`,
          manager.token,
          {
            amount: "£300",
            summary: "TEST: a smaller first version.",
            timeframe: null,
          },
        )
      ).json();
      await web(
        "POST",
        `/web/workspace/commissions/${created.id}/quotes/${quoteId}/decline`,
        customer.token,
        { reason: "TEST: budget too tight" },
      );
      const view = (
        await web(
          "GET",
          `/web/workspace/commissions/${created.id}`,
          customer.token,
        )
      ).json();
      expect(view.commission.status).toBe("reviewing");
      expect(view.quotes[0]).toMatchObject({
        status: "declined",
        declineReason: "TEST: budget too tight",
      });
    });

    it("lets only the assigned developer or managers manage milestones", async () => {
      const customer = await person([], { mfa: false });
      const manager = await person([ROLE.manager]);
      const developer = await person([ROLE.developer]);
      const otherDev = await person([ROLE.developer]);
      await web("GET", "/web/staff/me", developer.token);
      const created = await newCommission(customer);
      await web(
        "POST",
        `/web/staff/commissions/${created.id}/assign`,
        manager.token,
        {
          expectedVersion: (await staffView(manager, created.id)).commission
            .version,
          userId: developer.userId,
        },
      );
      const add = (who: Person) =>
        web(
          "POST",
          `/web/staff/commissions/${created.id}/milestones`,
          who.token,
          { title: "TEST homepage design" },
        );
      expect((await add(otherDev)).statusCode).toBe(404);
      const added = await add(developer);
      expect(added.statusCode).toBe(200);
      const milestoneId = added.json().milestoneId as string;
      expect(
        (
          await web(
            "POST",
            `/web/staff/commissions/${created.id}/milestones/${milestoneId}`,
            developer.token,
            { status: "done" },
          )
        ).statusCode,
      ).toBe(200);
      const view = (
        await web(
          "GET",
          `/web/workspace/commissions/${created.id}`,
          customer.token,
        )
      ).json();
      expect(view.milestones).toMatchObject([
        { title: "TEST homepage design", status: "done" },
      ]);
      const feed = (
        await web("GET", "/web/account/notifications", customer.token)
      ).json();
      expect(
        feed.notifications.some((n: { text: string }) =>
          n.text.includes("milestone"),
        ),
      ).toBe(true);
    });
  });

  describe("protected downloads", () => {
    const setupFile = async () => {
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { createHash } = await import("node:crypto");
      const dir = mkdtempSync(join(tmpdir(), "kush-dl-"));
      process.env.KUSH_DOWNLOADS_DIR = dir;
      const product = (
        await pool.query<{ id: string }>(
          "INSERT INTO products(tenant_id,slug,name,status) VALUES($1,$2,'TEST Download Product','active') RETURNING id",
          [tenantId, `test-dl-${Date.now()}`],
        )
      ).rows[0]!.id;
      const storageKey = randomUUID();
      const bytes = Buffer.from("TEST download payload");
      writeFileSync(join(dir, storageKey), bytes);
      const file = (
        await pool.query<{ id: string }>(
          `INSERT INTO product_files(tenant_id,product_id,version,filename,size_bytes,sha256,storage_key)
           VALUES($1,$2,'1.0.0','kush-test.zip',$3,$4,$5) RETURNING id`,
          [
            tenantId,
            product,
            bytes.length,
            createHash("sha256").update(bytes).digest("hex"),
            storageKey,
          ],
        )
      ).rows[0]!.id;
      return { product, file, bytes };
    };
    const grant = (userId: string, product: string, status = "active") =>
      pool
        .query(
          `INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer') ON CONFLICT DO NOTHING;`,
          [tenantId, userId],
        )
        .then(() =>
          pool.query(
            `INSERT INTO entitlements(tenant_id,user_id,product_id,status,source,source_reference) VALUES($1,$2,$3,$4,'manual',$5) RETURNING id`,
            [tenantId, userId, product, status, `test-${randomUUID()}`],
          ),
        );
    const redeem = (token: string) =>
      app.inject({
        method: "GET",
        url: `/web/downloads/${token}`,
        headers: { "x-kush-website-secret": WEBSITE },
      });

    it("lets only owners download, with signed links checked at use", async () => {
      const { product, file, bytes } = await setupFile();
      const owner = await person([], { mfa: false });
      const other = await person([], { mfa: false });
      const entitlement = (await grant(owner.userId, product)).rows[0]
        .id as string;

      expect(
        (await web("GET", "/web/account/downloads", other.token)).json().files,
      ).toEqual([]);
      expect(
        (await web("POST", `/web/account/downloads/${file}/link`, other.token))
          .statusCode,
      ).toBe(404);
      // Staff role alone grants nothing.
      const staffer = await person([ROLE.owner]);
      expect(
        (
          await web(
            "POST",
            `/web/account/downloads/${file}/link`,
            staffer.token,
          )
        ).statusCode,
      ).toBe(404);

      const listed = (
        await web("GET", "/web/account/downloads", owner.token)
      ).json().files;
      expect(listed).toMatchObject([
        { id: file, filename: "kush-test.zip", version: "1.0.0" },
      ]);
      const { token } = (
        await web("POST", `/web/account/downloads/${file}/link`, owner.token)
      ).json();
      const ok = await redeem(token);
      expect(ok.statusCode).toBe(200);
      expect(ok.rawPayload.equals(bytes)).toBe(true);
      expect(ok.headers["content-disposition"]).toContain("kush-test.zip");

      // A tampered token is refused, and so is the API without the website.
      const raw = Buffer.from(token, "base64url");
      Buffer.from(other.userId.replace(/-/g, ""), "hex").copy(raw, 16); // swap the user
      const forged = raw.toString("base64url");
      expect((await redeem(forged)).statusCode).toBe(403);
      expect(
        (await app.inject({ method: "GET", url: `/web/downloads/${token}` }))
          .statusCode,
      ).toBe(401);

      // Revoking ownership stops an already-issued link working.
      await pool.query("UPDATE entitlements SET status='revoked' WHERE id=$1", [
        entitlement,
      ]);
      expect((await redeem(token)).statusCode).toBe(403);
      const events = await pool.query(
        "SELECT kind FROM download_events WHERE file_id=$1 ORDER BY created_at",
        [file],
      );
      expect(events.rows.map((r) => r.kind)).toEqual([
        "link_issued",
        "downloaded",
        "denied",
      ]);
    });

    it("rejects expired links", async () => {
      const { signDownload } = await import("../src/downloads.js");
      const { product, file } = await setupFile();
      const owner = await person([], { mfa: false });
      await grant(owner.userId, product);
      const expired = signDownload(
        file,
        owner.userId,
        Math.floor(Date.now() / 1000) - 1,
      );
      expect((await redeem(expired)).statusCode).toBe(403);
    });
  });

  it("gives the website the same moderation, vouch and offboarding actions as Discord", async () => {
    const mod = await person([ROLE.moderator]);
    const support = await person([ROLE.support]);
    const admin = await person([ROLE.admin]);
    const leaver = await person([ROLE.support]);
    // Touch the staff dashboard so each is on the team roster.
    for (const who of [mod, support, admin, leaver])
      expect((await web("GET", "/web/staff/me", who.token)).statusCode).toBe(
        200,
      );

    // Moderation cases: moderators yes, support no.
    expect(
      (await web("GET", "/web/staff/moderation/cases", mod.token)).statusCode,
    ).toBe(200);
    expect(
      (await web("GET", "/web/staff/moderation/cases", support.token))
        .statusCode,
    ).toBe(403);

    // Vouches: removing one queues the Discord message deletion for the bot.
    const vouch = (
      await pool.query<{ number: number }>(
        `WITH n AS (UPDATE support_tenants SET next_vouch_number=next_vouch_number+1 WHERE id=$1 RETURNING next_vouch_number-1 AS number)
         INSERT INTO vouches(tenant_id,number,discord_user_id,author_name,rating,body,message_id)
         SELECT $1,n.number,$2,'TEST Customer',5,'TEST a genuinely great job','723456789012345601' FROM n RETURNING number`,
        [tenantId, discordId()],
      )
    ).rows[0]!.number;
    expect(
      (await web("GET", "/web/staff/vouches", support.token)).statusCode,
    ).toBe(403);
    const listed = await web("GET", "/web/staff/vouches", mod.token);
    expect(
      listed.json().vouches.some((v: { number: number }) => v.number === vouch),
    ).toBe(true);
    expect(
      (await web("POST", `/web/staff/vouches/${vouch}/hide`, mod.token))
        .statusCode,
    ).toBe(200);
    const deletion = await pool.query(
      "SELECT detail FROM notification_jobs WHERE tenant_id=$1 AND kind='vouch.hidden' AND dedupe_key=$2",
      [tenantId, `vouch.hidden:${vouch}`],
    );
    expect(deletion.rows[0]?.detail).toMatchObject({
      messageId: "723456789012345601",
    });

    // Offboarding: admins only, never yourself, and the bot gets a job.
    const reason = { reason: "TEST moved on" };
    expect(
      (
        await web(
          "POST",
          `/web/staff/team/${leaver.userId}/offboard`,
          mod.token,
          reason,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await web(
          "POST",
          `/web/staff/team/${admin.userId}/offboard`,
          admin.token,
          reason,
        )
      ).statusCode,
    ).toBe(400);
    const done = await web(
      "POST",
      `/web/staff/team/${leaver.userId}/offboard`,
      admin.token,
      reason,
    );
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ recorded: true });
    const job = await pool.query(
      "SELECT detail FROM notification_jobs WHERE tenant_id=$1 AND kind='staff.offboarded' AND subject_id=$2",
      [tenantId, leaver.userId],
    );
    expect(job.rows[0]?.detail).toMatchObject({
      discordUserId: leaver.discordId,
      reason: "TEST moved on",
    });
    // Already offboarded: a second attempt is refused.
    expect(
      (
        await web(
          "POST",
          `/web/staff/team/${leaver.userId}/offboard`,
          admin.token,
          reason,
        )
      ).statusCode,
    ).toBe(404);
  });

  it("never grants product ownership for being staff", async () => {
    const owner = await person([ROLE.owner]);
    await web("GET", "/web/staff/me", owner.token);
    const entitlements = await pool.query(
      "SELECT 1 FROM entitlements WHERE user_id=$1",
      [owner.userId],
    );
    expect(entitlements.rowCount).toBe(0);
  });

  it("lets administrators sell, refund and report, without double refunds", async () => {
    const admin = await person([ROLE.admin]);
    const manager = await person([ROLE.manager]);
    const customer = await person([], { mfa: false });
    const product = {
      slug: `test-pack-${randomBytes(3).toString("hex")}`,
      name: "TEST Starter pack",
      pricePence: 2_000,
      status: "active",
    };
    // Only roles with products.manage can create products; it syncs to Stripe.
    expect(
      (await web("POST", "/web/staff/products", manager.token, product))
        .statusCode,
    ).toBe(403);
    const created = await web(
      "POST",
      "/web/staff/products",
      admin.token,
      product,
    );
    expect(created.statusCode).toBe(200);
    const listed = (
      await web("GET", "/web/staff/products", admin.token)
    ).json();
    expect(listed.payments).toBe("test");
    expect(
      listed.products.find((p: { slug: string }) => p.slug === product.slug),
    ).toMatchObject({ inStripe: true, pricePence: 2_000 });

    // The customer buys it; Stripe's signed webhook marks it paid.
    const bought = await web(
      "POST",
      "/web/workspace/checkout/product",
      customer.token,
      { productSlug: product.slug, requestId: randomUUID(), useCredit: false },
    );
    const { order } = bought.json();
    const session = (
      await pool.query<{ s: string }>(
        "SELECT stripe_checkout_session_id AS s FROM orders WHERE id=$1",
        [order.id],
      )
    ).rows[0]!.s;
    const intent = `pi_test_${randomBytes(6).toString("hex")}`;
    const deliver = (type: string, object: object) => {
      const signed = stripe.sign({
        id: `evt_${randomBytes(8).toString("hex")}`,
        object: "event",
        type,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        data: { object },
      });
      return app.inject({
        method: "POST",
        url: "/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signed.signature,
        },
        payload: signed.payload,
      });
    };
    await deliver("checkout.session.completed", {
      id: session,
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 2_000,
      currency: "gbp",
      payment_intent: intent,
      metadata: { kush_order_id: order.id, kush_tenant_id: tenantId },
    });
    const staffOrder = (id: string) =>
      web("GET", `/web/staff/orders/${id}`, admin.token);
    expect((await staffOrder(order.id)).json().order.status).toBe("paid");

    // Managers can see orders but not refund them.
    const refund = (
      who: Person,
      amountPence: number,
      requestId = randomUUID(),
    ) =>
      web("POST", `/web/staff/orders/${order.id}/refund`, who.token, {
        amountPence,
        reason: "TEST partial refund",
        requestId,
      });
    expect((await staffOrder(order.id)).statusCode).toBe(200);
    expect((await refund(manager, 500)).statusCode).toBe(403);
    // More than was paid is refused.
    expect((await refund(admin, 2_001)).statusCode).toBe(400);
    const requestId = randomUUID();
    expect((await refund(admin, 500, requestId)).json()).toMatchObject({
      status: "succeeded",
    });
    // A retry with the same request ID refunds nothing more.
    expect((await refund(admin, 500, requestId)).json()).toMatchObject({
      duplicate: true,
    });
    // Two staff refunding the remaining £15 at once: only one gets it.
    const racing = await Promise.all([
      refund(admin, 1_500),
      refund(admin, 1_500),
    ]);
    // The loser sees "too much" (400) or "already refunded" (409).
    const codes = racing.map((r) => r.statusCode).sort();
    expect(codes[0]).toBe(200);
    expect([400, 409]).toContain(codes[1]);
    expect(
      stripe.refunds.filter((r) => r.paymentIntentId === intent),
    ).toHaveLength(2);
    // Stripe then reports the total refunded: already booked, not counted twice.
    await deliver("charge.refunded", {
      id: `ch_${randomBytes(6).toString("hex")}`,
      object: "charge",
      payment_intent: intent,
      amount_refunded: 2_000,
    });
    expect((await staffOrder(order.id)).json().order).toMatchObject({
      status: "refunded",
      refundedPence: 2_000,
    });

    const stats = (await web("GET", "/web/staff/stats", manager.token)).json();
    expect(stats).toMatchObject({ refundsPence: expect.any(Number) });
    expect(stats.refundsPence).toBeGreaterThanOrEqual(2_000);
    expect(
      (
        await web(
          "GET",
          "/web/staff/stats",
          (await person([ROLE.support])).token,
        )
      ).statusCode,
    ).toBe(403);
  });

  it("runs commission and customer tools from Discord on live roles", async () => {
    const customer = await person([], { mfa: false });
    const manager = await person([ROLE.manager], { mfa: false });
    const developer = await person([ROLE.developer], { mfa: false });
    const support = await person([ROLE.support], { mfa: false });
    const admin = await person([ROLE.admin], { mfa: false });
    const created = (
      await web("POST", "/web/workspace/commissions", customer.token, {
        requestId: randomUUID(),
        category: "gaming",
        title: "TEST Rust server config",
        details: "TEST: loot tables and a custom kit for a small server.",
        approximateBudget: null,
        preferredTimeframe: null,
      })
    ).json().commission as { id: string };
    const ticket = (
      await pool.query<{ number: number }>(
        "SELECT t.number FROM commercial_requests r JOIN support_tickets t ON t.id=r.ticket_id WHERE r.id=$1",
        [created.id],
      )
    ).rows[0]!.number;
    const bot = (method: "GET" | "POST", path: string, payload?: object) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}/staff${path}`,
        headers: {
          "x-kush-discord-secret": BOT_SECRET,
          "x-kush-discord-guild-id": STAFF_GUILD,
        },
        ...(payload ? { payload } : {}),
      });
    const find = (who: Person) =>
      bot(
        "GET",
        `/commissions/find?actorDiscordId=${who.discordId}&ticket=${ticket}`,
      );

    // No staff role, no access; the bot's own role check is not trusted.
    expect((await find(customer)).statusCode).toBe(403);
    // Developers only see commissions assigned to them.
    expect((await find(developer)).statusCode).toBe(404);
    const found = await find(manager);
    expect(found.statusCode).toBe(200);
    expect(found.json().commission).toMatchObject({
      id: created.id,
      ticketNumber: ticket,
      status: "submitted",
    });

    const quote = (who: Person) =>
      bot("POST", "/commissions/quote", {
        actorDiscordId: who.discordId,
        ticket,
        amountPence: 12_000,
        summary: "TEST: configs, one kit, one revision round.",
      });
    expect((await quote(manager)).statusCode).toBe(409); // not reviewed yet
    expect(
      (
        await bot("POST", "/commissions/status", {
          actorDiscordId: manager.discordId,
          ticket,
          status: "reviewing",
        })
      ).statusCode,
    ).toBe(200);
    expect((await quote(developer)).statusCode).toBe(404);
    const quoted = await quote(manager);
    expect(quoted.statusCode).toBe(200);
    expect(quoted.json()).toMatchObject({
      amount: "£120",
      ticketNumber: ticket,
    });
    // A status Discord can't set directly (only paying moves it to paid).
    expect(
      (
        await bot("POST", "/commissions/status", {
          actorDiscordId: manager.discordId,
          ticket,
          status: "paid",
        })
      ).statusCode,
    ).toBe(400);

    // Assign: the developer becomes known by using a staff command once.
    await bot(
      "GET",
      `/commissions?actorDiscordId=${developer.discordId}&scope=assigned`,
    );
    const assigned = await bot("POST", "/commissions/assign", {
      actorDiscordId: manager.discordId,
      ticket,
      assigneeDiscordId: developer.discordId,
    });
    expect(assigned.json()).toMatchObject({ assigned: true });
    expect((await find(developer)).statusCode).toBe(200);
    const mine = (
      await bot(
        "GET",
        `/commissions?actorDiscordId=${developer.discordId}&scope=assigned`,
      )
    ).json().commissions;
    expect(mine.map((c: { id: string }) => c.id)).toContain(created.id);
    expect(mine[0].ticketNumber).toBeTypeOf("number");
    // Seeing everyone's needs commissions.manage.
    expect(
      (
        await bot(
          "GET",
          `/commissions?actorDiscordId=${developer.discordId}&scope=all`,
        )
      ).statusCode,
    ).toBe(403);

    // Customer lookup and stats need their own permissions.
    expect(
      (
        await bot(
          "GET",
          `/customers/${customer.discordId}?actorDiscordId=${support.discordId}`,
        )
      ).statusCode,
    ).toBe(403);
    const lookup = await bot(
      "GET",
      `/customers/${customer.discordId}?actorDiscordId=${manager.discordId}`,
    );
    expect(lookup.json().customer).toMatchObject({
      activeCommissions: 1,
      creditPence: 0,
    });
    expect(
      (await bot("GET", `/stats?actorDiscordId=${support.discordId}`))
        .statusCode,
    ).toBe(403);
    const stats = (
      await bot("GET", `/stats?actorDiscordId=${admin.discordId}`)
    ).json().stats;
    expect(stats.openQuotes).toBeGreaterThanOrEqual(1);

    // Discord roles vanish → access is gone at once.
    guild.roles.set(manager.discordId, []);
    expect((await find(manager)).statusCode).toBe(403);
  });

  it("grants and revokes allowlisted roles from the website and Discord alike", async () => {
    const customer = await person([], { mfa: false });
    const manager = await person([ROLE.manager]);
    const support = await person([ROLE.support]);
    const grant = (who: Person, payload: object, userId = customer.userId) =>
      web("POST", `/web/staff/customers/${userId}/roles`, who.token, {
        requestId: randomUUID(),
        reason: "TEST beta access",
        ...payload,
      });
    expect(
      (await grant(support, { roleKey: "beta-tester", action: "grant" }))
        .statusCode,
    ).toBe(403);
    // Staff roles are never grantable here.
    expect(
      (await grant(manager, { roleKey: "administrator", action: "grant" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await grant(
          manager,
          { roleKey: "beta-tester", action: "grant" },
          manager.userId,
        )
      ).statusCode,
    ).toBe(409);
    const requestId = randomUUID();
    const granted = await grant(manager, {
      roleKey: "beta-tester",
      action: "grant",
      requestId,
    });
    expect(granted.json()).toMatchObject({
      state: "granted",
      duplicate: false,
    });
    expect(
      (
        await grant(manager, {
          roleKey: "beta-tester",
          action: "grant",
          requestId,
        })
      ).json(),
    ).toMatchObject({ duplicate: true });

    // The bot's role sync sees it, and a sync job was queued.
    const desired = (
      await app.inject({
        method: "GET",
        url: `/discord/integration/tenants/${tenantId}/members/${customer.discordId}/roles`,
        headers: {
          "x-kush-discord-secret": BOT_SECRET,
          "x-kush-discord-guild-id": STAFF_GUILD,
        },
      })
    ).json();
    expect(desired.grantedRoleKeys).toEqual(["beta-tester"]);
    const jobs = await pool.query(
      "SELECT reason FROM role_sync_jobs WHERE tenant_id=$1 AND discord_user_id=$2",
      [tenantId, customer.discordId],
    );
    expect(jobs.rows[0]?.reason).toContain("staff-role:beta-tester");

    // Discord's /staff role runs the same operation.
    const revoked = await app.inject({
      method: "POST",
      url: `/discord/integration/tenants/${tenantId}/staff/roles`,
      headers: {
        "x-kush-discord-secret": BOT_SECRET,
        "x-kush-discord-guild-id": STAFF_GUILD,
      },
      payload: {
        actorDiscordId: manager.discordId,
        discordUserId: customer.discordId,
        roleKey: "beta-tester",
        action: "revoke",
        reason: "TEST beta ended",
        requestId: randomUUID(),
      },
    });
    expect(revoked.json()).toMatchObject({ state: "revoked" });

    const view = (
      await web("GET", `/web/staff/customers/${customer.userId}`, manager.token)
    ).json();
    expect(view.customer.discordId).toBe(customer.discordId);
    expect(view.roles.grants).toMatchObject([
      { roleKey: "beta-tester", state: "revoked" },
    ]);
    expect(view.roles.history.map((h: { source: string }) => h.source)).toEqual(
      ["discord", "website"],
    );
    expect(view.can).toEqual({ adjustCredit: false, manageRoles: true });
    expect(view.credit.balancePence).toBe(0);
    expect(
      (
        await web(
          "GET",
          `/web/staff/customers/${customer.userId}`,
          support.token,
        )
      ).statusCode,
    ).toBe(403);
  });

  it("sets ticket priority from the website, only once claimed", async () => {
    const customer = await person([], { mfa: false });
    const agent = await person([ROLE.support]);
    const ticket = await openTicket(customer, "technical");
    const setPriority = (version: number) =>
      web("POST", `/web/staff/tickets/${ticket.id}/priority`, agent.token, {
        expectedVersion: version,
        priority: "urgent",
      });
    expect((await setPriority(ticket.version)).statusCode).toBe(403);
    const claimed = await web(
      "POST",
      `/web/staff/tickets/${ticket.id}/claim`,
      agent.token,
      {
        expectedVersion: ticket.version,
      },
    );
    expect(claimed.statusCode).toBe(200);
    const current = (
      await web("GET", `/web/staff/tickets/${ticket.id}`, agent.token)
    ).json().ticket;
    expect((await setPriority(current.version)).json()).toEqual({
      priority: "urgent",
    });
    expect((await setPriority(current.version)).statusCode).toBe(409); // stale version
  });
});
