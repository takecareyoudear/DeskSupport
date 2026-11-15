BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE TABLE IF NOT EXISTS menu_roles (
 id uuid PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name varchar(100) NOT NULL CHECK(length(trim(name))>0),
 menus text[] NOT NULL DEFAULT '{}', UNIQUE(organization_id,id),
 CHECK(menus <@ ARRAY['tickets','create','inbox','knowledge','activity','team','reports','assets.register','assets.categories','payble','settings.master','company']::text[])
);
CREATE UNIQUE INDEX IF NOT EXISTS menu_roles_name ON menu_roles(organization_id,lower(name));
-- Migrate existing users once; future users start with no menu role unless assigned.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='menu_role_id') THEN
  ALTER TABLE users ADD COLUMN menu_role_id uuid;
  INSERT INTO menu_roles(id,organization_id,name,menus)
   SELECT md5('standard-menu-role-'||organization_id::text)::uuid,organization_id,'Standard User',
    ARRAY['tickets','create','inbox','knowledge','activity','team','reports','assets.register','assets.categories','payble','settings.master','company']::text[]
   FROM users WHERE role='member' GROUP BY organization_id;
  UPDATE users SET menu_role_id=md5('standard-menu-role-'||organization_id::text)::uuid WHERE role='member';
  ALTER TABLE users ADD CONSTRAINT users_menu_role_fk FOREIGN KEY(organization_id,menu_role_id) REFERENCES menu_roles(organization_id,id) ON DELETE RESTRICT;
 END IF;
END $$;
COMMIT;
