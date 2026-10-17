CREATE TABLE clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation text NOT NULL, contact_email text NOT NULL, notes text NOT NULL DEFAULT '',
 archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id),
 document jsonb NOT NULL CHECK(jsonb_typeof(document) = 'object'), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_idx ON projects(client_id);
