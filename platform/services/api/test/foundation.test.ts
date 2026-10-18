import { describe, it, expect } from "vitest";
import { randomUUID, randomInt } from "node:crypto";
import { createDatabase, users } from "@kush/database";
import { eq, inArray } from "drizzle-orm";
import { hashPassword, tokenHash } from "../src/password.js";
import { buildApp } from "../src/app.js";
const url = process.env.KUSH_TEST_DATABASE_URL;
describe.skipIf(!url)("M1 persisted identity controls", () => {
  it("enforces administration, privacy, session revocation and persisted rate limits", async () => {
    const { db, pool } = createDatabase(url!);
    let app = await buildApp(url!);
    const suffix = randomUUID();
    const password = "foundation-only-passphrase";
    const ids: string[] = [];
    const ips: string[] = [];
    const seed = await db
      .insert(users)
      .values({
        email: `owner-${suffix}@test.invalid`,
        role: "admin",
        passwordHash: await hashPassword(password),
      })
      .returning();
    ids.push(seed[0]!.id);
    const ip = () => {
      const value = `127.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
      ips.push(value);
      return value;
    };
    const login = async (email: string, pw = password, remoteAddress = ip()) =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress,
        payload: { email, password: pw },
      });
    try {
      const signed = await login(seed[0]!.email);
      expect(signed.statusCode).toBe(200);
      const headers = { authorization: `Bearer ${signed.json().token}` };
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          email: `viewer-${suffix}@test.invalid`,
          password,
          role: "viewer",
        },
      });
      expect(created.statusCode).toBe(201);
      const viewer = created.json().user;
      ids.push(viewer.id);
      const signedViewer = await login(viewer.email);
      const viewerHeaders = {
        authorization: `Bearer ${signedViewer.json().token}`,
      };
      expect(
        (await app.inject({ url: "/admin/users", headers: viewerHeaders }))
          .statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ url: "/admin/users", headers }))
          .json()
          .users.every(
            (u: Record<string, unknown>) =>
              !("passwordHash" in u) && !("password_hash" in u),
          ),
      ).toBe(true);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/admin/users/${seed[0]!.id}/access`,
            headers,
            payload: { role: "viewer", disabled: false },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/profiles",
            headers,
            payload: { name: "Unsafe", endpoint: "https://example.com" },
          })
        ).statusCode,
      ).toBe(400);
      const profile = await app.inject({
        method: "POST",
        url: "/profiles",
        headers,
        payload: { name: `Local ${suffix}`, endpoint: "http://127.0.0.1:4310" },
      });
      expect(profile.statusCode).toBe(201);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/profiles/${profile.json().profile.id}/delete`,
            headers,
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/auth/password",
            headers: viewerHeaders,
            payload: {
              currentPassword: "wrong",
              password: "new-long-test-passphrase",
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/auth/password",
            headers: viewerHeaders,
            payload: {
              currentPassword: password,
              password: "new-long-test-passphrase",
            },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (await app.inject({ url: "/auth/me", headers: viewerHeaders }))
          .statusCode,
      ).toBe(401);
      expect((await login(viewer.email)).statusCode).toBe(401);
      expect(
        (await login(viewer.email, "new-long-test-passphrase")).statusCode,
      ).toBe(200);
      const beforeReset = await login(viewer.email, "new-long-test-passphrase");
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/admin/users/${viewer.id}/password`,
            headers,
            payload: { password: "admin-reset-test-passphrase" },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (
          await app.inject({
            url: "/auth/me",
            headers: { authorization: `Bearer ${beforeReset.json().token}` },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await login(viewer.email, "new-long-test-passphrase")).statusCode,
      ).toBe(401);
      const resetLogin = await login(
        viewer.email,
        "admin-reset-test-passphrase",
      );
      expect(resetLogin.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/admin/users/${viewer.id}/access`,
            headers,
            payload: { role: "viewer", disabled: true },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (await login(viewer.email, "new-long-test-passphrase")).statusCode,
      ).toBe(401);
      const rateIp = ip();
      for (let i = 0; i < 5; i++)
        expect(
          (await login(`missing-${suffix}@test.invalid`, password, rateIp))
            .statusCode,
        ).toBe(401);
      await app.close();
      app = await buildApp(url!);
      expect(
        (await login(`missing-${suffix}@test.invalid`, password, rateIp))
          .statusCode,
      ).toBe(429);
      const actions = await pool.query(
        "SELECT action FROM audit_events WHERE actor_id = ANY($1::uuid[])",
        [ids],
      );
      expect(actions.rows.some((r) => r.action === "access.denied")).toBe(true);
      expect(
        actions.rows.some((r) => r.action === "auth.password.changed"),
      ).toBe(true);
      const attempts = await pool.query(
        "SELECT ip_hash FROM login_attempts WHERE ip_hash=$1",
        [tokenHash(`login-ip:${rateIp}`)],
      );
      expect(attempts.rowCount).toBe(1);
      expect(attempts.rows[0].ip_hash).not.toBe(rateIp);
    } finally {
      await app.close();
      await pool.query(
        "DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[])",
        [ids],
      );
      await db.delete(users).where(inArray(users.id, ids));
      for (const address of ips)
        await pool.query("DELETE FROM login_attempts WHERE ip_hash=$1", [
          tokenHash(`login-ip:${address}`),
        ]);
      await pool.end();
    }
  }, 20000);
  it("cleans expired sessions when the app starts", async () => {
    const { db, pool } = createDatabase(url!);
    const [user] = await db
      .insert(users)
      .values({
        email: `expiry-${randomUUID()}@test.invalid`,
        role: "viewer",
        passwordHash: await hashPassword("expired-long-passphrase"),
      })
      .returning();
    const hash = tokenHash(randomUUID());
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 day')",
      [hash, user!.id],
    );
    const app = await buildApp(url!);
    try {
      await app.ready();
      expect(
        (
          await pool.query(
            "SELECT token_hash FROM sessions WHERE token_hash=$1",
            [hash],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await app.close();
      await db.delete(users).where(eq(users.id, user!.id));
      await pool.end();
    }
  });
});
