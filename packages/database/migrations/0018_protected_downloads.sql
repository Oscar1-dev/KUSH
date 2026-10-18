-- Protected downloads for products. Files live outside the web root
-- (KUSH_DOWNLOADS_DIR); the database records what exists and who fetched it.
CREATE TABLE product_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  product_id uuid NOT NULL,
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
  filename text NOT NULL CHECK (filename ~ '^[A-Za-z0-9._ -]{1,120}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^[a-f0-9-]{36}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX product_files_product_idx ON product_files(tenant_id, product_id, active);

CREATE TABLE download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES support_tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  file_id uuid NOT NULL REFERENCES product_files(id),
  kind text NOT NULL CHECK (kind IN ('link_issued','downloaded','denied')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX download_events_user_idx ON download_events(tenant_id, user_id, created_at);
