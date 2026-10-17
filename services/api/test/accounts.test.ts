import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import type { DiscordOAuth, DiscordProfile } from "../src/account-service.js";
import { currentStep, totpCode } from "../src/totp.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
const WEBSITE = "test-website-secret-at-least-32-chars!!";
const GUILD = "923456789012345671";

const discordId = () =>
  `${Date.now()}${Math.floor(Math.random() * 1e6)}`
    .padEnd(18, "7")
    .slice(0, 18);
const binding = () => randomBytes(32).toString("base64url");

/** Fake Discord: codes map to profiles; records PKCE verifiers it saw. */
class FakeDiscord implements DiscordOAuth {
  codes = new Map<string, DiscordProfile>();
  challenges: string[] = [];
  verifiers: string[] = [];
  down = false;
  authorizeUrl(params: URLSearchParams) {
    this.challenges.push(params.get("code_challenge")!);
    return `https://discord.test/authorize?${params}`;
  }
  async exchange(code: string, verifier: string) {
    this.verifiers.push(verifier);
    if (this.down) throw new Error("Discord down");
    if (!this.codes.has(code)) throw Object.assign(new Error("bad code"), {});
    return `access-${code}`;
  }
  async profile(accessToken: string) {
    return this.codes.get(accessToken.slice("access-".length))!;
  }
}

