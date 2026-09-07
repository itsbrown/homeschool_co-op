-- Family door codes: per-household keypad lookup (additive)

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS door_codes_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS family_access_codes (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  parent_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  assigned_by integer REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS family_access_codes_active_parent_location
  ON family_access_codes (location_id, parent_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS family_access_codes_active_code_location
  ON family_access_codes (location_id, code)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS family_access_codes_school_location
  ON family_access_codes (school_id, location_id, status);

CREATE INDEX IF NOT EXISTS family_access_codes_parent
  ON family_access_codes (parent_id, status);
