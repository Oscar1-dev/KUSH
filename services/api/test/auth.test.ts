import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword, verifyPassword, tokenHash } from "../src/password.js";
describe("password and session cryptography", () => {
  it("salts passwords, verifies correctly and rejects malformed hashes", async () => {
    const first = await hashPassword("a sufficiently long passphrase");
    expect(first).not.toBe(
      await hashPassword("a sufficiently long passphrase"),
    );
    expect(await verifyPassword("a sufficiently long passphrase", first)).toBe(
      true,
    );
    expect(await verifyPassword("wrong", first)).toBe(false);
    expect(await verifyPassword("wrong", "broken")).toBe(false);
    expect(tokenHash("secret")).not.toContain("secret");
  });
});
describe("API failure boundaries without a database", () => {
  it("reports unavailable database and rejects unauthenticated or malformed requests", async () => {
    const app = await buildApp(
      "postgresql://invalid:invalid@127.0.0.1:1/unavailable",
    );
    try {
      const specification = (await app.inject("/openapi.json")).json();
      expect(specification.paths["/admin/users"]).toBeDefined();
      expect(
        specification.paths["/projects/{id}/approve"].post.parameters,
      ).toContainEqual({
        in: "path",
        name: "id",
        required: true,
        schema: { type: "string", format: "uuid" },
      });
      expect((await app.inject("/health")).statusCode).toBe(503);
      for (const url of ["/auth/me", "/audit"])
        expect((await app.inject(url)).statusCode).toBe(401);
      expect(
        (await app.inject({ method: "POST", url: "/auth/logout" })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/auth/login",
            payload: { email: "x" },
          })
        ).statusCode,
      ).toBe(400);
      const malformed = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "content-type": "application/json" },
        payload: "{broken",
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.headers["cache-control"]).toBe("no-store");
      for (let i = 0; i < 6; i++)
        await app.inject({ method: "POST", url: "/auth/login", payload: {} });
      const limited = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {},
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["cache-control"]).toBe("no-store");
      const cors = await app.inject({
        method: "OPTIONS",
        url: "/auth/login",
        headers: {
          origin: "https://untrusted.example",
          "access-control-request-method": "POST",
        },
      });
      expect(cors.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
