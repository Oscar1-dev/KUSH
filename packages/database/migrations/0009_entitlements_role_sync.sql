-- Rules acceptance, products, entitlements, purchase events and the
-- Discord role-synchronisation queue. PostgreSQL is the source of truth:
-- Discord roles are derived from these records, never the other way round.

-- Members who accepted the rules, kept across leave/rejoin so returning
-- members are not asked again and keep their Member role.
CREATE TABLE discord_members (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  rules_accepted_at timestamptz,
  rules_version text,
  in_guild boolean NOT NULL DEFAULT true,
  left_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_user_id)
);

-- Only real, owner-created products belong here; nothing is pre-seeded.
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  discord_role_id text CHECK (discord_role_id IS NULL OR discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, id)
);

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked','refunded','expired')),
  source text NOT NULL CHECK (source IN ('simulated','manual','provider')),
  source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 200),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  -- One entitlement per order line: replays update, never duplicate.
  UNIQUE (tenant_id, source, source_reference)
);
CREATE INDEX entitlements_user_idx ON entitlements(tenant_id, user_id, status);

-- Verified purchase events. event_id makes processing idempotent.
CREATE TABLE purchase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  provider text NOT NULL CHECK (provider IN ('simulated')),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  type text NOT NULL CHECK (type IN ('purchase.completed','purchase.refunded','purchase.chargeback','subscription.expired','licence.revoked')),
  payload jsonb NOT NULL,
  result text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, event_id)
);

-- Pending Discord role reconciliations, retried with backoff.
CREATE TABLE role_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- At most one pending job per member: new reasons coalesce into it.
CREATE UNIQUE INDEX role_sync_jobs_pending_idx ON role_sync_jobs(tenant_id, discord_user_id) WHERE status = 'pending';
CREATE INDEX role_sync_jobs_due_idx ON role_sync_jobs(tenant_id, status, next_attempt_at);
