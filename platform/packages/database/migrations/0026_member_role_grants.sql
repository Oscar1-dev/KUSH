-- Discord roles granted or revoked by staff (website or /staff role).
-- Only programme/customer roles from an allowlist; staff roles never come
-- from here. The bot's role sync applies the current state; a revoked row
-- removes only a role this system granted, so roles given by hand in
-- Discord are left alone.
CREATE TABLE member_role_grants (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  role_key text NOT NULL CHECK (role_key IN ('verified-customer','beta-tester','creative-partner','approved-seller','verified-reseller')),
  state text NOT NULL CHECK (state IN ('granted','revoked')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  changed_by uuid NOT NULL REFERENCES users(id),
  last_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_user_id, role_key)
);
-- Every change, for the audit trail shown on the customer page.
CREATE TABLE member_role_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL,
  role_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('granted','revoked')),
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  source text NOT NULL CHECK (source IN ('website','discord')),
  request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_role_grant_events_member_idx ON member_role_grant_events(tenant_id, discord_user_id, created_at DESC);
