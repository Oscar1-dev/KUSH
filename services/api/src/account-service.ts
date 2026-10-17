import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, PoolClient } from "@kush/database";
import { enqueueRoleSync } from "./entitlement-service.js";
import { tokenHash } from "./password.js";
import { SupportError } from "./support-service.js";
import {
  newRecoveryCodes,
  newTotpSecret,
  openSecret,
  otpauthUrl,
  recoveryCodeHash,
  sealSecret,
  verifyTotp,
} from "./totp.js";

/** Website sessions: absolute lifetime and idle timeout. */
export const WEB_SESSION_DAYS = 30;
export const WEB_SESSION_IDLE_DAYS = 7;
/** How recently MFA must have been passed for sensitive actions. */
export const FRESH_MFA_MINUTES = 10;
const FLOW_MINUTES = 10;
const MFA_MAX_ATTEMPTS = 5;
const MFA_WINDOW_MINUTES = 15;

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const b64url = (buffer: Buffer) => buffer.toString("base64url");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface DiscordProfile {
  id: string;
  username: string;
  avatar: string | null;
}

/** Discord OAuth2 endpoints. Injectable so tests never call Discord. */
export interface DiscordOAuth {
  authorizeUrl(params: URLSearchParams): string;
  exchange(code: string, verifier: string): Promise<string>;
  profile(accessToken: string): Promise<DiscordProfile>;
}

export interface OAuthSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBase: string;
  authorizeUrl: string;
}

export function oauthSettingsFromEnv(): OAuthSettings | null {
  const clientId = process.env.KUSH_DISCORD_CLIENT_ID;
  const clientSecret = process.env.KUSH_DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.KUSH_DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    apiBase: process.env.KUSH_DISCORD_API_BASE ?? "https://discord.com/api/v10",
    // Overridable only so local end-to-end tests can use a mock Discord.
    authorizeUrl:
      process.env.KUSH_DISCORD_AUTHORIZE_URL ??
      "https://discord.com/oauth2/authorize",
  };
}

