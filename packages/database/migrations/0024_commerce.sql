-- Commerce foundation: backend-managed catalogue, sellable products, orders,
-- payments (Stripe or recorded offline), refunds, Stripe webhook log,
-- store-credit ledger and referrals. Money is integer pence.

-- --------------------------------------------------------------- catalogue

CREATE TABLE catalogue_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  category text NOT NULL CHECK (category IN ('websites','web-apps','discord','software','gaming','technical','creative','automation')),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  summary text NOT NULL CHECK (length(summary) BETWEEN 2 AND 300),
  -- Page content: headline, intro, offerings, deliverables, goodFit,
  -- availability {now, partner}, faqs, options. Validated in the API.
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  -- How it's delivered: by KUSH, needs a partner, or always quote-only.
  fulfilment text NOT NULL DEFAULT 'in_house' CHECK (fulfilment IN ('in_house','partner_dependent','quote_only')),
  position integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE catalogue_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  service_id uuid NOT NULL REFERENCES catalogue_services(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'tier' CHECK (kind IN ('tier','addon')),
  tier_key text CHECK (tier_key IS NULL OR tier_key IN ('starter','standard','premium')),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 600),
  pricing text NOT NULL CHECK (pricing IN ('fixed','from','range','quote')),
  amount_pence integer CHECK (amount_pence IS NULL OR amount_pence >= 0),
  max_pence integer CHECK (max_pence IS NULL OR max_pence >= 0),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  delivery_estimate text CHECK (delivery_estimate IS NULL OR length(delivery_estimate) <= 80),
  includes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','archived')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (pricing = 'quote' AND amount_pence IS NULL AND max_pence IS NULL) OR
    (pricing IN ('fixed','from') AND amount_pence IS NOT NULL AND max_pence IS NULL) OR
    (pricing = 'range' AND amount_pence IS NOT NULL AND max_pence IS NOT NULL AND max_pence > amount_pence)
  )
);
CREATE INDEX catalogue_offers_service_idx ON catalogue_offers(service_id, position);

-- ---------------------------------------------------- sellable products

ALTER TABLE products ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000);
ALTER TABLE products ADD COLUMN category text CHECK (category IS NULL OR length(category) <= 60);
ALTER TABLE products ADD COLUMN image_url text CHECK (image_url IS NULL OR image_url ~ '^https://');
ALTER TABLE products ADD COLUMN price_pence integer CHECK (price_pence IS NULL OR price_pence >= 0);
ALTER TABLE products ADD COLUMN currency text NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE products ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','hidden'));
ALTER TABLE products ADD COLUMN stripe_product_id text;
ALTER TABLE products ADD COLUMN stripe_price_id text;
-- Eligible as a referral reward (25-invite milestone: worth up to the cap).
ALTER TABLE products ADD COLUMN reward_eligible boolean NOT NULL DEFAULT false;

-- -------------------------------------------------------------- orders

ALTER TABLE support_tenants ADD COLUMN next_order_number integer NOT NULL DEFAULT 1001;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  number integer NOT NULL,
  customer_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('product','commission')),
  product_id uuid REFERENCES products(id),
  commission_id uuid REFERENCES commercial_requests(id),
  quote_id uuid,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','expired','refunded','partially_refunded')),
  currency text NOT NULL DEFAULT 'GBP',
  subtotal_pence integer NOT NULL CHECK (subtotal_pence >= 0),
  credit_applied_pence integer NOT NULL DEFAULT 0 CHECK (credit_applied_pence >= 0),
  -- What Stripe is asked to collect: subtotal minus credit, never negative.
  total_pence integer NOT NULL CHECK (total_pence >= 0),
  refunded_pence integer NOT NULL DEFAULT 0 CHECK (refunded_pence >= 0),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  create_request_id uuid NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, customer_id, create_request_id),
  CHECK (total_pence + credit_applied_pence = subtotal_pence),
  CHECK (refunded_pence <= subtotal_pence),
  CHECK ((kind = 'product' AND product_id IS NOT NULL) OR (kind = 'commission' AND commission_id IS NOT NULL))
);
CREATE INDEX orders_customer_idx ON orders(tenant_id, customer_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(tenant_id, status, created_at DESC);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL CHECK (provider IN ('stripe','store_credit','offline')),
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  refunded_pence integer NOT NULL DEFAULT 0 CHECK (refunded_pence >= 0),
  provider_reference text,
  receipt_url text,
  recorded_by uuid REFERENCES users(id),
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_pence <= amount_pence),
  UNIQUE (provider, provider_reference)
);
CREATE INDEX payments_order_idx ON payments(order_id);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  stripe_refund_id text UNIQUE,
  requested_by uuid NOT NULL REFERENCES users(id),
  create_request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every Stripe webhook event, once. The primary key is Stripe's event ID,
