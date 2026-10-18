CREATE TABLE commercial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  requester_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('commission','marketplace','partner')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','awaiting_customer','quoted','accepted','in_progress','awaiting_review','approved','published','completed','rejected','cancelled')),
  title text NOT NULL,
  details text NOT NULL,
  category text NOT NULL,
  approximate_budget text,
  preferred_timeframe text,
  product_url text,
  assigned_user_id uuid,
  review_note text,
  version integer NOT NULL DEFAULT 1,
  create_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,requester_id,create_request_id),
  FOREIGN KEY (tenant_id,requester_id) REFERENCES support_members(tenant_id,user_id),
  FOREIGN KEY (tenant_id,assigned_user_id) REFERENCES support_members(tenant_id,user_id)
);
CREATE INDEX commercial_requests_tenant_status_idx ON commercial_requests(tenant_id,kind,status,created_at);

CREATE TABLE discord_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  user_id uuid NOT NULL,
  discord_user_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','revoked')),
  code_hash text NOT NULL,
  request_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id),
  UNIQUE (tenant_id,request_id),
  UNIQUE (tenant_id,discord_user_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES support_members(tenant_id,user_id)
);
