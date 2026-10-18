-- Commission workflow: a linked conversation, quotes and milestones.
-- Quotes are written proposals only; no payment is taken anywhere.

-- The support ticket that carries the commission's conversation.
ALTER TABLE commercial_requests ADD COLUMN ticket_id uuid;

CREATE TABLE commission_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  request_id uuid NOT NULL REFERENCES commercial_requests(id) ON DELETE CASCADE,
  amount text NOT NULL CHECK (length(amount) BETWEEN 1 AND 60),
  summary text NOT NULL CHECK (length(summary) BETWEEN 10 AND 5000),
  timeframe text CHECK (timeframe IS NULL OR length(timeframe) <= 200),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','withdrawn')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decline_reason text CHECK (decline_reason IS NULL OR length(decline_reason) <= 2000)
);
-- One open quote per commission at a time.
CREATE UNIQUE INDEX commission_quotes_open_idx ON commission_quotes(request_id) WHERE status = 'proposed';

CREATE TABLE commission_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  request_id uuid NOT NULL REFERENCES commercial_requests(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done')),
  position integer NOT NULL DEFAULT 0,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_milestones_request_idx ON commission_milestones(request_id, position);

ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK (kind IN (
  'ticket.created', 'ticket.message', 'ticket.status',
  'commission.created', 'commission.status', 'commission.quote', 'commission.milestone',
  'application.created', 'application.channel', 'application.message',
  'application.status', 'agreement.issued', 'staff.role_grant'));
