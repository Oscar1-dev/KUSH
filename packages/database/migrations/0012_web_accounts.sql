-- KUSH web accounts: Discord OAuth2 sign-in, website sessions, MFA.
-- Additive only. Existing staff password logins and Discord guest
-- identities keep working unchanged.

-- One KUSH account per external identity, across all tenants.
CREATE TABLE user_identities (
  provider text NOT NULL CHECK (provider IN ('discord')),
  subject text NOT NULL CHECK (subject ~ '^[0-9]{17,20}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  avatar text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

ALTER TABLE users ADD COLUMN display_name text
  CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 40);

-- Pending OAuth2 authorisations. The PKCE verifier never leaves the API;
-- the browser binding stops login CSRF (a callback is only accepted from
-- the browser that started the flow).
CREATE TABLE oauth_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  binding_hash text NOT NULL,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX oauth_flows_expiry_idx ON oauth_flows(expires_at);

-- Website sessions reuse the sessions table. Existing rows are API sessions.
ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD CONSTRAINT sessions_id_key UNIQUE (id);
ALTER TABLE sessions ADD COLUMN kind text NOT NULL DEFAULT 'api' CHECK (kind IN ('api','web'));
ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN user_agent text NOT NULL DEFAULT '';
-- Set when this session passed a TOTP check (staff and sensitive actions).
ALTER TABLE sessions ADD COLUMN mfa_verified_at timestamptz;

-- TOTP factor. The secret is encrypted with KUSH_MFA_KEY (AES-256-GCM).
CREATE TABLE mfa_totp (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  enabled_at timestamptz,
  last_used_step bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mfa_recovery_codes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);
-- Per-account MFA attempt throttling.
CREATE TABLE mfa_attempts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