export function discordOAuth(settings: OAuthSettings): DiscordOAuth {
  return {
    authorizeUrl: (params) => {
      params.set("client_id", settings.clientId);
      params.set("redirect_uri", settings.redirectUri);
      params.set("response_type", "code");
      params.set("scope", "identify");
      return `${settings.authorizeUrl}?${params}`;
    },
    async exchange(code, verifier) {
      const response = await fetch(`${settings.apiBase}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: settings.redirectUri,
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) fail(400, "Discord sign-in failed");
      const body = (await response.json()) as { access_token?: unknown };
      if (typeof body.access_token !== "string")
        fail(400, "Discord sign-in failed");
      return body.access_token as string;
    },
    async profile(accessToken) {
      const response = await fetch(`${settings.apiBase}/users/@me`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) fail(502, "Discord is unavailable");
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.id !== "string" || !/^[0-9]{17,20}$/.test(body.id))
        fail(502, "Discord returned an invalid profile");
      return {
        id: body.id as string,
        username:
          typeof body.global_name === "string" && body.global_name
            ? body.global_name
            : typeof body.username === "string"
              ? body.username
              : "",
        avatar: typeof body.avatar === "string" ? body.avatar : null,
      };
    },
  };
}

export interface WebSession {
  sessionId: string;
  userId: string;
  role: string;
  mfaVerifiedAt: Date | null;
  /** The account has 2FA switched on (so this session must pass it). */
  mfaEnabled: boolean;
}

/** True when the session may see account data (2FA passed, if enabled). */
export const passedMfa = (session: WebSession) =>
  !session.mfaEnabled || session.mfaVerifiedAt !== null;

export class AccountService {
  constructor(
    private readonly pool: Pool,
    private readonly oauth: () => DiscordOAuth | null,
    private readonly supportTenantId: () => string | undefined = () =>
      process.env.KUSH_SUPPORT_TENANT_ID,
  ) {}

  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(
    c: Pick<PoolClient, "query">,
    actor: string | null,
    action: string,
  ) {
    return c.query("INSERT INTO audit_events(actor_id,action) VALUES($1,$2)", [
      actor,
      action,
    ]);
  }

  // ----------------------------------------------------------- OAuth2 flow

  /** `binding` is a random value the website keeps in an HttpOnly cookie. */
  async startDiscord(binding: string) {
    const oauth =
      this.oauth() ?? fail(503, "Discord sign-in is not configured");
    const state = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    await this.pool.query(
      "DELETE FROM oauth_flows WHERE expires_at < now() - interval '1 day'",
    );
    await this.pool.query(
      `INSERT INTO oauth_flows(state_hash,binding_hash,code_verifier,expires_at)
       VALUES($1,$2,$3,now() + make_interval(mins => $4))`,
      [sha(state), sha(binding), verifier, FLOW_MINUTES],
    );
    return {
      authorizeUrl: oauth.authorizeUrl(
        new URLSearchParams({
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "none",
        }),
      ),
    };
  }

  async completeDiscord(input: {
    state: string;
    code: string;
    binding: string;
    userAgent: string;
  }) {
    const oauth =
      this.oauth() ?? fail(503, "Discord sign-in is not configured");
    // Claim the flow atomically: a state can be redeemed once only.
    const flow = (
      await this.pool.query<{ binding_hash: string; code_verifier: string }>(
        `UPDATE oauth_flows SET used_at=now()
         WHERE state_hash=$1 AND used_at IS NULL AND expires_at > now()
         RETURNING binding_hash,code_verifier`,
        [sha(input.state)],
      )
    ).rows[0];
    if (!flow || !sameHash(flow.binding_hash, sha(input.binding))) {
      await this.audit(this.pool, null, "auth.discord.invalid_state");
      fail(400, "Sign-in expired or was started elsewhere. Please try again.");
    }
    const accessToken = await oauth.exchange(input.code, flow!.code_verifier);
    const profile = await oauth.profile(accessToken);
    return this.tx(async (c) => {
      const userId = await this.accountFor(c, profile);
      const disabled = (
        await c.query<{ disabled: boolean }>(
          "SELECT disabled FROM users WHERE id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0]!.disabled;
      if (disabled) {
        await this.audit(c, userId, "auth.discord.disabled");
        fail(403, "This account is disabled. Contact KUSH support.");
      }
      await this.linkSupportTenant(c, userId, profile.id);
      const session = await this.issueSession(c, userId, input.userAgent);
      await this.audit(c, userId, "auth.discord.login");
      const mfa = await c.query(
        "SELECT 1 FROM mfa_totp WHERE user_id=$1 AND enabled_at IS NOT NULL",
        [userId],
      );
      return { ...session, mfaEnabled: mfa.rowCount === 1 };
    });
  }

  /** Finds or creates the one KUSH account for a Discord identity. */
  private async accountFor(c: PoolClient, profile: DiscordProfile) {
    const existing = (
      await c.query<{ user_id: string }>(
        `UPDATE user_identities SET username=$2,avatar=$3,last_login_at=now()
         WHERE provider='discord' AND subject=$1 RETURNING user_id`,
        [profile.id, profile.username, profile.avatar],
      )
    ).rows[0];
    if (existing) return existing.user_id;
    // A guest identity from a Discord ticket becomes the real account, so
    // the customer keeps their ticket history.
    const tenant = this.supportTenantId();
    const guest = (
      await c.query<{ user_id: string }>(
        `SELECT user_id FROM discord_identities WHERE discord_user_id=$1
         ORDER BY (tenant_id::text = $2) DESC, created_at LIMIT 1`,
        [profile.id, tenant ?? ""],
      )
    ).rows[0];
    const userId =
      guest?.user_id ??
      (
        await c.query<{ id: string }>(
          `INSERT INTO users(email,password_hash,role,kind)
           VALUES($1,'DISCORD_IDENTITY_NO_LOGIN','customer','discord') RETURNING id`,
          [`discord-${profile.id}@accounts.kush.invalid`],
        )
      ).rows[0]!.id;
    // Concurrent first logins: the primary key decides, the loser reuses it.
    const inserted = await c.query<{ user_id: string }>(
      `INSERT INTO user_identities(provider,subject,user_id,username,avatar)
       VALUES('discord',$1,$2,$3,$4)
       ON CONFLICT (provider,subject) DO UPDATE SET last_login_at=now()
       RETURNING user_id`,
      [profile.id, userId, profile.username, profile.avatar],
    );
    await this.audit(
      c,
      inserted.rows[0]!.user_id,
      guest ? "account.upgraded_from_guest" : "account.created",
    );
    return inserted.rows[0]!.user_id;
  }

  /**
   * Signing in proves control of the Discord account, so it also becomes the
   * verified Discord link for the KUSH support tenant (drives role sync).
   */
  private async linkSupportTenant(
    c: PoolClient,
    userId: string,
    discordId: string,
  ) {
    const tenantId = this.supportTenantId();
    if (!tenantId) return;
    await c.query(
      `INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')
       ON CONFLICT (tenant_id,user_id) DO NOTHING`,
      [tenantId, userId],
    );
    const previous = await c.query<{ user_id: string }>(
      `UPDATE discord_account_links SET state='revoked'
       WHERE tenant_id=$1 AND discord_user_id=$2 AND state='verified' AND user_id<>$3
       RETURNING user_id`,
      [tenantId, discordId, userId],
    );
    for (const row of previous.rows)
      await this.audit(c, row.user_id, "discord.link.superseded_by_oauth");
    const current = await c.query(
      `INSERT INTO discord_account_links(tenant_id,user_id,discord_user_id,state,code_hash,request_id,expires_at,verified_at)
       VALUES($1,$2,$3,'verified',$4,$5,now(),now())
       ON CONFLICT (tenant_id,user_id) DO UPDATE
       SET discord_user_id=EXCLUDED.discord_user_id,state='verified',verified_at=now()
       WHERE discord_account_links.state<>'verified'
          OR discord_account_links.discord_user_id IS DISTINCT FROM EXCLUDED.discord_user_id`,
      [tenantId, userId, discordId, `oauth:${randomUUID()}`, randomUUID()],
    );
    if (current.rowCount || previous.rowCount)
      await enqueueRoleSync(c, tenantId, discordId, "linked");
  }

  /** A brand-new token every sign-in (no session fixation). */
  private async issueSession(c: PoolClient, userId: string, userAgent: string) {
    const token = randomBytes(32).toString("hex");
    await c.query(
      "DELETE FROM sessions WHERE user_id=$1 AND expires_at < now()",
      [userId],
    );
    const row = (
      await c.query<{ id: string; expires_at: Date }>(
        `INSERT INTO sessions(token_hash,user_id,expires_at,kind,user_agent)
         VALUES($1,$2,now() + make_interval(days => $3),'web',$4)
         RETURNING id,expires_at`,
        [tokenHash(token), userId, WEB_SESSION_DAYS, userAgent.slice(0, 200)],
      )
    ).rows[0]!;
    return { token, sessionId: row.id, expiresAt: row.expires_at };
  }

  // --------------------------------------------------------------- sessions

  /** Resolves a website session token; also enforces the idle timeout. */
  async session(token: string | undefined): Promise<WebSession | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = (
      await this.pool.query<{
        id: string;
        user_id: string;
        role: string;
        mfa_verified_at: Date | null;
        mfa_enabled: boolean;
      }>(
        `UPDATE sessions s SET last_seen_at=now()
         FROM users u
         WHERE s.token_hash=$1 AND s.kind='web' AND u.id=s.user_id AND u.disabled=false
           AND s.expires_at > now()
           AND s.last_seen_at > now() - make_interval(days => $2)
         RETURNING s.id,s.user_id,u.role,s.mfa_verified_at,
           EXISTS(SELECT 1 FROM mfa_totp m WHERE m.user_id=u.id AND m.enabled_at IS NOT NULL) AS mfa_enabled`,
        [tokenHash(token), WEB_SESSION_IDLE_DAYS],
      )
    ).rows[0];
    return row
      ? {
          sessionId: row.id,
          userId: row.user_id,
          role: row.role,
          mfaVerifiedAt: row.mfa_verified_at,
          mfaEnabled: row.mfa_enabled,
        }
      : null;
  }

  async profile(session: WebSession) {
    const row = (
      await this.pool.query(
        `SELECT u.id,u.display_name AS "displayName",u.created_at AS "createdAt",
                i.subject AS "discordId",i.username AS "discordUsername",i.avatar AS "discordAvatar",
                (m.enabled_at IS NOT NULL) AS "mfaEnabled",
                (SELECT count(*)::int FROM mfa_recovery_codes r WHERE r.user_id=u.id AND r.used_at IS NULL) AS "recoveryCodesLeft"
         FROM users u
         LEFT JOIN user_identities i ON i.user_id=u.id AND i.provider='discord'
         LEFT JOIN mfa_totp m ON m.user_id=u.id
         WHERE u.id=$1`,
        [session.userId],
      )
    ).rows[0];
    return {
      id: row.id,
      displayName: row.displayName ?? row.discordUsername ?? null,
      createdAt: row.createdAt,
      discord: row.discordId
        ? {
            id: row.discordId,
            username: row.discordUsername,
            avatar: row.discordAvatar,
          }
        : null,
      mfa: {
        enabled: row.mfaEnabled,
        recoveryCodesLeft: row.recoveryCodesLeft,
      },
      session: {
        id: session.sessionId,
        mfaVerified: session.mfaVerifiedAt !== null,
      },
    };
  }

  async updateProfile(session: WebSession, displayName: string | null) {
    await this.pool.query("UPDATE users SET display_name=$2 WHERE id=$1", [
      session.userId,
      displayName,
    ]);
    await this.audit(this.pool, session.userId, "account.profile.updated");
  }

  async listSessions(session: WebSession) {
    const rows = await this.pool.query(
      `SELECT id,created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",
              user_agent AS "userAgent",(mfa_verified_at IS NOT NULL) AS "mfaVerified"
       FROM sessions WHERE user_id=$1 AND kind='web' AND expires_at > now()
         AND last_seen_at > now() - make_interval(days => $2)
       ORDER BY last_seen_at DESC`,
      [session.userId, WEB_SESSION_IDLE_DAYS],
    );
    return rows.rows.map((row) => ({
      ...row,
      current: row.id === session.sessionId,
    }));
  }

  /** Only the owner's own sessions can be revoked (no cross-account access). */
  async revokeSession(session: WebSession, sessionId: string) {
    const result = await this.pool.query(
      "DELETE FROM sessions WHERE user_id=$1 AND id=$2",
      [session.userId, sessionId],
    );
    if (result.rowCount === 0) fail(404, "Session not found");
    await this.audit(this.pool, session.userId, "account.session.revoked");
  }

  async logout(session: WebSession, everywhere: "this" | "others" | "all") {
    const where =
      everywhere === "this"
        ? "id=$2"
        : everywhere === "others"
          ? "id<>$2"
          : "$2::uuid IS NOT NULL";
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE user_id=$1 AND ${where}`,
      [session.userId, session.sessionId],
    );
    await this.audit(this.pool, session.userId, `account.logout.${everywhere}`);
    return result.rowCount ?? 0;
  }

  // -------------------------------------------------------------------- MFA

  private async throttle(userId: string) {
    const row = (
      await this.pool.query<{ attempts: number }>(
        `INSERT INTO mfa_attempts(user_id,attempts) VALUES($1,1)
         ON CONFLICT (user_id) DO UPDATE SET
           attempts = CASE WHEN mfa_attempts.window_start < now() - make_interval(mins => $2) THEN 1 ELSE mfa_attempts.attempts + 1 END,
           window_start = CASE WHEN mfa_attempts.window_start < now() - make_interval(mins => $2) THEN now() ELSE mfa_attempts.window_start END
         RETURNING attempts`,
        [userId, MFA_WINDOW_MINUTES],
      )
    ).rows[0]!;
    if (row.attempts > MFA_MAX_ATTEMPTS) {
      await this.audit(this.pool, userId, "mfa.rate_limited");
      fail(429, "Too many attempts. Wait 15 minutes and try again.");
    }
  }

  private clearThrottle(c: Pick<PoolClient, "query">, userId: string) {
    return c.query("DELETE FROM mfa_attempts WHERE user_id=$1", [userId]);
  }

  /** Step 1 of enrolment. Not active until a code is verified. */
  async beginTotp(session: WebSession) {
    const active = await this.pool.query(
      "SELECT 1 FROM mfa_totp WHERE user_id=$1 AND enabled_at IS NOT NULL",
      [session.userId],
    );
    if (active.rowCount) fail(409, "Two-factor authentication is already on");
    const secret = newTotpSecret();
    await this.pool.query(
      `INSERT INTO mfa_totp(user_id,secret_ciphertext) VALUES($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,last_used_step=0,created_at=now()`,
      [session.userId, sealSecret(secret)],
    );
    const label = (
      await this.pool.query<{ name: string | null }>(
        `SELECT COALESCE(u.display_name,i.username) AS name FROM users u
         LEFT JOIN user_identities i ON i.user_id=u.id WHERE u.id=$1`,
        [session.userId],
      )
    ).rows[0]?.name;
    return { secret, otpauthUrl: otpauthUrl(secret, label || "account") };
  }

  /**
   * Checks a TOTP code (or, when allowed, a recovery code) for the account and
   * consumes it so it cannot be replayed. Runs inside the caller's transaction.
   */
  private async consumeFactor(
    c: PoolClient,
    userId: string,
    input: { code?: string | undefined; recoveryCode?: string | undefined },
    options: { pending?: boolean; allowRecovery?: boolean } = {},
  ) {
    const factor = (
      await c.query<{
        secret_ciphertext: string;
        last_used_step: string;
        enabled_at: Date | null;
      }>(
        "SELECT secret_ciphertext,last_used_step,enabled_at FROM mfa_totp WHERE user_id=$1 FOR UPDATE",
        [userId],
      )
    ).rows[0];
    if (!factor || (options.pending ? factor.enabled_at : !factor.enabled_at))
      return false;
    if (input.code) {
      const step = verifyTotp(openSecret(factor.secret_ciphertext), input.code);
      if (step === null || step <= Number(factor.last_used_step)) return false;
      await c.query("UPDATE mfa_totp SET last_used_step=$2 WHERE user_id=$1", [
        userId,
        step,
      ]);
      return true;
    }
    if (input.recoveryCode && options.allowRecovery) {
      const used = await c.query(
        "UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL",
        [userId, recoveryCodeHash(input.recoveryCode)],
      );
      if (used.rowCount === 1) {
        await this.audit(c, userId, "mfa.recovery_code.used");
        return true;
      }
    }
    return false;
  }

  private async replaceRecoveryCodes(c: PoolClient, userId: string) {
    const codes = newRecoveryCodes();
    await c.query("DELETE FROM mfa_recovery_codes WHERE user_id=$1", [userId]);
    for (const code of codes)
      await c.query(
        "INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)",
        [userId, recoveryCodeHash(code)],
      );
    return codes;
  }

  /** Step 2 of enrolment: proves the app works, then switches MFA on. */
  async enableTotp(session: WebSession, code: string) {
    await this.throttle(session.userId);
    return this.tx(async (c) => {
      if (
        !(await this.consumeFactor(
          c,
          session.userId,
          { code },
          { pending: true },
        ))
      )
        fail(
          400,
          "That code is not valid. Check your authenticator app's time.",
        );
      await c.query("UPDATE mfa_totp SET enabled_at=now() WHERE user_id=$1", [
        session.userId,
      ]);
      const recoveryCodes = await this.replaceRecoveryCodes(c, session.userId);
      // Other sessions must re-verify; this one is verified now.
      await c.query(
        "UPDATE sessions SET mfa_verified_at = CASE WHEN id=$2 THEN now() ELSE NULL END WHERE user_id=$1",
        [session.userId, session.sessionId],
      );
      await this.clearThrottle(c, session.userId);
      await this.audit(c, session.userId, "mfa.enabled");
      return { recoveryCodes };
    });
  }

  /** Marks this session as MFA-verified (sign-in step-up). */
  async verify(
    session: WebSession,
    input: { code?: string; recoveryCode?: string },
  ) {
    await this.throttle(session.userId);
    return this.tx(async (c) => {
      if (
        !(await this.consumeFactor(c, session.userId, input, {
          allowRecovery: true,
        }))
      ) {
        // Separate connection: the transaction is about to roll back.
        await this.audit(this.pool, session.userId, "mfa.verify.failed");
        fail(400, "That code is not valid");
      }
      await c.query("UPDATE sessions SET mfa_verified_at=now() WHERE id=$1", [
        session.sessionId,
      ]);
      await this.clearThrottle(c, session.userId);
      await this.audit(c, session.userId, "mfa.verified");
      return { verified: true };
    });
  }

  /** Sensitive actions need a fresh authenticator code, not just a session. */
  private async requireFresh(c: PoolClient, session: WebSession, code: string) {
    if (!(await this.consumeFactor(c, session.userId, { code }))) {
      // Separate connection: the transaction is about to roll back.
      await this.audit(this.pool, session.userId, "mfa.step_up.failed");
      fail(400, "That code is not valid");
    }
  }

  async disableTotp(session: WebSession, code: string) {
    await this.throttle(session.userId);
    return this.tx(async (c) => {
      await this.requireFresh(c, session, code);
      await c.query("DELETE FROM mfa_totp WHERE user_id=$1", [session.userId]);
      await c.query("DELETE FROM mfa_recovery_codes WHERE user_id=$1", [
        session.userId,
      ]);
      // Turning MFA off signs out every other device.
      await c.query("DELETE FROM sessions WHERE user_id=$1 AND id<>$2", [
        session.userId,
        session.sessionId,
      ]);
      await c.query("UPDATE sessions SET mfa_verified_at=NULL WHERE id=$1", [
        session.sessionId,
      ]);
      await this.clearThrottle(c, session.userId);
      await this.audit(c, session.userId, "mfa.disabled");
      return { disabled: true };
    });
  }

  async regenerateRecoveryCodes(session: WebSession, code: string) {
    await this.throttle(session.userId);
    return this.tx(async (c) => {
      await this.requireFresh(c, session, code);
      const recoveryCodes = await this.replaceRecoveryCodes(c, session.userId);
      await this.clearThrottle(c, session.userId);
      await this.audit(c, session.userId, "mfa.recovery_codes.regenerated");
      return { recoveryCodes };
    });
  }
}

export const isFreshMfa = (session: WebSession, now = Date.now()) =>
  session.mfaVerifiedAt !== null &&
  now - session.mfaVerifiedAt.getTime() < FRESH_MFA_MINUTES * 60_000;
