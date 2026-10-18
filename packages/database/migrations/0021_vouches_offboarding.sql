-- Customer vouches (public testimonials posted from Discord) and staff
-- offboarding records.
ALTER TABLE support_tenants ADD COLUMN next_vouch_number integer NOT NULL DEFAULT 1;

CREATE TABLE vouches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  number integer NOT NULL,
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  -- Display name at the time of vouching; shown publicly with the vouch.
  author_name text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 64),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (length(body) BETWEEN 10 AND 600),
  message_id text CHECK (message_id IS NULL OR message_id ~ '^[0-9]{17,20}$'),
  hidden_at timestamptz,
  hidden_by_discord_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX vouches_author_idx ON vouches(tenant_id, discord_user_id, created_at DESC);
CREATE INDEX vouches_public_idx ON vouches(tenant_id, created_at DESC) WHERE hidden_at IS NULL;

-- Offboarded staff stay on record (agreements, history) but leave the team.
-- Regaining a staff role clears these on the next verified staff sign-in.
ALTER TABLE staff_members ADD COLUMN offboarded_at timestamptz;
ALTER TABLE staff_members ADD COLUMN offboarded_reason text CHECK (offboarded_reason IS NULL OR length(offboarded_reason) <= 1000);
ALTER TABLE staff_members ADD COLUMN offboarded_by_discord_id text;
