import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase, users, sessions, auditEvents } from "@kush/database";
import { buildApp } from "../src/app.js";
import { hashPassword, tokenHash } from "../src/password.js";
const url = process.env.KUSH_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "real PostgreSQL auth lifecycle (set KUSH_TEST_DATABASE_URL after migrations)",
  () => {
    it("enforces credentials, RBAC, session expiry, logout revocation and audit persistence", async () => {
      const { db, pool } = createDatabase(url!);
      const app = await buildApp(url!);
      const password = "integration-only-long-passphrase";
      const suffix = randomUUID();
      const adminEmail = `admin-${suffix}@test.invalid`;
      const viewerEmail = `viewer-${suffix}@test.invalid`;
      const created = await db
        .insert(users)
        .values([
          {
            email: adminEmail,
            role: "admin",
            passwordHash: await hashPassword(password),
          },
          {
            email: viewerEmail,
            role: "viewer",
            passwordHash: await hashPassword(password),
          },
        ])
        .returning();
      try {
        expect((await app.inject("/health")).statusCode).toBe(200);
        const login = async (email: string, candidate = password) =>
          app.inject({
            method: "POST",
            url: "/auth/login",
            payload: { email, password: candidate },
          });
        expect((await login(adminEmail, "incorrect")).statusCode).toBe(401);
        expect((await login(`missing-${suffix}@test.invalid`)).statusCode).toBe(
          401,
        );
        const adminResponse = await login(adminEmail);
        expect(adminResponse.statusCode).toBe(200);
        const admin = adminResponse.json();
        const viewerResponse = await login(viewerEmail);
        expect(viewerResponse.statusCode).toBe(200);
        const viewer = viewerResponse.json();
        const headers = { authorization: `Bearer ${admin.token}` };
        expect(
          (await app.inject({ url: "/auth/me", headers })).json().user.email,
        ).toBe(adminEmail);
        expect(
          (
            await app.inject({
              url: "/audit",
              headers: { authorization: `Bearer ${viewer.token}` },
            })
          ).statusCode,
        ).toBe(403);
        const audit = await app.inject({ url: "/audit", headers });
        expect(audit.statusCode).toBe(200);
        expect(
          audit
            .json()
            .events.some(
              (e: { actorId: string; action: string }) =>
                e.actorId === admin.user.id && e.action === "auth.login",
            ),
        ).toBe(true);
        const [stored] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.tokenHash, tokenHash(admin.token)));
        expect(stored?.tokenHash).not.toBe(admin.token);
        await db
          .update(sessions)
          .set({ expiresAt: new Date(0) })
          .where(eq(sessions.tokenHash, tokenHash(viewer.token)));
        expect(
          (
            await app.inject({
              url: "/auth/me",
              headers: { authorization: `Bearer ${viewer.token}` },
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (await app.inject({ method: "POST", url: "/auth/logout", headers }))
            .statusCode,
        ).toBe(204);
        expect(
          (await app.inject({ url: "/auth/me", headers })).statusCode,
        ).toBe(401);
      } finally {
        for (const user of created) {
          await db.delete(auditEvents).where(eq(auditEvents.actorId, user.id));
          await db.delete(users).where(eq(users.id, user.id));
        }
        await app.close();
        await pool.end();
      }
    });
  },
);
