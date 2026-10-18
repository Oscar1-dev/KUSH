import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const SECRET = "test-integration-secret-32-characters!!";
const GUILD = "923456789012345688";
const TARGET = "523456789012345671";
const OTHER = "523456789012345672";
const MOD = "523456789012345673";

describe.skipIf(!databaseUrl)(
  "vouches and offboarding (real PostgreSQL)",
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let pool: ReturnType<typeof createDatabase>["pool"];
    let tenantId: string;
    const previous = process.env.KUSH_DISCORD_INTEGRATION_SECRET;

    const bot = (
      method: "GET" | "POST",
      path: string,
      payload?: object,
      guild = GUILD,
    ) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}${path}`,
        headers: {
          "x-kush-discord-secret": SECRET,
          "x-kush-discord-guild-id": guild,
        },
        ...(payload ? { payload } : {}),
      });

    beforeAll(async () => {
      process.env.KUSH_DISCORD_INTEGRATION_SECRET = SECRET;
      const previousTenant = process.env.KUSH_SUPPORT_TENANT_ID;
      restoreTenant = () => {
        if (previousTenant === undefined)
          delete process.env.KUSH_SUPPORT_TENANT_ID;
        else process.env.KUSH_SUPPORT_TENANT_ID = previousTenant;
      };
      pool = createDatabase(databaseUrl!).pool;
      app = await buildApp(databaseUrl!);
      tenantId = (
        await pool.query<{ id: string }>(
          "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
          [
            "TEST community",
            GUILD,
            JSON.stringify({
              categories: [{ key: "technical", label: "Technical issue" }],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0]!.id;
      process.env.KUSH_SUPPORT_TENANT_ID = tenantId;
    });

    let restoreTenant = () => {};
    afterAll(async () => {
      restoreTenant();
      if (previous === undefined)
        delete process.env.KUSH_DISCORD_INTEGRATION_SECRET;
      else process.env.KUSH_DISCORD_INTEGRATION_SECRET = previous;
      await app?.close();
      await pool?.end();
    });

    const AUTHOR = "523456789012345681";
    const vouch = (rating: number, body: string, who = AUTHOR) =>
      bot("POST", "/vouches", {
        discordUserId: who,
        authorName: "TEST Customer",
        rating,
        body,
      });

    it("records vouches with a daily limit and a public wall", async () => {
      const first = await vouch(5, "TEST Great work, delivered fast.");
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ number: 1, rating: 5 });
      expect((await vouch(4, "TEST Second one same day")).statusCode).toBe(429);
      expect((await vouch(9, "TEST bad rating", OTHER)).statusCode).toBe(400);
      expect(
        (await vouch(3, "TEST Solid, some delays.", OTHER)).statusCode,
      ).toBe(200);
      const wall = await app.inject({
        method: "GET",
        url: "/public/vouches",
      });
      expect(wall.json()).toMatchObject({ count: 2, average: 4 });
      expect(JSON.stringify(wall.json())).not.toContain(AUTHOR);
    });

    it("hides a vouch and returns its message for deletion", async () => {
      await bot("POST", "/vouches/1/message", {
        messageId: "623456789012345671",
      });
      const hidden = await bot("POST", "/vouches/1/hide", {
        byDiscordUserId: MOD,
      });
      expect(hidden.json()).toEqual({
        hidden: true,
        messageId: "623456789012345671",
      });
      const wall = await app.inject({
        method: "GET",
        url: "/public/vouches",
      });
      expect(wall.json().count).toBe(1);
      expect(
        (await bot("POST", "/vouches/77/hide", { byDiscordUserId: MOD }))
          .statusCode,
      ).toBe(404);
    });

    it("offboards staff, unassigning open work", async () => {
      const userId = (
        await pool.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,role,display_name) VALUES($1,'x','customer','TEST Staff') RETURNING id",
          [`test-offboard-${Date.now()}@example.test`],
        )
      ).rows[0]!.id;
      await pool.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'staff')",
        [tenantId, userId],
      );
      await pool.query(
        "INSERT INTO staff_members(tenant_id,user_id,discord_user_id,roles) VALUES($1,$2,$3,'{support-staff}')",
        [tenantId, userId, TARGET],
      );
      const result = await bot("POST", `/staff/${TARGET}/offboard`, {
        reason: "TEST left the team",
        byDiscordUserId: MOD,
      });
      expect(result.json()).toMatchObject({
        recorded: true,
        ticketsUnassigned: 0,
      });
      const row = (
        await pool.query(
          "SELECT offboarded_at, offboarded_reason FROM staff_members WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.offboarded_at).not.toBeNull();
      expect(row.offboarded_reason).toBe("TEST left the team");
      const unknown = await bot("POST", `/staff/${OTHER}/offboard`, {
        reason: "TEST",
        byDiscordUserId: MOD,
      });
      expect(unknown.json()).toMatchObject({ recorded: false });
    });
  },
);
