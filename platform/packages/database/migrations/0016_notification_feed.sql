-- Customer notification feed: the feed itself is derived from the
-- notification outbox (no copy of the data); this only records how far the
-- customer has read.
ALTER TABLE users ADD COLUMN notifications_seen_at timestamptz;
CREATE INDEX notification_jobs_subject_idx ON notification_jobs(tenant_id, subject_id, created_at);
