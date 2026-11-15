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
-- Preserve existing records while introducing the corrected type/category model.
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS asset_type varchar(12);
UPDATE asset_categories c SET asset_type=CASE WHEN nature='virtual' THEN 'virtual' ELSE COALESCE((SELECT t.movement FROM assets a JOIN asset_types t ON t.id=a.type_id WHERE a.category_id=c.id ORDER BY a.id LIMIT 1),'movable') END WHERE asset_type IS NULL;
ALTER TABLE asset_categories ALTER COLUMN asset_type SET NOT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_type varchar(12);
UPDATE assets a SET asset_type=CASE WHEN c.nature='virtual' THEN 'virtual' ELSE t.movement END
FROM asset_categories c,asset_types t WHERE a.category_id=c.id AND a.type_id=t.id AND a.asset_type IS NULL;
ALTER TABLE assets ALTER COLUMN asset_type SET NOT NULL;
ALTER TABLE assets ALTER COLUMN type_id DROP NOT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS renewal_frequency varchar(7);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS renewal_month integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS renewal_day integer;
UPDATE assets SET renewal_frequency='yearly',renewal_month=EXTRACT(MONTH FROM renewal_date),renewal_day=EXTRACT(DAY FROM renewal_date) WHERE renewal_frequency IS NULL AND renewal_date IS NOT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS insurance_renewal_frequency varchar(7);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS insurance_renewal_month integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS insurance_renewal_day integer;
UPDATE assets SET insurance_renewal_frequency='yearly',insurance_renewal_month=EXTRACT(MONTH FROM insurance_renewal_date),insurance_renewal_day=EXTRACT(DAY FROM insurance_renewal_date) WHERE insurance_renewal_frequency IS NULL AND insurance_renewal_date IS NOT NULL;
COMMIT;
