BEGIN;
SELECT pg_advisory_xact_lock(746192038);
CREATE TABLE IF NOT EXISTS payables (
 id uuid PRIMARY KEY,organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name varchar(100) NOT NULL,amount numeric(11,2) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,
 frequency varchar(7) NOT NULL CHECK(frequency IN ('weekly','monthly','yearly')),
 first_due_date date NOT NULL,remarks varchar(2000) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payables_organization ON payables(organization_id);
COMMIT;
