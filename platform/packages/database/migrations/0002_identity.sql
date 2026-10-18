ALTER TABLE users ADD COLUMN disabled boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE login_attempts (ip_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1);
CREATE TABLE connection_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80), kind text NOT NULL DEFAULT 'local' CHECK (kind = 'local'), endpoint text NOT NULL CHECK (endpoint IN ('http://127.0.0.1:4310','http://localhost:4310')), created_at timestamptz NOT NULL DEFAULT now());
