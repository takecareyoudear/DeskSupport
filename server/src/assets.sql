BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE TABLE IF NOT EXISTS asset_types (
 id uuid PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id),
 name varchar(100) NOT NULL, movement varchar(12) NOT NULL CHECK(movement IN ('movable','immovable')),
 UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_types_name ON asset_types(organization_id,lower(name));
CREATE TABLE IF NOT EXISTS asset_categories (
 id uuid PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id),
 name varchar(100) NOT NULL, nature varchar(10) NOT NULL CHECK(nature IN ('physical','virtual')),
 classification varchar(20) NOT NULL CHECK(classification IN ('hardware','computer','laptop','land','building','vehicle','software','subscription','other')),
 UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_categories_name ON asset_categories(organization_id,lower(name));
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id),
 name varchar(100) NOT NULL, type_id uuid NOT NULL, category_id uuid NOT NULL,
 start_date date, end_date date, renewal_date date,
 insurer varchar(100) NOT NULL DEFAULT '', policy_number varchar(100) NOT NULL DEFAULT '',
 insurance_start_date date, insurance_end_date date, insurance_renewal_date date,
 notes varchar(2000) NOT NULL DEFAULT '',
 FOREIGN KEY(organization_id,type_id) REFERENCES asset_types(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,category_id) REFERENCES asset_categories(organization_id,id) ON DELETE RESTRICT,
 CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date),
 CHECK(insurance_end_date IS NULL OR insurance_start_date IS NULL OR insurance_end_date>=insurance_start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS assets_name ON assets(organization_id,lower(name));
COMMIT;
