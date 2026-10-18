import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const SECRET = "test-integration-secret-32-characters!!";
const GUILD = "923456789012345670";
const ROLE_A = "423456789012345671";
const ROLE_B = "423456789012345672";

const discordId = () =>
  `${Date.now()}${Math.floor(Math.random() * 1e6)}`
    .padEnd(18, "3")
    .slice(0, 18);

describe.skipIf(!databaseUrl)(
  "entitlements and role sync (real PostgreSQL)",
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let pool: ReturnType<typeof createDatabase>["pool"];
    let tenantId: string;
    const previous = {
      secret: process.env.KUSH_DISCORD_INTEGRATION_SECRET,
      simulated: process.env.KUSH_SIMULATED_PURCHASES,
    };
    const tokens: Record<string, string> = {};
    const ids: Record<string, string> = {};

    const bot = (method: "GET" | "POST", path: string, payload?: object) =>
      app.inject({
        method,
        url: `/discord/integration/tenants/${tenantId}${path}`,
        headers: {
          "x-kush-discord-secret": SECRET,
          "x-kush-discord-guild-id": GUILD,
        },
        ...(payload ? { payload } : {}),
      });
    const as = (
      who: string,
      method: "GET" | "POST" | "PATCH",
      url: string,
      payload?: object,
    ) =>
      app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${tokens[who]}` },
        ...(payload ? { payload } : {}),
      });
    const roles = async (discordUserId: string) =>
      (await bot("GET", `/members/${discordUserId}/roles`)).json();
    const pending = async (discordUserId: string) =>
      (
        await pool.query(
          "SELECT reason FROM role_sync_jobs WHERE tenant_id=$1 AND discord_user_id=$2 AND status='pending'",
          [tenantId, discordUserId],
        )
      ).rows;
    const event = (payload: object) =>
      bot("POST", "/purchase-events", { provider: "simulated", ...payload });

    /** Real link flow: the user generates a code, the bot completes it. */
    const link = async (who: string, discordUserId: string) => {
      const started = await as(
        who,
        "POST",
        `/discord/tenants/${tenantId}/links/start`,
        {
          requestId: randomUUID(),
        },
      );
      expect(started.statusCode).toBe(200);
      const completed = await bot("POST", "/links/complete", {
        code: started.json().code,
        discordUserId,
        guildId: GUILD,
      });
      expect(completed.statusCode).toBe(200);
    };

    beforeAll(async () => {
      process.env.KUSH_DISCORD_INTEGRATION_SECRET = SECRET;
      process.env.KUSH_SIMULATED_PURCHASES = "true";
      pool = createDatabase(databaseUrl!).pool;
      app = await buildApp(databaseUrl!);
      tenantId = (
        await pool.query<{ id: string }>(
          "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
          [
            "TEST entitlements",
            GUILD,
            JSON.stringify({
              categories: [{ key: "technical", label: "Technical issue" }],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0]!.id;
      for (const [name, role, tenantRole] of [
        ["owner", "admin", "owner"],
        ["alice", "customer", "customer"],
        ["bob", "customer", "customer"],
      ] as const) {
        const id = randomUUID();
        ids[name] = id;
        await pool.query(
          "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'test',$3)",
          [id, `${id}@test.invalid`, role],
        );
        await pool.query(
          "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,$3)",
          [tenantId, id, tenantRole],
        );
        tokens[name] = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [tokenHash(tokens[name]!), id],
        );
      }
    });

    afterAll(async () => {
      for (const [key, value] of [
        ["KUSH_DISCORD_INTEGRATION_SECRET", previous.secret],
        ["KUSH_SIMULATED_PURCHASES", previous.simulated],
      ] as const)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      await app?.close();
      await pool?.end();
    });

    it("lets only the tenant owner manage products", async () => {
      const created = await as(
        "owner",
        "POST",
        `/tenants/${tenantId}/products`,
        {
          slug: "test-alpha",
          name: "TEST Alpha",
          status: "active",
          discordRoleId: ROLE_A,
        },
      );
      expect(created.statusCode).toBe(201);
      expect(
        (
          await as("owner", "POST", `/tenants/${tenantId}/products`, {
            slug: "test-beta",
            name: "TEST Beta",
            status: "active",
            discordRoleId: ROLE_B,
          })
        ).statusCode,
      ).toBe(201);
      const denied = await as(
        "alice",
        "POST",
        `/tenants/${tenantId}/products`,
        {
          slug: "nope",
          name: "nope",
        },
      );
      expect(denied.statusCode).toBe(403);
      const duplicate = await as(
        "owner",
        "POST",
        `/tenants/${tenantId}/products`,
        {
          slug: "test-alpha",
          name: "again",
        },
      );
      expect(duplicate.statusCode).toBe(409);
    });

    it("keeps rules acceptance across leave and rejoin", async () => {
      const member = discordId();
      expect((await roles(member)).member).toBe(false);
      await bot("POST", `/members/${member}/rules`, { version: "2026-10-17" });
      expect((await roles(member)).member).toBe(true);
      await bot("POST", `/members/${member}/presence`, { present: false });
      await pool.query(
        "UPDATE role_sync_jobs SET status='done' WHERE tenant_id=$1",
        [tenantId],
      );
      await bot("POST", `/members/${member}/presence`, { present: true });
      expect((await roles(member)).member).toBe(true);
      expect((await pending(member)).map((row) => row.reason)).toEqual([
        "joined",
      ]);
    });

    it("holds a purchase for an unlinked customer and applies it on linking", async () => {
      const discord = discordId();
      const bought = await event({
        eventId: "evt-alice-1",
        type: "purchase.completed",
        orderId: "order-alice-1",
        userId: ids.alice,
        productSlug: "test-alpha",
      });
      expect(bought.json()).toEqual({
        duplicate: false,
        result: "entitlement.active",
      });
      // Not linked: no Discord member to sync yet.
      expect(await pending(discord)).toEqual([]);

      await link("alice", discord);
      expect((await pending(discord)).map((row) => row.reason)).toEqual([
        "linked",
      ]);
      expect(await roles(discord)).toMatchObject({
        linked: true,
        verifiedCustomer: true,
        productRoleIds: [ROLE_A],
        managedProductRoleIds: [ROLE_A, ROLE_B],
      });
      ids.aliceDiscord = discord;
    });

    it("ignores duplicate events and grants multiple products", async () => {
      const replay = await event({
        eventId: "evt-alice-1",
        type: "purchase.completed",
        orderId: "order-alice-1",
        userId: ids.alice,
        productSlug: "test-alpha",
      });
      expect(replay.json()).toMatchObject({ duplicate: true });
      const count = await pool.query(
        "SELECT count(*)::int AS n FROM entitlements WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, ids.alice],
      );
      expect(count.rows[0].n).toBe(1);

      await event({
        eventId: "evt-alice-2",
        type: "purchase.completed",
        orderId: "order-alice-2",
        userId: ids.alice,
        productSlug: "test-beta",
      });
      expect((await roles(ids.aliceDiscord!)).productRoleIds).toEqual([
        ROLE_A,
        ROLE_B,
      ]);
      expect((await pending(ids.aliceDiscord!))[0]?.reason).toContain(
        "purchase:purchase.completed",
      );
    });

    it("removes access on refund, chargeback and revocation", async () => {
      await event({
        eventId: "evt-refund",
        type: "purchase.refunded",
        orderId: "order-alice-2",
      });
      expect((await roles(ids.aliceDiscord!)).productRoleIds).toEqual([ROLE_A]);
      await event({
        eventId: "evt-chargeback",
        type: "purchase.chargeback",
        orderId: "order-alice-1",
      });
      expect(await roles(ids.aliceDiscord!)).toMatchObject({
        verifiedCustomer: false,
        productRoleIds: [],
      });
      const statuses = await pool.query(
        "SELECT source_reference,status FROM entitlements WHERE tenant_id=$1 AND user_id=$2 ORDER BY source_reference",
        [tenantId, ids.alice],
      );
      expect(statuses.rows).toEqual([
        { source_reference: "order-alice-1", status: "revoked" },
        { source_reference: "order-alice-2", status: "refunded" },
      ]);
      const unmatched = await event({
        eventId: "evt-unknown",
        type: "licence.revoked",
        orderId: "no-such-order",
      });
      expect(unmatched.json().result).toBe("no-matching-entitlement");
    });

    it("expires subscriptions when their end date passes", async () => {
      const discord = discordId();
      await link("bob", discord);
      await event({
        eventId: "evt-bob-sub",
        type: "purchase.completed",
        orderId: "order-bob-sub",
        userId: ids.bob,
        productSlug: "test-alpha",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect((await roles(discord)).productRoleIds).toEqual([ROLE_A]);
      // Move the expiry into the past, as time passing would.
      await pool.query(
        "UPDATE entitlements SET expires_at=now()-interval '1 second' WHERE tenant_id=$1 AND source_reference='order-bob-sub'",
        [tenantId],
      );
      // Even before the sweep, an expired entitlement grants nothing.
      expect((await roles(discord)).productRoleIds).toEqual([]);
      await pool.query(
        "UPDATE role_sync_jobs SET status='done' WHERE tenant_id=$1",
        [tenantId],
      );
      const jobs = (await bot("GET", "/role-sync/jobs")).json().jobs;
      expect(
        jobs.map((job: { discordUserId: string }) => job.discordUserId),
      ).toContain(discord);
      const status = await pool.query(
        "SELECT status FROM entitlements WHERE tenant_id=$1 AND source_reference='order-bob-sub'",
        [tenantId],
      );
      expect(status.rows[0].status).toBe("expired");
      ids.bobDiscord = discord;
    });

    it("isolates entitlements between customers", async () => {
      await event({
        eventId: "evt-bob-beta",
        type: "purchase.completed",
        orderId: "order-bob-beta",
        userId: ids.bob,
        productSlug: "test-beta",
      });
      expect((await roles(ids.bobDiscord!)).productRoleIds).toEqual([ROLE_B]);
      expect((await roles(ids.aliceDiscord!)).productRoleIds).toEqual([]);
      // Customers cannot reach the admin routes at all (global guard)...
      const adminRoute = await as(
        "alice",
        "GET",
        `/tenants/${tenantId}/entitlements?userId=${ids.bob}`,
      );
      expect(adminRoute.statusCode).toBe(403);
      // ...and their self-service view contains only their own records.
      const own = await as(
        "alice",
        "GET",
        `/commercial/tenants/${tenantId}/entitlements/mine`,
      );
      expect(own.statusCode, own.body).toBe(200);
      const slugs = own
        .json()
        .entitlements.map((item: { productSlug: string }) => item.productSlug);
      expect(slugs.length).toBeGreaterThan(0);
      const bobs = await pool.query(
        "SELECT id FROM entitlements WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, ids.bob],
      );
      const ownIds = own
        .json()
        .entitlements.map((item: { id: string }) => item.id);
      for (const row of bobs.rows) expect(ownIds).not.toContain(row.id);
    });

    it("never gives product roles to a member without a verified link", async () => {
      expect(await roles(discordId())).toMatchObject({
        linked: false,
        verifiedCustomer: false,
        productRoleIds: [],
      });
    });

    it("removes customer roles when the account is unlinked", async () => {
      const revoked = await as(
        "bob",
        "POST",
        `/discord/tenants/${tenantId}/links/revoke`,
      );
      expect(revoked.json()).toEqual({ revoked: 1 });
      expect(await roles(ids.bobDiscord!)).toMatchObject({
        linked: false,
        productRoleIds: [],
      });
      expect((await pending(ids.bobDiscord!))[0]?.reason).toContain("unlinked");
    });

    // Regression (live test): revoked links still held the unique Discord ID,
    // so an unlinked Discord account could never be linked again.
    it("lets an unlinked Discord account be linked again", async () => {
      await link("bob", ids.bobDiscord!);
      expect((await roles(ids.bobDiscord!)).linked).toBe(true);
      // And one Discord account still cannot hold two verified links. (Uses
      // the owner: starting a link code resets that user's own link.)
      const started = await as(
        "owner",
        "POST",
        `/discord/tenants/${tenantId}/links/start`,
        {
          requestId: randomUUID(),
        },
      );
      const second = await bot("POST", "/links/complete", {
        code: started.json().code,
        discordUserId: ids.bobDiscord,
        guildId: GUILD,
      });
      expect(second.statusCode).toBe(409);
      await as("bob", "POST", `/discord/tenants/${tenantId}/links/revoke`);
    });

    it("supports owner manual grants and revocations with sync", async () => {
      const grant = await as(
        "owner",
        "POST",
        `/tenants/${tenantId}/entitlements`,
        {
          userId: ids.alice,
          productSlug: "test-beta",
          reference: "manual-test-1",
        },
      );
      expect(grant.statusCode).toBe(201);
      expect((await roles(ids.aliceDiscord!)).productRoleIds).toEqual([ROLE_B]);
      expect(
        (
          await as("alice", "POST", `/tenants/${tenantId}/entitlements`, {
            userId: ids.alice,
            productSlug: "test-alpha",
            reference: "self-grant",
          })
        ).statusCode,
      ).toBe(403);
      const revoke = await as(
        "owner",
        "POST",
        `/tenants/${tenantId}/entitlements/${grant.json().id}/revoke`,
        {
          reason: "TEST revoke",
        },
      );
      expect(revoke.statusCode).toBe(200);
      expect((await roles(ids.aliceDiscord!)).productRoleIds).toEqual([]);
    });

    it("retries failed syncs with backoff and marks them done on success", async () => {
      const member = discordId();
      await bot("POST", `/members/${member}/rules`, { version: "v" });
      const [job] = (await bot("GET", "/role-sync/jobs"))
        .json()
        .jobs.filter(
          (item: { discordUserId: string }) => item.discordUserId === member,
        );
      await bot("POST", `/role-sync/jobs/${job.id}`, {
        ok: false,
        error: "Discord 503",
        generation: job.generation,
      });
      const failed = await pool.query(
        "SELECT attempts,status,next_attempt_at>now() AS delayed FROM role_sync_jobs WHERE id=$1",
        [job.id],
      );
      expect(failed.rows[0]).toMatchObject({
        attempts: 1,
        status: "pending",
        delayed: true,
      });
      // Not due again until the backoff passes.
      const due = (await bot("GET", "/role-sync/jobs")).json().jobs;
      expect(due.some((item: { id: string }) => item.id === job.id)).toBe(
        false,
      );
      await bot("POST", `/role-sync/jobs/${job.id}`, {
        ok: true,
        generation: job.generation,
      });
      const done = await pool.query(
        "SELECT status FROM role_sync_jobs WHERE id=$1",
        [job.id],
      );
      expect(done.rows[0].status).toBe("done");
    });

    // Regression (live test): a request queued while its job was in flight was
    // coalesced into it and then lost when the worker marked the job done.
    it("re-runs a job when a newer request arrives while it is in flight", async () => {
      const member = discordId();
      await bot("POST", `/members/${member}/rules`, { version: "v" });
      const [inFlight] = (await bot("GET", "/role-sync/jobs"))
        .json()
        .jobs.filter(
          (item: { discordUserId: string }) => item.discordUserId === member,
        );
      // A second change lands while the worker is still processing.
      await bot("POST", `/members/${member}/presence`, { present: true });
      await bot("POST", `/role-sync/jobs/${inFlight.id}`, {
        ok: true,
        generation: inFlight.generation,
      });
      const after = await pool.query(
        "SELECT status,reason,generation FROM role_sync_jobs WHERE id=$1",
        [inFlight.id],
      );
      expect(after.rows[0]).toMatchObject({ status: "pending" });
      expect(after.rows[0].reason).toContain("joined");
      expect(after.rows[0].generation).toBeGreaterThan(inFlight.generation);
      // The newer generation completes normally.
      const [again] = (await bot("GET", "/role-sync/jobs"))
        .json()
        .jobs.filter((item: { id: string }) => item.id === inFlight.id);
      await bot("POST", `/role-sync/jobs/${again.id}`, {
        ok: true,
        generation: again.generation,
      });
      const done = await pool.query(
        "SELECT status FROM role_sync_jobs WHERE id=$1",
        [inFlight.id],
      );
      expect(done.rows[0].status).toBe("done");
    });

    it("refuses purchase events when simulation is disabled", async () => {
      process.env.KUSH_SIMULATED_PURCHASES = "false";
      const blocked = await event({
        eventId: "evt-blocked",
        type: "purchase.completed",
        orderId: "order-blocked",
        userId: ids.alice,
        productSlug: "test-alpha",
      });
      expect(blocked.statusCode).toBe(403);
      process.env.KUSH_SIMULATED_PURCHASES = "true";
    });

    it("requires the integration secret for bot routes", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/discord/integration/tenants/${tenantId}/role-sync/jobs`,
        headers: {
          "x-kush-discord-secret": "x".repeat(SECRET.length),
          "x-kush-discord-guild-id": GUILD,
        },
      });
      expect(response.statusCode).toBe(401);
    });
  },
);
