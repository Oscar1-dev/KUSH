-- Numbered moderation cases. Every action is recorded once, whether staff
-- used a bot command ('bot') or Discord's own tools ('discord', taken from
-- the audit log), so !cases shows a member's full history.
ALTER TABLE support_tenants ADD COLUMN next_case_number integer NOT NULL DEFAULT 1;

CREATE TABLE moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  number integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('warn','timeout','untimeout','kick','ban','unban','note')),
  target_discord_id text NOT NULL CHECK (target_discord_id ~ '^[0-9]{17,20}$'),
  moderator_discord_id text CHECK (moderator_discord_id IS NULL OR moderator_discord_id ~ '^[0-9]{17,20}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  source text NOT NULL CHECK (source IN ('bot','discord')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX moderation_cases_target_idx ON moderation_cases(tenant_id, target_discord_id, created_at DESC);
