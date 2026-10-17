-- Staff dashboard authorisation. Additive only.
--
-- Staff roles are never stored as "who is staff". They are derived on each
-- request from the member's *current* Discord roles (fetched live by the API)
-- through this mapping of Discord role IDs (never names) to KUSH staff roles.
CREATE TABLE staff_role_mappings (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_role_id text NOT NULL CHECK (discord_role_id ~ '^[0-9]{17,20}$'),
  staff_role text NOT NULL CHECK (staff_role IN ('support','developer','moderator','manager','administrator','owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_role_id, staff_role)
);

-- Last verified staff roster: who has used the staff dashboard and with
-- which roles. Used only to offer assignees; every assignment re-checks the
-- assignee live, and access itself never reads this table.
CREATE TABLE staff_members (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
