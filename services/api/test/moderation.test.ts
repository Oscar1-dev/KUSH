import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const SECRET = "test-integration-secret-32-characters!!";
const GUILD = "923456789012345677";
const TARGET = "523456789012345671";
const OTHER = "523456789012345672";
const MOD = "523456789012345673";

describe.skipIf(!databaseUrl)("moderation cases (real PostgreSQL)", () => {
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
      url: `/discord/integration/tenants/${tenantId}/moderation/cases${path}`,
      headers: {
        "x-kush-discord-secret": SECRET,
        "x-kush-discord-guild-id": guild,
      },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    process.env.KUSH_DISCORD_INTEGRATION_SECRET = SECRET;
    pool = createDatabase(databaseUrl!).pool;
    app = await buildApp(databaseUrl!);
    tenantId = (
      await pool.query<{ id: string }>(
        "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
        [
          "TEST moderation",
          GUILD,
          JSON.stringify({
            categories: [{ key: "technical", label: "Technical issue" }],
            retentionDays: null,
            allowReopen: true,
          }),
        ],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (previous === undefined)
      delete process.env.KUSH_DISCORD_INTEGRATION_SECRET;
    else process.env.KUSH_DISCORD_INTEGRATION_SECRET = previous;
    await app?.close();
    await pool?.end();
  });

  it("numbers cases per tenant, even when recorded concurrently", async () => {
    const results = await Promise.all(
      ["warn", "timeout", "kick"].map((kind) =>
        bot("POST", "", {
          kind,
          targetId: TARGET,
          moderatorId: MOD,
          reason: `TEST ${kind}`,
          source: "bot",
          ...(kind === "timeout" ? { durationSeconds: 600 } : {}),
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(results.map((r) => r.json().number).sort()).toEqual([1, 2, 3]);
    const other = await bot("POST", "", {
      kind: "ban",
      targetId: OTHER,
      moderatorId: null,
      reason: "TEST via Discord",
      source: "discord",
    });
    expect(other.json()).toMatchObject({ number: 4, moderatorId: null });
  });

  it("lists a member's history newest first and fetches one case", async () => {
    const history = (await bot("GET", `?target=${TARGET}`)).json().cases;
    expect(history.map((c: { number: number }) => c.number)).toEqual([
      3, 2, 1,
    ]);
    // The three were recorded concurrently, so #2 can be any of them.
    const second = history.find((c: { number: number }) => c.number === 2);
    const single = await bot("GET", "/2");
    expect(single.json()).toMatchObject({ number: 2, kind: second.kind });
    expect((await bot("GET", "/99")).statusCode).toBe(404);
  });

  it("rejects the wrong guild, bad input and missing secret", async () => {
    const wrongGuild = await bot(
      "POST",
      "",
      { kind: "warn", targetId: TARGET, reason: "TEST", source: "bot" },
      "923456789012345999",
    );
    expect(wrongGuild.statusCode).toBe(404);
    const bad = await bot("POST", "", {
      kind: "explode",
      targetId: TARGET,
      reason: "TEST",
      source: "bot",
    });
    expect(bad.statusCode).toBe(400);
    const anonymous = await app.inject({
      method: "GET",
      url: `/discord/integration/tenants/${tenantId}/moderation/cases`,
    });
    expect([401, 403]).toContain(anonymous.statusCode);
  });
});
