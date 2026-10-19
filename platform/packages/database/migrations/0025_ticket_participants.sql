-- People staff add to a ticket conversation (e.g. a developer pulled into a
-- support ticket, or a customer's colleague). They see and write in the
-- ticket's Discord channel; they gain no other access.
CREATE TABLE support_ticket_participants (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  added_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id, discord_user_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id)
);
