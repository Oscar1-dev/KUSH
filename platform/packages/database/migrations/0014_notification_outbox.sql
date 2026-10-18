-- Outbox of things the Discord bot should announce (new website tickets,
-- replies to mirror into ticket channels, customer DMs). Rows are written
-- alongside the change they describe; the bot claims, delivers and confirms
-- them, with retries. `dedupe_key` makes enqueueing idempotent.
CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  kind text NOT NULL CHECK (kind IN (
    'ticket.created', 'ticket.message', 'ticket.status',
    'commission.created', 'commission.status'
  )),
  subject_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- Set while a bot holds the job; expired leases are picked up again.
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, dedupe_key)
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs(tenant_id, next_attempt_at) WHERE status = 'pending';
