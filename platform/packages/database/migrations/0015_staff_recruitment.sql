-- Staff recruitment, applications and NDA agreements. Additive only.

-- Positions people can apply for. `staff_role` is the dashboard role the
-- position leads to; `discord_role_id` is the Discord role an administrator
-- may grant at activation (never granted automatically).
CREATE TABLE staff_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  key text NOT NULL CHECK (key ~ '^[a-z0-9-]{2,40}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 80),
  summary text NOT NULL CHECK (length(summary) BETWEEN 10 AND 600),
  responsibilities text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  staff_role text NOT NULL CHECK (staff_role IN ('support','developer','moderator','manager','administrator')),
  discord_role_id text CHECK (discord_role_id IS NULL OR discord_role_id ~ '^[0-9]{17,20}$'),
  portfolio_required boolean NOT NULL DEFAULT false,
  open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE staff_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  number integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  position_id uuid NOT NULL REFERENCES staff_positions(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','reviewing','more_info','interview','conditionally_accepted',
    'nda_issued','nda_signed','approved','activated','rejected','withdrawn')),
  preferred_name text NOT NULL CHECK (length(preferred_name) BETWEEN 1 AND 80),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  experience text NOT NULL CHECK (length(experience) BETWEEN 20 AND 5000),
  skills text NOT NULL CHECK (length(skills) BETWEEN 5 AND 3000),
  availability text NOT NULL CHECK (length(availability) BETWEEN 2 AND 500),
  motivation text NOT NULL CHECK (length(motivation) BETWEEN 20 AND 3000),
  portfolio_url text CHECK (portfolio_url IS NULL OR length(portfolio_url) <= 500),
  -- Staff-only review notes (never shown to the applicant).
  review_note text,
  -- Set at "identity and role approval"; the role finally granted.
  approved_staff_role text CHECK (approved_staff_role IS NULL OR approved_staff_role IN ('support','developer','moderator','manager','administrator')),
  discord_channel_id text UNIQUE,
  version integer NOT NULL DEFAULT 1,
  request_id uuid NOT NULL,
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, user_id, request_id)
);
CREATE INDEX staff_applications_user_idx ON staff_applications(tenant_id, user_id);
CREATE INDEX staff_applications_status_idx ON staff_applications(tenant_id, status, updated_at);
-- One live application per person per position.
CREATE UNIQUE INDEX staff_applications_one_open_idx ON staff_applications(tenant_id, user_id, position_id)
  WHERE status NOT IN ('rejected','withdrawn','activated');

ALTER TABLE support_tenants ADD COLUMN next_application_number integer NOT NULL DEFAULT 1;

CREATE TABLE staff_application_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES staff_applications(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('message','note')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, author_id, request_id)
);

CREATE TABLE staff_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES staff_applications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Agreement templates are immutable once published: a new text is a new
-- version. The hash proves which exact text a person signed.
CREATE TABLE agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  body_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

CREATE TABLE agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  template_id uuid NOT NULL REFERENCES agreement_templates(id),
  user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES staff_applications(id),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','signed','voided','expired')),
  issued_by uuid NOT NULL REFERENCES users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  signed_at timestamptz,
  legal_name text,
  email text,
  signature text,
  accepted_statement text,
  signed_body_sha256 text,
  signer_ip_hash text,
  signer_user_agent text,
  voided_reason text,
  CHECK (status <> 'signed' OR (signed_at IS NOT NULL AND legal_name IS NOT NULL AND email IS NOT NULL
         AND signature IS NOT NULL AND accepted_statement IS NOT NULL AND signed_body_sha256 IS NOT NULL))
);
CREATE INDEX agreements_user_idx ON agreements(tenant_id, user_id);
-- At most one live (issued or signed) NDA per application.
CREATE UNIQUE INDEX agreements_one_live_idx ON agreements(application_id) WHERE status IN ('issued','signed');

-- Outbox: new notification kinds for recruitment.
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK (kind IN (
  'ticket.created', 'ticket.message', 'ticket.status',
  'commission.created', 'commission.status',
  'application.created', 'application.channel', 'application.message',
  'application.status', 'agreement.issued', 'staff.role_grant'));