describe.skipIf(!databaseUrl)("website accounts (real PostgreSQL)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pool: ReturnType<typeof createDatabase>["pool"];
  let tenantId: string;
  const discord = new FakeDiscord();
  const previous = {
    website: process.env.KUSH_WEBSITE_SECRET,
    tenant: process.env.KUSH_SUPPORT_TENANT_ID,
    key: process.env.KUSH_MFA_KEY,
  };

  const web = (
    method: "GET" | "POST" | "PATCH",
    url: string,
    options: { token?: string; payload?: object; secret?: string | null } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(options.secret === null
          ? {}
          : { "x-kush-website-secret": options.secret ?? WEBSITE }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.payload ? { payload: options.payload } : {}),
    });

  /** Full sign-in: start → (user approves at Discord) → callback. */
  const signIn = async (profile: DiscordProfile) => {
    const browser = binding();
    const started = await web("POST", "/web/auth/discord/start", {
      payload: { binding: browser },
    });
    expect(started.statusCode).toBe(200);
    const state = new URL(started.json().authorizeUrl).searchParams.get(
      "state",
    )!;
    const code = randomUUID();
    discord.codes.set(code, profile);
    return web("POST", "/web/auth/discord/callback", {
      payload: { state, code, binding: browser, userAgent: "vitest" },
    });
  };
  const profileOf = (id = discordId(), username = "TEST user") => ({
    id,
    username,
    avatar: null,
  });

  beforeAll(async () => {
    process.env.KUSH_WEBSITE_SECRET = WEBSITE;
    process.env.KUSH_MFA_KEY = "test-mfa-key-that-is-at-least-32-characters";
    pool = createDatabase(databaseUrl!).pool;
    app = await buildApp(databaseUrl!, false, { oauth: () => discord });
    tenantId = (
      await pool.query<{ id: string }>(
        "INSERT INTO support_tenants(name,guild_id,config) VALUES($1,$2,$3) RETURNING id",
        [
          "TEST accounts",
          GUILD,
          JSON.stringify({
            categories: [{ key: "technical", label: "Technical" }],
            retentionDays: null,
            allowReopen: true,
          }),
        ],
      )
    ).rows[0]!.id;
    process.env.KUSH_SUPPORT_TENANT_ID = tenantId;
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

  it("uses PKCE S256 with the verifier kept server-side", async () => {
    const response = await signIn(profileOf());
    expect(response.statusCode).toBe(200);
    const verifier = discord.verifiers.at(-1)!;
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
      discord.challenges.at(-1),
    );
    expect(JSON.stringify(response.json())).not.toContain(verifier);
  });

  it("creates an account on first sign-in and reuses it on return", async () => {
    const profile = profileOf();
    const first = (await signIn(profile)).json();
    const again = (await signIn({ ...profile, username: "Renamed" })).json();
    expect(first.token).not.toBe(again.token);
    const me1 = (
      await web("GET", "/web/account", { token: first.token })
    ).json();
    const me2 = (
      await web("GET", "/web/account", { token: again.token })
    ).json();
    expect(me1.id).toBe(me2.id);
    expect(me2.discord).toEqual({
      id: profile.id,
      username: "Renamed",
      avatar: null,
    });
    const accounts = await pool.query(
      "SELECT count(*)::int AS n FROM user_identities WHERE provider='discord' AND subject=$1",
      [profile.id],
    );
    expect(accounts.rows[0].n).toBe(1);
  });

  it("upgrades a Discord ticket guest identity instead of duplicating it", async () => {
    const id = discordId();
    const guest = (
      await pool.query<{ id: string }>(
        "INSERT INTO users(email,password_hash,role,kind) VALUES($1,'DISCORD_IDENTITY_NO_LOGIN','customer','discord') RETURNING id",
        [`discord-${tenantId}-${id}@discord.invalid`],
      )
    ).rows[0]!.id;
    await pool.query(
      "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')",
      [tenantId, guest],
    );
    await pool.query(
      "INSERT INTO discord_identities(tenant_id,discord_user_id,user_id) VALUES($1,$2,$3)",
      [tenantId, id, guest],
    );
    const signedIn = (await signIn(profileOf(id))).json();
    expect(
      (await web("GET", "/web/account", { token: signedIn.token })).json().id,
    ).toBe(guest);
  });

  it("verifies the Discord link and queues a role sync on sign-in", async () => {
    const id = discordId();
    await signIn(profileOf(id));
    const link = await pool.query(
      "SELECT state FROM discord_account_links WHERE tenant_id=$1 AND discord_user_id=$2",
      [tenantId, id],
    );
    expect(link.rows).toEqual([{ state: "verified" }]);
    const jobs = await pool.query(
      "SELECT reason FROM role_sync_jobs WHERE tenant_id=$1 AND discord_user_id=$2 AND status='pending'",
      [tenantId, id],
    );
    expect(jobs.rows[0]?.reason).toContain("linked");
  });

  it("rejects replayed, expired, forged and cross-browser callbacks", async () => {
    const browser = binding();
    const started = await web("POST", "/web/auth/discord/start", {
      payload: { binding: browser },
    });
    const state = new URL(started.json().authorizeUrl).searchParams.get(
      "state",
    )!;
    const code = randomUUID();
    discord.codes.set(code, profileOf());
    const callback = (payload: object) =>
      web("POST", "/web/auth/discord/callback", { payload });
    // Started in a different browser (login CSRF).
    expect(
      (await callback({ state, code, binding: binding(), userAgent: "x" }))
        .statusCode,
    ).toBe(400);
    // The failed attempt consumed the state: a flow is single-use.
    expect(
      (await callback({ state, code, binding: browser, userAgent: "x" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await callback({
          state: "forged-state-value-000",
          code,
          binding: browser,
          userAgent: "x",
        })
      ).statusCode,
    ).toBe(400);

    const expiring = binding();
    const later = await web("POST", "/web/auth/discord/start", {
      payload: { binding: expiring },
    });
    const lateState = new URL(later.json().authorizeUrl).searchParams.get(
      "state",
    )!;
    await pool.query(
      "UPDATE oauth_flows SET expires_at=now() - interval '1 second' WHERE used_at IS NULL",
    );
    expect(
      (
        await callback({
          state: lateState,
          code,
          binding: expiring,
          userAgent: "x",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("only accepts calls from the website server", async () => {
    expect(
      (
        await web("POST", "/web/auth/discord/start", {
          payload: { binding: binding() },
          secret: null,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await web("POST", "/web/auth/discord/start", {
          payload: { binding: binding() },
          secret: "x".repeat(WEBSITE.length),
        })
      ).statusCode,
    ).toBe(401);
    const { token } = (await signIn(profileOf())).json();
    expect(
      (await web("GET", "/web/account", { token, secret: null })).statusCode,
    ).toBe(401);
  });

  it("keeps website sessions out of the staff API and vice versa", async () => {
    const { token } = (await signIn(profileOf())).json();
    const staffApi = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(staffApi.statusCode).toBe(401);
    // An API (staff) session token is not a website session.
    const apiToken = randomBytes(32).toString("hex");
    const anyUser = (
      await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1")
    ).rows[0]!.id;
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [tokenHash(apiToken), anyUser],
    );
    expect(
      (await web("GET", "/web/account", { token: apiToken })).statusCode,
    ).toBe(401);
  });

  it("expires idle sessions, and logout ends them", async () => {
    const { token } = (await signIn(profileOf())).json();
    await pool.query(
      "UPDATE sessions SET last_seen_at=now() - interval '8 days' WHERE token_hash=$1",
      [tokenHash(token)],
    );
    expect((await web("GET", "/web/account", { token })).statusCode).toBe(401);

    const fresh = (await signIn(profileOf())).json();
    expect(
      (
        await web("POST", "/web/account/logout", {
          token: fresh.token,
          payload: { scope: "this" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await web("GET", "/web/account", { token: fresh.token })).statusCode,
    ).toBe(401);
  });

  it("refuses disabled accounts", async () => {
    const profile = profileOf();
    const { token } = (await signIn(profile)).json();
    const id = (await web("GET", "/web/account", { token })).json().id;
    await pool.query("UPDATE users SET disabled=true WHERE id=$1", [id]);
    expect((await web("GET", "/web/account", { token })).statusCode).toBe(401);
    expect((await signIn(profile)).statusCode).toBe(403);
  });

  it("lists sessions and cannot revoke another account's session", async () => {
    const profile = profileOf();
    const a = (await signIn(profile)).json();
    const b = (await signIn(profile)).json();
    const listed = (
      await web("GET", "/web/account/sessions", { token: a.token })
    ).json().sessions;
    expect(listed.length).toBe(2);
    expect(listed.filter((s: { current: boolean }) => s.current).length).toBe(
      1,
    );
    const stranger = (await signIn(profileOf())).json();
    expect(
      (
        await web("POST", `/web/account/sessions/${b.sessionId}/revoke`, {
          token: stranger.token,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await web("POST", `/web/account/sessions/${b.sessionId}/revoke`, {
          token: a.token,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await web("GET", "/web/account", { token: b.token })).statusCode,
    ).toBe(401);
  });

  it("updates the display name with validation", async () => {
    const { token } = (await signIn(profileOf())).json();
    const ok = await web("PATCH", "/web/account", {
      token,
      payload: { displayName: "  Kush Fan  " },
    });
    expect(ok.json().displayName).toBe("Kush Fan");
    expect(
      (
        await web("PATCH", "/web/account", {
          token,
          payload: { displayName: "x".repeat(41) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await web("PATCH", "/web/account", {
          token,
          payload: { role: "admin", displayName: null },
        })
      ).statusCode,
    ).toBe(400);
  });

  describe("two-factor authentication", () => {
    const codeFor = (secret: string, offset = 0) =>
      totpCode(secret, currentStep() + offset);

    it("enrols only after a valid code, then issues single-use recovery codes", async () => {
      const profile = profileOf();
      const { token } = (await signIn(profile)).json();
      const setup = (
        await web("POST", "/web/account/mfa/totp/setup", { token })
      ).json();
      expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/KUSH%3A/);
      const stored = await pool.query(
        "SELECT secret_ciphertext FROM mfa_totp t JOIN user_identities i ON i.user_id=t.user_id WHERE i.subject=$1",
        [profile.id],
      );
      expect(stored.rows[0].secret_ciphertext).not.toContain(setup.secret);
      expect(
        (await web("GET", "/web/account", { token })).json().mfa.enabled,
      ).toBe(false);

      expect(
        (
          await web("POST", "/web/account/mfa/totp/enable", {
            token,
            payload: { code: "000000" },
          })
        ).statusCode,
      ).toBe(400);
      const enabled = await web("POST", "/web/account/mfa/totp/enable", {
        token,
        payload: { code: codeFor(setup.secret) },
      });
      expect(enabled.statusCode).toBe(200);
      const { recoveryCodes } = enabled.json();
      expect(recoveryCodes).toHaveLength(10);
      const me = (await web("GET", "/web/account", { token })).json();
      expect(me.mfa).toEqual({ enabled: true, recoveryCodesLeft: 10 });

      // A new sign-in reports MFA and is not verified until a code is given.
      const second = (await signIn(profile)).json();
      expect(second.mfaEnabled).toBe(true);
      expect(
        (await web("GET", "/web/account", { token: second.token })).json()
          .session.mfaVerified,
      ).toBe(false);
      const recovery = recoveryCodes[0];
      expect(
        (
          await web("POST", "/web/account/mfa/verify", {
            token: second.token,
            payload: { recoveryCode: recovery },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await web("GET", "/web/account", { token: second.token })).json()
          .session.mfaVerified,
      ).toBe(true);
      // Recovery codes are single-use.
      const third = (await signIn(profile)).json();
      expect(
        (
          await web("POST", "/web/account/mfa/verify", {
            token: third.token,
            payload: { recoveryCode: recovery },
          })
        ).statusCode,
      ).toBe(400);
      const hashes = await pool.query(
        "SELECT code_hash FROM mfa_recovery_codes r JOIN user_identities i ON i.user_id=r.user_id WHERE i.subject=$1",
        [profile.id],
      );
      expect(hashes.rows.map((r) => r.code_hash)).not.toContain(recovery);
    });

    it("rejects a replayed TOTP code", async () => {
      const { token } = (await signIn(profileOf())).json();
      const { secret } = (
        await web("POST", "/web/account/mfa/totp/setup", { token })
      ).json();
      await web("POST", "/web/account/mfa/totp/enable", {
        token,
        payload: { code: codeFor(secret, -1) },
      });
      const code = codeFor(secret);
      expect(
        (
          await web("POST", "/web/account/mfa/verify", {
            token,
            payload: { code },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await web("POST", "/web/account/mfa/verify", {
            token,
            payload: { code },
          })
        ).statusCode,
      ).toBe(400);
    });

    it("rate-limits guessing", async () => {
      const { token } = (await signIn(profileOf())).json();
      const { secret } = (
        await web("POST", "/web/account/mfa/totp/setup", { token })
      ).json();
      await web("POST", "/web/account/mfa/totp/enable", {
        token,
        payload: { code: codeFor(secret) },
      });
      const statuses = [];
      for (let i = 0; i < 6; i += 1)
        statuses.push(
          (
            await web("POST", "/web/account/mfa/verify", {
              token,
              payload: { code: "123456" },
            })
          ).statusCode,
        );
      expect(statuses.at(-1)).toBe(429);
      expect(
        (
          await web("POST", "/web/account/mfa/verify", {
            token,
            payload: { code: codeFor(secret, 1) },
          })
        ).statusCode,
      ).toBe(429);
    });

    it("needs a fresh code to disable, and signs out other devices", async () => {
      const profile = profileOf();
      const { token } = (await signIn(profile)).json();
      const { secret } = (
        await web("POST", "/web/account/mfa/totp/setup", { token })
      ).json();
      await web("POST", "/web/account/mfa/totp/enable", {
        token,
        payload: { code: codeFor(secret, -1) },
      });
      const other = (await signIn(profile)).json();
      expect(
        (
          await web("POST", "/web/account/mfa/totp/disable", {
            token,
            payload: { code: "000000" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await web("POST", "/web/account/mfa/totp/disable", {
            token,
            payload: { code: codeFor(secret) },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await web("GET", "/web/account", { token: other.token })).statusCode,
      ).toBe(401);
      expect(
        (await web("GET", "/web/account", { token })).json().mfa.enabled,
      ).toBe(false);
    });
  });

  it("fails safely when Discord is unavailable", async () => {
    discord.down = true;
    try {
      const response = await signIn(profileOf());
      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(response.json()).not.toHaveProperty("token");
    } finally {
      discord.down = false;
    }
  });
});
