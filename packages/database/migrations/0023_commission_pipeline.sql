-- Commission-first launch: a Payment Pending stage after the customer
-- accepts a quote (payment is arranged off-site for now; staff confirm the
-- deposit by hand, nothing is collected or auto-confirmed), plus the extra
-- request details customers give up front.
ALTER TABLE commercial_requests DROP CONSTRAINT commercial_requests_status_check;
ALTER TABLE commercial_requests ADD CONSTRAINT commercial_requests_status_check CHECK (status IN (
  'submitted','reviewing','awaiting_customer','quoted','accepted','payment_pending','in_progress',
  'awaiting_review','approved','published','completed','rejected','cancelled'));

ALTER TABLE commercial_requests ADD COLUMN service_tier text CHECK (service_tier IS NULL OR service_tier IN ('starter','standard','premium'));
ALTER TABLE commercial_requests ADD COLUMN reference_links text CHECK (reference_links IS NULL OR length(reference_links) <= 2000);
ALTER TABLE commercial_requests ADD COLUMN contact_preference text CHECK (contact_preference IS NULL OR length(contact_preference) <= 200);
-- Where the request was made, for reporting ('website' or 'discord').
ALTER TABLE commercial_requests ADD COLUMN origin text NOT NULL DEFAULT 'website' CHECK (origin IN ('website','discord'));
