BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE UNIQUE INDEX IF NOT EXISTS users_organization_id_key ON users(organization_id, id);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  title varchar(160) NOT NULL,
  description varchar(2000) NOT NULL,
  department_id uuid NOT NULL,
  category_id uuid NOT NULL,
  project_id uuid NOT NULL,
  assignee_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  priority text NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
  entered_date date NOT NULL,
  due_date date NOT NULL,
  reminder_date date NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, department_id) REFERENCES departments(organization_id, id),
  FOREIGN KEY (organization_id, category_id) REFERENCES categories(organization_id, id),
  FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
  FOREIGN KEY (organization_id, assignee_id) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, creator_id) REFERENCES users(organization_id, id)
);
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_check;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_check1;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_due_date_check;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_reminder_date_check;
CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets(organization_id, assignee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_creator_idx ON tickets(organization_id, creator_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ticket_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('feedback', 'update')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ticket_events_thread_idx ON ticket_events(ticket_id, id);
COMMIT;
