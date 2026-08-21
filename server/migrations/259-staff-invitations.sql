-- Staff invitations: pending mentor/staff accept-invite tokens.
-- Additive only. Do not db:push on production.

CREATE TABLE IF NOT EXISTS staff_invitations (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL,
  position text,
  invited_by integer REFERENCES users(id),
  school_id integer NOT NULL REFERENCES schools(id),
  location_id integer REFERENCES locations(id),
  class_id integer,
  message text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_email
  ON staff_invitations (lower(email));

CREATE INDEX IF NOT EXISTS idx_staff_invitations_school_status
  ON staff_invitations (school_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_token
  ON staff_invitations (token);

ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS invited_by integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_invitations_invited_by_fkey'
  ) THEN
    ALTER TABLE staff_invitations
      ADD CONSTRAINT staff_invitations_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES users(id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
