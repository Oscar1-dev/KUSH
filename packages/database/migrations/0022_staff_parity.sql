-- Website equivalents of Discord-only staff actions: removing a vouch's
-- Discord message and offboarding staff both go through the outbox, so the
-- bot does the Discord side with retries.
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK (kind IN (
  'ticket.created', 'ticket.message', 'ticket.status',
  'commission.created', 'commission.status', 'commission.quote', 'commission.milestone',
  'application.created', 'application.channel', 'application.message',
  'application.status', 'agreement.issued', 'staff.role_grant',
  'vouch.hidden', 'staff.offboarded'));
