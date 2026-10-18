import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const SECRET = "test-integration-secret-32-characters!!";
const GUILD = "223456789012345678";

const discordId = () =>
  `${Date.now()}${Math.floor(Math.random() * 1e6)}`
    .padEnd(18, "7")
    .slice(0, 18);

describe.skipIf(!databaseUrl)("Discord ticket system (real PostgreSQL)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pool: ReturnType<typeof createDatabase>["pool"];
  let tenantId: string;
  let ownerToken: string;
  const previousSecret = process.env.KUSH_DISCORD_INTEGRATION_SECRET;
  const people = {
    guestA: discordId(),
    guestB: discordId(),
    staff: discordId(),
    otherStaff: discordId(),
    moderator: discordId(),
    owner: discordId(),
  };
  const userIds: Record<string, string> = {};

  const as = (
    who: string,
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    payload?: object,
    overrides: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/discord/integration/tenants/${tenantId}${path}`,
      headers: {
        "x-kush-discord-secret": SECRET,
        "x-kush-discord-guild-id": GUILD,
        "x-kush-discord-user-id": who,
        ...overrides,
      },
      ...(payload ? { payload } : {}),
    });

  const createTicket = (
    who: string,
    category = "technical",
    requestId = randomUUID(),
  ) =>
    as(who, "POST", "/tickets", {
      requestId,
      category,
      description: "TEST ONLY: automated Discord ticket test",
    });

  beforeAll(async () => {
    process.env.KUSH_DISCORD_INTEGRATION_SECRET = SECRET;
    pool = createDatabase(databaseUrl!).pool;
    app = await buildApp(databaseUrl!);
    tenantId = (
      await pool.query<{ id: string }>(
        "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
        [
          "TEST discord tickets",
          GUILD,
          JSON.stringify({
            categories: [
              { key: "technical", label: "Technical issue" },
              { key: "member-report", label: "Member report" },
            ],
            retentionDays: null,
            allowReopen: true,
          }),
        ],
      )
    ).rows[0]!.id;
    for (const [name, role, tenantRole] of [
      ["owner", "admin", "owner"],
      ["staff", "operator", "staff"],
      ["otherStaff", "operator", "staff"],
      ["moderator", "operator", "moderator"],
    ] as const) {
      const id = randomUUID();
      userIds[name] = id;
      await pool.query(
        "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'test',$3)",
        [id, `${id}@test.invalid`, role],
      );
      await pool.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,$3)",
        [tenantId, id, tenantRole],
      );
      await pool.query(
        `INSERT INTO discord_account_links(tenant_id,user_id,discord_user_id,state,code_hash,request_id,expires_at,verified_at)
         VALUES($1,$2,$3,'verified','test',$4,now(),now())`,
        [tenantId, id, people[name], randomUUID()],
      );
    }
    ownerToken = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [tokenHash(ownerToken), userIds.owner],
    );
  });

  afterAll(async () => {
    if (previousSecret === undefined)
      delete process.env.KUSH_DISCORD_INTEGRATION_SECRET;
    else process.env.KUSH_DISCORD_INTEGRATION_SECRET = previousSecret;
    await app?.close();
    await pool?.end();
  });

  it("rejects unauthenticated calls and the wrong guild", async () => {
    expect(
      (
        await as(people.guestA, "GET", "/tickets", undefined, {
          "x-kush-discord-secret": "x".repeat(SECRET.length),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await as(people.guestA, "GET", "/tickets", undefined, {
          "x-kush-discord-guild-id": "999999999999999999",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("lets a member without a KUSH account open a ticket through a Discord identity", async () => {
    const requestId = randomUUID();
    const first = await createTicket(people.guestB, "technical", requestId);
    expect(first.statusCode).toBe(201);
    const ticket = first.json().ticket;
    expect(first.json().queue).toBe("support");
    const retry = await createTicket(people.guestB, "technical", requestId);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().ticket.number).toBe(ticket.number);

    const identity = await pool.query<{
      email: string;
      kind: string;
      role: string;
    }>(
      `SELECT u.email,u.kind,u.role FROM discord_identities d JOIN users u ON u.id=d.user_id
       WHERE d.tenant_id=$1 AND d.discord_user_id=$2`,
      [tenantId, people.guestB],
    );
    expect(identity.rows[0]).toMatchObject({
      kind: "discord",
      role: "customer",
    });

    // The identity can never sign in, and is not listed as a staff account.
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: identity.rows[0]!.email,
        password: "DISCORD_IDENTITY_NO_LOGIN",
      },
    });
    expect(login.statusCode).toBe(401);
    const admins = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(JSON.stringify(admins.json())).not.toContain("discord.invalid");
  });

  it("limits open tickets per member", async () => {
    const member = discordId();
    for (let index = 0; index < 3; index += 1)
      expect((await createTicket(member)).statusCode).toBe(201);
    const blocked = await createTicket(member);
    expect(blocked.statusCode).toBe(429);
  });

  it("keeps tickets private between customers and maps channels", async () => {
    const created = (await createTicket(people.guestA)).json().ticket;
    const channelId = "323456789012345678";
    expect(
      (
        await as(people.guestA, "PUT", `/tickets/${created.id}/channel`, {
          channelId,
          queue: "support",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await as(people.guestA, "GET", `/tickets/by-channel/${channelId}`))
        .statusCode,
    ).toBe(200);
    expect(
      (await as(people.guestB, "GET", `/tickets/by-channel/${channelId}`))
        .statusCode,
    ).toBe(404);
    expect(
      (await as(people.guestB, "GET", `/tickets/${created.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await as(people.guestB, "PUT", `/tickets/${created.id}/channel`, {
          channelId: "423456789012345678",
          queue: "support",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("runs the staff lifecycle: queue, claim, replies, notes, transcript, close, reopen", async () => {
    const ticket = (await createTicket(people.guestA)).json().ticket;
    const report = (await createTicket(people.guestB, "member-report")).json();
    expect(report.queue).toBe("reports");

    const staffQueue = (await as(people.staff, "GET", "/queue")).json().queue;
    expect(
      staffQueue.map((item: { ticketId: string }) => item.ticketId),
    ).toContain(ticket.id);
    expect(
      staffQueue.map((item: { ticketId: string }) => item.ticketId),
    ).not.toContain(report.ticket.id);
    expect(JSON.stringify(staffQueue)).not.toContain("TEST ONLY");

    const modQueue = (await as(people.moderator, "GET", "/queue")).json().queue;
    expect(modQueue.map((item: { ticketId: string }) => item.ticketId)).toEqual(
      [report.ticket.id],
    );

    // Staff cannot see or claim reports; moderators cannot see support tickets.
    expect(
      (await as(people.staff, "POST", `/tickets/${report.ticket.id}/claim`))
        .statusCode,
    ).toBe(404);
    expect(
      (await as(people.moderator, "POST", `/tickets/${ticket.id}/claim`))
        .statusCode,
    ).toBe(404);
    expect(
      (await as(people.moderator, "POST", `/tickets/${report.ticket.id}/claim`))
        .statusCode,
    ).toBe(200);
    expect(
      (await as(people.moderator, "GET", "/tickets"))
        .json()
        .tickets.map((item: { id: string }) => item.id),
    ).not.toContain(ticket.id);

    // Unassigned staff cannot read; claiming grants access; a second claim conflicts.
    expect(
      (await as(people.staff, "GET", `/tickets/${ticket.id}`)).statusCode,
    ).toBe(404);
    const claimed = await as(
      people.staff,
      "POST",
      `/tickets/${ticket.id}/claim`,
    );
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().ticket.assignedUserId).toBe(userIds.staff);
    // Losing a claim race says so (the queue already showed the ticket exists),
    // but the other staff member still cannot read it.
    expect(
      (await as(people.otherStaff, "POST", `/tickets/${ticket.id}/claim`))
        .statusCode,
    ).toBe(409);
    expect(
      (await as(people.otherStaff, "GET", `/tickets/${ticket.id}`)).statusCode,
    ).toBe(404);

    let version = claimed.json().ticket.version;
    const note = await as(
      people.staff,
      "POST",
      `/tickets/${ticket.id}/messages`,
      {
        requestId: randomUUID(),
        expectedVersion: version,
        kind: "note",
        content: "INTERNAL NOTE: staff only",
      },
    );
    expect(note.statusCode).toBe(200);
    version = note.json().ticket.version;
    const staffReply = await as(
      people.staff,
      "POST",
      `/tickets/${ticket.id}/messages`,
      {
        requestId: randomUUID(),
        expectedVersion: version,
        kind: "reply",
        content: "Staff reply visible to the customer",
      },
    );
    version = staffReply.json().ticket.version;
    const customerNote = await as(
      people.guestA,
      "POST",
      `/tickets/${ticket.id}/messages`,
      {
        requestId: randomUUID(),
        expectedVersion: version,
        kind: "note",
        content: "customers cannot add notes",
      },
    );
    expect(customerNote.statusCode).toBe(403);
    const customerReply = await as(
      people.guestA,
      "POST",
      `/tickets/${ticket.id}/messages`,
      {
        requestId: randomUUID(),
        expectedVersion: version,
        kind: "reply",
        content: "Customer reply",
      },
    );
    expect(customerReply.statusCode).toBe(200);
    version = customerReply.json().ticket.version;

    const customerTranscript = JSON.stringify(
      (
        await as(people.guestA, "GET", `/tickets/${ticket.id}/transcript`)
      ).json(),
    );
    expect(customerTranscript).toContain("Staff reply visible");
    expect(customerTranscript).not.toContain("INTERNAL NOTE");
    const staffTranscript = JSON.stringify(
      (
        await as(people.staff, "GET", `/tickets/${ticket.id}/transcript`)
      ).json(),
    );
    expect(staffTranscript).toContain("INTERNAL NOTE");

    const priority = await as(people.staff, "PATCH", `/tickets/${ticket.id}`, {
      expectedVersion: version,
      priority: "high",
    });
    expect(priority.json().ticket.priority).toBe("high");
    version = priority.json().ticket.version;

    const closed = await as(
      people.staff,
      "POST",
      `/tickets/${ticket.id}/close`,
      {
        expectedVersion: version,
        confirm: true,
        reason: "Resolved in test",
      },
    );
    expect(closed.json().ticket.status).toBe("closed");
    const reopened = await as(
      people.guestA,
      "POST",
      `/tickets/${ticket.id}/reopen`,
      {
        expectedVersion: closed.json().ticket.version,
      },
    );
    expect(reopened.json().ticket.status).toBe("reopened");
  });

  // Regression (found in live E2E): unassigned staff could not claim by number
  // or channel because resolving the ticket applied assigned-only visibility.
  it("lets unassigned staff claim by ticket number and by channel", async () => {
    const byNumber = (await createTicket(people.guestB)).json().ticket;
    const claimedByNumber = await as(
      people.staff,
      "POST",
      `/tickets/by-number/${byNumber.number}/claim`,
    );
    expect(claimedByNumber.statusCode).toBe(200);
    expect(claimedByNumber.json().ticket.assignedUserId).toBe(userIds.staff);
    const lookup = await as(
      people.staff,
      "GET",
      `/tickets/by-number/${byNumber.number}`,
    );
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().ticket.id).toBe(byNumber.id);
    expect(
      (
        await as(
          people.otherStaff,
          "GET",
          `/tickets/by-number/${byNumber.number}`,
        )
      ).statusCode,
    ).toBe(404);

    const member = discordId();
    const byChannel = (await createTicket(member)).json().ticket;
    const channelId = "523456789012345678";
    await as(member, "PUT", `/tickets/${byChannel.id}/channel`, {
      channelId,
      queue: "support",
    });
    const claimedByChannel = await as(
      people.otherStaff,
      "POST",
      `/tickets/by-channel/${channelId}/claim`,
    );
    expect(claimedByChannel.statusCode).toBe(200);
    expect(claimedByChannel.json().ticket.assignedUserId).toBe(
      userIds.otherStaff,
    );

    // Reports stay out of reach for support staff even by number.
    const report = (await createTicket(member, "member-report")).json().ticket;
    expect(
      (
        await as(
          people.staff,
          "POST",
          `/tickets/by-number/${report.number}/claim`,
        )
      ).statusCode,
    ).toBe(404);
  });

  it("restricts assignment to the tenant owner and resolves Discord staff", async () => {
    const ticket = (await createTicket(people.guestA, "technical")).json()
      .ticket;
    const byStaff = await as(
      people.staff,
      "POST",
      `/tickets/${ticket.id}/assign`,
      {
        expectedVersion: ticket.version,
        assigneeDiscordUserId: people.otherStaff,
      },
    );
    expect(byStaff.statusCode).toBe(404); // Unassigned staff cannot even see it.
    const byOwner = await as(
      people.owner,
      "POST",
      `/tickets/${ticket.id}/assign`,
      {
        expectedVersion: ticket.version,
        assigneeDiscordUserId: people.otherStaff,
      },
    );
    expect(byOwner.statusCode).toBe(200);
    expect(byOwner.json().ticket.assignedUserId).toBe(userIds.otherStaff);
    const toModerator = await as(
      people.owner,
      "POST",
      `/tickets/${ticket.id}/assign`,
      {
        expectedVersion: byOwner.json().ticket.version,
        assigneeDiscordUserId: people.moderator,
      },
    );
    expect(toModerator.statusCode).toBe(400); // Moderators do not handle support tickets.
  });

  it("serves restart recovery data without ticket content", async () => {
    const response = await as(people.guestA, "GET", "/ticket-channels");
    expect(response.statusCode).toBe(200);
    const channels = response.json().channels;
    expect(channels.length).toBeGreaterThan(0);
    expect(channels[0]).toMatchObject({
      customerDiscordUserId: people.guestA,
      queue: "support",
    });
    expect(JSON.stringify(channels)).not.toContain("TEST ONLY");
    const archive = await as(
      people.guestA,
      "PATCH",
      `/ticket-channels/${channels[0].channelId}`,
      { state: "archived" },
    );
    expect(archive.statusCode).toBe(200);
    const after = (await as(people.guestA, "GET", "/ticket-channels")).json()
      .channels;
    expect(
      after.map((item: { channelId: string }) => item.channelId),
    ).not.toContain(channels[0].channelId);
  });

  it("gives moderators no access to commercial requests", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/discord/integration/tenants/${tenantId}/commercial-requests`,
      headers: {
        "x-kush-discord-secret": SECRET,
        "x-kush-discord-guild-id": GUILD,
        "x-kush-discord-user-id": people.moderator,
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
