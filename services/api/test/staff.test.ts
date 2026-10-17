import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import type { DiscordOAuth, DiscordProfile } from "../src/account-service.js";
import type { DiscordMembers, MemberLookup } from "../src/staff-access.js";
import { permissionsFor } from "../src/staff-access.js";
import { currentStep, totpCode } from "../src/totp.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const WEBSITE = "test-website-secret-at-least-32-chars!!";
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
    expect(permissionsFor(["moderator"])).toEqual(["reports.handle"]);
    expect(permissionsFor([])).toEqual([]);
  });
});

describe.skipIf(!databaseUrl)("staff dashboard (real PostgreSQL)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pool: ReturnType<typeof createDatabase>["pool"];
  let tenantId: string;
  const discord = new FakeDiscord();
  const guild = new FakeGuild();
  const previous = {
    website: process.env.KUSH_WEBSITE_SECRET,
    tenant: process.env.KUSH_SUPPORT_TENANT_ID,
    key: process.env.KUSH_MFA_KEY,
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
    pool = createDatabase(databaseUrl!).pool;
    app = await buildApp(databaseUrl!, false, {
      oauth: () => discord,
      members: () => guild,
    });
    tenantId = (
      await pool.query<{ id: string }>(
        "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
        [
          "TEST staff",
          "923456789012345672",
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
    // Manager walks it to "accepted" (review → quote → accepted).
    for (const status of ["reviewing", "quoted", "accepted"]) {
      v = (await commission(manager)).json().commission.version;
      expect(
        (await update(manager, { expectedVersion: v, status })).statusCode,
      ).toBe(200);
    }
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

  it("never grants product ownership for being staff", async () => {
    const owner = await person([ROLE.owner]);
    await web("GET", "/web/staff/me", owner.token);
    const entitlements = await pool.query(
      "SELECT 1 FROM entitlements WHERE user_id=$1",
      [owner.userId],
    );
    expect(entitlements.rowCount).toBe(0);
  });
});
