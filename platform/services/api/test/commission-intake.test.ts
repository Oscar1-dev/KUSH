import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const SECRET = "test-integration-secret-32-characters!!";
const GUILD = "923456789012345699";
const LINKED = "623456789012345671";
const UNLINKED = "623456789012345672";

describe.skipIf(!databaseUrl)(
  "commission intake from Discord (real PostgreSQL)",
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let pool: ReturnType<typeof createDatabase>["pool"];
    let tenantId: string;
    let userId: string;
    const previous = process.env.KUSH_DISCORD_INTEGRATION_SECRET;

    const submit = (discordUserId: string, extra: object = {}) =>
      app.inject({
        method: "POST",
        url: `/discord/integration/tenants/${tenantId}/commissions`,
        headers: {
          "x-kush-discord-secret": SECRET,
          "x-kush-discord-guild-id": GUILD,
        },
        payload: {
          discordUserId,
          requestId: randomUUID(),
          category: "discord",
          serviceTier: "standard",
          title: "TEST ticket bot",
          details:
            "TEST a ticket bot with categories, transcripts and a staff queue.",
          approximateBudget: "£150",
          preferredTimeframe: "No rush",
          referenceLinks: "https://example.test/ref",
          contactPreference: "Discord DMs",
          ...extra,
        },
      });

    beforeAll(async () => {
      process.env.KUSH_DISCORD_INTEGRATION_SECRET = SECRET;
      pool = createDatabase(databaseUrl!).pool;
      app = await buildApp(databaseUrl!);
      tenantId = (
        await pool.query<{ id: string }>(
          "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
          [
            "TEST intake",
            GUILD,
            JSON.stringify({
              categories: [{ key: "commission", label: "Commission" }],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0]!.id;
      userId = (
        await pool.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,role,display_name) VALUES($1,'x','customer','TEST Linked') RETURNING id",
          [`test-intake-${Date.now()}@example.test`],
        )
      ).rows[0]!.id;
      await pool.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')",
        [tenantId, userId],
      );
      await pool.query(
        `INSERT INTO discord_account_links(tenant_id,user_id,discord_user_id,state,code_hash,request_id,expires_at,verified_at)
       VALUES($1,$2,$3,'verified','test',$4,now(),now())`,
        [tenantId, userId, LINKED, randomUUID()],
      );
    });

    afterAll(async () => {
      if (previous === undefined)
        delete process.env.KUSH_DISCORD_INTEGRATION_SECRET;
      else process.env.KUSH_DISCORD_INTEGRATION_SECRET = previous;
      await app?.close();
      await pool?.end();
    });

    it("asks unlinked members to link their account first", async () => {
      const response = await submit(UNLINKED);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toContain("!account");
    });

    it("creates the same commission record as the website, with a linked ticket", async () => {
      const response = await submit(LINKED);
      expect(response.statusCode).toBe(200);
      const row = (
        await pool.query(
          "SELECT requester_id, category, service_tier, reference_links, contact_preference, origin, ticket_id, status FROM commercial_requests WHERE id=$1",
          [response.json().id],
        )
      ).rows[0];
      expect(row).toMatchObject({
        requester_id: userId,
        category: "discord",
        service_tier: "standard",
        reference_links: "https://example.test/ref",
        contact_preference: "Discord DMs",
        origin: "discord",
        status: "submitted",
      });
      expect(row.ticket_id).not.toBeNull();
      const jobs = (
        await pool.query(
          "SELECT kind FROM notification_jobs WHERE tenant_id=$1 ORDER BY created_at",
          [tenantId],
        )
      ).rows.map((r: { kind: string }) => r.kind);
      // Staff are told, and the linked ticket gets its private Discord channel.
      expect(jobs).toContain("commission.created");
      expect(jobs).toContain("ticket.created");
    });

    it("rejects unknown services and the wrong guild", async () => {
      expect((await submit(LINKED, { category: "rockets" })).statusCode).toBe(
        400,
      );
      const wrong = await app.inject({
        method: "POST",
        url: `/discord/integration/tenants/${tenantId}/commissions`,
        headers: {
          "x-kush-discord-secret": SECRET,
          "x-kush-discord-guild-id": "923456789012340000",
        },
        payload: {},
      });
      expect(wrong.statusCode).toBe(404);
    });
  },
);
