ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN('admin','operator','viewer','customer'));
ALTER TABLE projects ADD CONSTRAINT projects_id_client_unique UNIQUE(id,client_id);
CREATE TABLE support_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,client_id uuid REFERENCES clients(id),project_id uuid,
 guild_id text UNIQUE CHECK(guild_id IS NULL OR guild_id ~ '^[0-9]{17,20}$'),guild_status text NOT NULL DEFAULT 'unverified' CHECK(guild_status='unverified'),
 config jsonb NOT NULL,next_ticket_number integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(project_id IS NULL OR client_id IS NOT NULL),FOREIGN KEY(project_id,client_id) REFERENCES projects(id,client_id)
);
ALTER TABLE audit_events ADD COLUMN tenant_id uuid REFERENCES support_tenants(id);
CREATE INDEX audit_tenant_idx ON audit_events(tenant_id,created_at);
CREATE TABLE support_members (
 tenant_id uuid NOT NULL REFERENCES support_tenants(id),user_id uuid NOT NULL REFERENCES users(id),role text NOT NULL CHECK(role IN('owner','staff','customer')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE support_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES support_tenants(id),number integer NOT NULL,customer_id uuid NOT NULL,
 category text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','pending','in_progress','waiting_for_customer','resolved','closed','reopened')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),assigned_user_id uuid,version integer NOT NULL DEFAULT 1,description text NOT NULL,
 closure_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),closed_at timestamptz,create_request_id uuid NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,customer_id,create_request_id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES support_members(tenant_id,user_id),FOREIGN KEY(tenant_id,assigned_user_id) REFERENCES support_members(tenant_id,user_id)
);
CREATE INDEX support_ticket_tenant_idx ON support_tickets(tenant_id,updated_at);
CREATE TABLE support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,ticket_id uuid NOT NULL,author_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('reply','note')),content text NOT NULL,request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES support_tickets(tenant_id,id),FOREIGN KEY(tenant_id,author_id) REFERENCES support_members(tenant_id,user_id),UNIQUE(tenant_id,ticket_id,author_id,request_id)
);
CREATE TABLE support_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,ticket_id uuid NOT NULL,actor_id uuid NOT NULL,audience text NOT NULL CHECK(audience IN('public','staff')),action text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES support_tickets(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES support_members(tenant_id,user_id)
);

