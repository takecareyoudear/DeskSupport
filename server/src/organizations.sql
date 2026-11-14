-- Run atomically and serialize startup migrations across API instances.
BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE SEQUENCE IF NOT EXISTS organization_number_seq MINVALUE 100000 MAXVALUE 999999 START 100000 NO CYCLE;
CREATE TABLE IF NOT EXISTS organizations (
  id integer PRIMARY KEY DEFAULT nextval('organization_number_seq') CHECK (id BETWEEN 100000 AND 999999),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(10) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','member'));
-- Existing accounts each receive a workspace; preserve their email/password login.
DO $$
DECLARE account record; organization_number integer;
BEGIN
  FOR account IN SELECT id FROM users WHERE organization_id IS NULL LOOP
    INSERT INTO organizations DEFAULT VALUES RETURNING id INTO organization_number;
    UPDATE users SET organization_id=organization_number WHERE id=account.id;
  END LOOP;
END $$;
UPDATE users SET username='user_' || replace(id::text,'-','') WHERE username IS NULL;
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (lower(username));
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique ON departments (organization_id,lower(name));
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (organization_id,lower(name));
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_name_unique ON projects (organization_id,lower(name));
COMMIT;
