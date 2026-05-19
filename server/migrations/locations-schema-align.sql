-- Align locations table with shared/schema.ts (safe to re-run)
-- Use when POST /api/locations fails with missing-column errors (SQLSTATE 42703).

CREATE TABLE IF NOT EXISTS locations (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id),
  name text NOT NULL,
  code text NOT NULL DEFAULT 'MAIN',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip_code text NOT NULL DEFAULT '',
  phone_number text,
  email text,
  manager_name text,
  capacity integer,
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE locations ADD COLUMN IF NOT EXISTS school_id integer REFERENCES schools(id);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT 'MAIN';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS zip_code text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS manager_name text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS capacity integer;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

UPDATE locations SET code = 'MAIN' WHERE code IS NULL OR code = '';
UPDATE locations SET address = '' WHERE address IS NULL;
UPDATE locations SET city = '' WHERE city IS NULL;
UPDATE locations SET state = '' WHERE state IS NULL;
UPDATE locations SET zip_code = '' WHERE zip_code IS NULL;
UPDATE locations SET is_active = true WHERE is_active IS NULL;
UPDATE locations SET timezone = 'America/New_York' WHERE timezone IS NULL OR timezone = '';