-- so a replayed or duplicated delivery is a no-op.
CREATE TABLE stripe_events (
  id text PRIMARY KEY CHECK (id ~ '^evt_'),
  type text NOT NULL,
  livemode boolean NOT NULL,
  created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text,
  payload jsonb NOT NULL
);

-- ------------------------------------------------------- store credit

CREATE TABLE credit_accounts (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  balance_pence integer NOT NULL DEFAULT 0 CHECK (balance_pence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  amount_pence integer NOT NULL CHECK (amount_pence <> 0),
  kind text NOT NULL CHECK (kind IN ('reward','purchase','purchase_release','refund','adjustment')),
  reference text CHECK (reference IS NULL OR length(reference) <= 120),
  note text CHECK (note IS NULL OR length(note) <= 500),
  -- Makes every movement idempotent: the same key can never apply twice.
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 6 AND 160),
  balance_after_pence integer NOT NULL CHECK (balance_after_pence >= 0),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX credit_transactions_user_idx ON credit_transactions(tenant_id, user_id, created_at DESC);

-- ---------------------------------------------------------- referrals

CREATE TABLE referral_codes (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  code text NOT NULL CHECK (code ~ '^[A-Z2-9]{6,10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_user_id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  inviter_discord_id text NOT NULL CHECK (inviter_discord_id ~ '^[0-9]{17,20}$'),
  invited_discord_id text NOT NULL CHECK (invited_discord_id ~ '^[0-9]{17,20}$'),
  source text NOT NULL CHECK (source IN ('invite','code')),
  invite_code text CHECK (invite_code IS NULL OR length(invite_code) <= 40),
  -- How confident attribution is: 'exact' (only one invite moved),
  -- 'probable' (several candidates, best match) or 'claimed' (code).
  confidence text NOT NULL CHECK (confidence IN ('exact','probable','claimed')),
  account_created_at timestamptz NOT NULL,
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','disqualified','flagged')),
  status_reason text CHECK (status_reason IS NULL OR length(status_reason) <= 300),
  qualified_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A member can only ever be referred once, whoever claims it first.
  UNIQUE (tenant_id, invited_discord_id),
  CHECK (inviter_discord_id <> invited_discord_id)
);
CREATE INDEX referrals_inviter_idx ON referrals(tenant_id, inviter_discord_id, status);

CREATE TABLE referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  milestone integer NOT NULL CHECK (milestone > 0),
  reward_type text NOT NULL CHECK (reward_type IN ('credit','service_voucher','product_voucher')),
  value_pence integer CHECK (value_pence IS NULL OR value_pence >= 0),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','revoked')),
  credit_transaction_id uuid REFERENCES credit_transactions(id),
  redeemed_order_id uuid REFERENCES orders(id),
  redeemed_note text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  -- Each milestone pays out once per member, ever.
  UNIQUE (tenant_id, discord_user_id, milestone)
);

-- ------------------------------------------------------ platform settings

CREATE TABLE platform_settings (
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

-- --------------------------------------------- commission status additions

ALTER TABLE commercial_requests DROP CONSTRAINT commercial_requests_status_check;
ALTER TABLE commercial_requests ADD CONSTRAINT commercial_requests_status_check CHECK (status IN (
  'submitted','reviewing','awaiting_customer','quoted','accepted','payment_pending','paid','in_progress',
  'awaiting_review','revision_requested','approved','published','completed','rejected','cancelled','refunded'));

ALTER TABLE commission_quotes ADD COLUMN deliverables text CHECK (deliverables IS NULL OR length(deliverables) <= 4000);
ALTER TABLE commission_quotes ADD COLUMN revisions integer CHECK (revisions IS NULL OR revisions BETWEEN 0 AND 50);
ALTER TABLE commission_quotes ADD COLUMN optional_services text CHECK (optional_services IS NULL OR length(optional_services) <= 2000);
ALTER TABLE commission_quotes ADD COLUMN expires_at timestamptz;
ALTER TABLE commission_quotes ADD COLUMN amount_pence integer CHECK (amount_pence IS NULL OR amount_pence > 0);

-- New outbox kinds for payments, refunds and referral rewards.
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK (kind IN (
  'ticket.created', 'ticket.message', 'ticket.status',
  'commission.created', 'commission.status', 'commission.quote', 'commission.milestone',
  'application.created', 'application.channel', 'application.message',
  'application.status', 'agreement.issued', 'staff.role_grant',
  'vouch.hidden', 'staff.offboarded',
  'order.paid', 'order.refunded', 'referral.reward'));
