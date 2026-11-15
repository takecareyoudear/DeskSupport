BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE TABLE IF NOT EXISTS payables (
 id uuid PRIMARY KEY,organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name varchar(100) NOT NULL,amount numeric(11,2) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,
 frequency varchar(7) NOT NULL CHECK(frequency IN ('weekly','monthly','yearly')),
 first_due_date date NOT NULL,remarks varchar(2000) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payables_organization ON payables(organization_id);
ALTER TABLE payables ADD COLUMN IF NOT EXISTS due_month integer;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS due_day integer;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS due_weekday integer;
UPDATE payables SET due_weekday=EXTRACT(DOW FROM first_due_date) WHERE frequency='weekly' AND due_weekday IS NULL AND first_due_date IS NOT NULL;
UPDATE payables SET due_day=EXTRACT(DAY FROM first_due_date),due_month=CASE WHEN frequency='yearly' THEN EXTRACT(MONTH FROM first_due_date)::integer ELSE NULL END WHERE frequency IN ('monthly','yearly') AND due_day IS NULL AND first_due_date IS NOT NULL;
ALTER TABLE payables ALTER COLUMN first_due_date DROP NOT NULL;
COMMIT;
