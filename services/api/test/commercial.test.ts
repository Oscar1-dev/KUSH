import { afterEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("M4 commercial request boundaries", () => {
  const previousSecret = process.env.KUSH_DISCORD_INTEGRATION_SECRET;
  afterEach(() => {
    if (previousSecret === undefined)
      delete process.env.KUSH_DISCORD_INTEGRATION_SECRET;
    else process.env.KUSH_DISCORD_INTEGRATION_SECRET = previousSecret;
  });

  it("isolates, deduplicates and reviews commercial requests and securely links Discord", async () => {
    process.env.KUSH_DISCORD_INTEGRATION_SECRET =
      "test-integration-secret-32-characters";
    const { pool } = createDatabase(databaseUrl!);
    const app = await buildApp(databaseUrl!);
    const users: string[] = [];
    const tenants: string[] = [];
    const headers: Record<string, { authorization: string }> = {};
    const ids: Record<string, string> = {};
    const call = (
      method: "GET" | "POST" | "PATCH",
      path: string,
      actor: string,
      payload?: object,
      extraHeaders?: Record<string, string>,
    ) =>
      app.inject({
        method,
        url: path,
        headers: { ...headers[actor], ...extraHeaders },
        ...(payload ? { payload } : {}),
      });
    try {
      for (const [name, role] of Object.entries({
        owner: "admin",
        outsider: "admin",
        staff: "operator",
        customer: "customer",
        otherCustomer: "customer",
      })) {
        const id = randomUUID();
        users.push(id);
        ids[name] = id;
        await pool.query(
          "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'test',$3)",
          [id, `${id}@test.invalid`, role],
        );
        const token = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [tokenHash(token), id],
        );
        headers[name] = { authorization: `Bearer ${token}` };
      }
      for (const owner of ["owner", "outsider"]) {
        const tenant = (
          await pool.query<{ id: string }>(
            "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
            [
              `TEST ${owner}`,
              owner === "owner" ? "123456789012345678" : null,
              JSON.stringify({
                categories: [{ key: "support", label: "Support" }],
                retentionDays: null,
                allowReopen: true,
              }),
            ],
          )
        ).rows[0]!;
        tenants.push(tenant.id);
        await pool.query(
          "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'owner')",
          [tenant.id, ids[owner]],
        );
      }
      const tenantId = tenants[0]!;
      for (const [name, role] of [
        ["staff", "staff"],
        ["customer", "customer"],
        ["otherCustomer", "customer"],
      ])
        await pool.query(
          "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,$3)",
          [tenantId, ids[name!], role],
        );
      const base = `/commercial/tenants/${tenantId}/requests`;
      const input = {
        requestId: randomUUID(),
        kind: "commission",
        title: "Website build",
        details: "Accessible company website",
        category: "web",
        approximateBudget: "£500-£1,000",
        preferredTimeframe: "Next quarter",
        productUrl: null,
      };
      const created = await call("POST", base, "customer", input);
      expect(created.statusCode, created.body).toBe(201);
      let request = created.json().request;
      const replay = await call("POST", base, "customer", input);
      expect(replay.statusCode).toBe(201);
      expect(replay.json().request.id).toBe(request.id);
      expect(
        (await call("POST", base, "customer", { ...input, title: "Changed" }))
          .statusCode,
      ).toBe(409);
      expect(
        (await call("GET", `${base}/${request.id}`, "otherCustomer"))
          .statusCode,
      ).toBe(404);
      expect(
        (await call("GET", `${base}/${request.id}`, "staff")).statusCode,
      ).toBe(404);
      expect(
        (
          await call(
            "GET",
            `/commercial/tenants/${tenants[1]}/requests/${request.id}`,
            "outsider",
          )
        ).statusCode,
      ).toBe(404);
      const assigned = await call("PATCH", `${base}/${request.id}`, "owner", {
        expectedVersion: request.version,
        assignedUserId: ids.staff,
        status: "reviewing",
        reviewNote: "Requirements review",
      });
      expect(assigned.statusCode, assigned.body).toBe(200);
      request = assigned.json().request;
      const customerView = await call(
        "GET",
        `${base}/${request.id}`,
        "customer",
      );
      expect(customerView.json().request.reviewNote).toBeNull();
      expect(
        (await call("GET", `${base}/${request.id}`, "staff")).statusCode,
      ).toBe(200);
      expect(
        (
          await call("PATCH", `${base}/${request.id}`, "customer", {
            expectedVersion: request.version,
            status: "quoted",
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await call("PATCH", `${base}/${request.id}`, "staff", {
            expectedVersion: request.version,
            status: "published",
          })
        ).statusCode,
      ).toBe(409);
      const quoted = await call("PATCH", `${base}/${request.id}`, "staff", {
        expectedVersion: request.version,
        status: "quoted",
      });
      expect(quoted.statusCode, quoted.body).toBe(200);

      const marketplace = {
        ...input,
        requestId: randomUUID(),
        kind: "marketplace",
        title: "Icon pack",
        category: "design",
        productUrl: "https://example.test/icon-pack",
      };
      const market = await call("POST", base, "customer", marketplace);
      expect(market.statusCode).toBe(201);
      expect(
        (
          await call("PATCH", `${base}/${market.json().request.id}`, "owner", {
            expectedVersion: 1,
            status: "published",
          })
        ).statusCode,
      ).toBe(409);

      const partner = await call("POST", base, "customer", {
        ...input,
        requestId: randomUUID(),
        kind: "partner",
        title: "Reseller partnership",
        category: "reseller",
        productUrl: "https://example.test/business",
      });
      expect(partner.statusCode, partner.body).toBe(201);
      const partnerList = await call("GET", `${base}?kind=partner`, "customer");
      expect(partnerList.json().requests).toHaveLength(1);

      const linkRequestId = randomUUID();
      const started = await call(
        "POST",
        `/discord/tenants/${tenantId}/links/start`,
        "customer",
        { requestId: linkRequestId },
      );
      expect(started.statusCode, started.body).toBe(200);
      const code = started.json().code as string;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
      expect(
        (
          await call(
            "POST",
            `/discord/tenants/${tenantId}/links/start`,
            "customer",
            { requestId: linkRequestId },
          )
        ).statusCode,
      ).toBe(409);
      const completePath = `/discord/integration/tenants/${tenantId}/links/complete`;
      const link = {
        code,
        discordUserId: "223456789012345678",
        guildId: "123456789012345678",
      };
      expect(
        (
          await call("POST", completePath, "customer", link, {
            "x-kush-discord-secret": "wrong",
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await call(
            "POST",
            completePath,
            "customer",
            { ...link, guildId: "323456789012345678" },
            {
              "x-kush-discord-secret": "test-integration-secret-32-characters",
            },
          )
        ).statusCode,
      ).toBe(404);
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const wrong = await call(
          "POST",
          completePath,
          "customer",
          {
            ...link,
            code: "AAAAAAAAAAAAAAAA",
            discordUserId: "423456789012345678",
          },
          { "x-kush-discord-secret": "test-integration-secret-32-characters" },
        );
        expect(wrong.statusCode).toBe(attempt >= 5 ? 429 : 400);
      }
      const linked = await call("POST", completePath, "customer", link, {
        "x-kush-discord-secret": "test-integration-secret-32-characters",
      });
      expect(linked.statusCode, linked.body).toBe(200);
      expect(linked.json().state).toBe("verified");
      expect(
        (
          await call("POST", completePath, "customer", link, {
            "x-kush-discord-secret": "test-integration-secret-32-characters",
          })
        ).statusCode,
      ).toBe(400);
      const botHeaders = {
        "x-kush-discord-secret": "test-integration-secret-32-characters",
        "x-kush-discord-user-id": link.discordUserId,
        "x-kush-discord-guild-id": link.guildId,
      };
      const ticketInput = {
        requestId: randomUUID(),
        category: "support",
        description: "Discord-created support request",
      };
      const botTicket = await call(
        "POST",
        `/discord/integration/tenants/${tenantId}/tickets`,
        "customer",
        ticketInput,
        botHeaders,
      );
      expect(botTicket.statusCode, botTicket.body).toBe(201);
      const ticket = botTicket.json().ticket;
      const reply = await call(
        "POST",
        `/discord/integration/tenants/${tenantId}/tickets/${ticket.id}/messages`,
        "customer",
        {
          requestId: randomUUID(),
          expectedVersion: ticket.version,
          kind: "reply",
          content: "Discord customer reply",
        },
        botHeaders,
      );
      expect(reply.statusCode, reply.body).toBe(200);
      expect(
        (
          await call(
            "GET",
            `/discord/integration/tenants/${tenantId}/tickets/${ticket.id}/transcript`,
            "customer",
            undefined,
            botHeaders,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await call(
            "POST",
            `/discord/integration/tenants/${tenantId}/commercial-requests`,
            "customer",
            { ...input, requestId: randomUUID(), title: "Discord commission" },
            botHeaders,
          )
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int count FROM commercial_requests WHERE tenant_id=$1",
            [tenantId],
          )
        ).rows[0].count,
      ).toBe(4);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int count FROM audit_events WHERE tenant_id=$1 AND action LIKE 'commercial.%'",
            [tenantId],
          )
        ).rows[0].count,
      ).toBeGreaterThan(0);
    } finally {
      await pool.query(
        "DELETE FROM discord_link_attempts WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM discord_account_links WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM commercial_requests WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_events WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_messages WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[]) OR actor_id=ANY($2::uuid[])",
        [tenants, users],
      );
      await pool.query(
        "DELETE FROM support_members WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query("DELETE FROM support_tenants WHERE id=ANY($1::uuid[])", [
        tenants,
      ]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      await app.close();
      await pool.end();
    }
  });
});
