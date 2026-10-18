CREATE TABLE discord_link_attempts (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id,discord_user_id)
);
