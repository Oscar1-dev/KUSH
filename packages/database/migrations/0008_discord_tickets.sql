-- Discord-native support identities, ticket channel mappings and a
-- moderator tenant role that only sees moderation reports.

-- 'discord' users are support identities for Discord members without a KUSH
-- account. They hold a non-scrypt password sentinel and can never sign in.
ALTER TABLE users ADD COLUMN kind text NOT NULL DEFAULT 'account' CHECK (kind IN ('account','discord'));
ALTER TABLE users ADD CONSTRAINT users_discord_kind_customer CHECK (kind = 'account' OR role = 'customer');

ALTER TABLE support_members DROP CONSTRAINT support_members_role_check;
ALTER TABLE support_members ADD CONSTRAINT support_members_role_check CHECK (role IN ('owner','staff','moderator','customer'));

CREATE TABLE discord_identities (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_user_id),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES support_members(tenant_id, user_id)
);

CREATE TABLE discord_ticket_channels (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  channel_id text NOT NULL UNIQUE CHECK (channel_id ~ '^[0-9]{17,20}$'),
  queue text NOT NULL CHECK (queue IN ('support','reports')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id)
);
CREATE INDEX discord_ticket_channels_state_idx ON discord_ticket_channels(tenant_id, state);
