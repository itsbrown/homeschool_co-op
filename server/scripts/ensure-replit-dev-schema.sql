-- Run once on Replit/dev when school registration or admin tools fail with
-- missing column errors (session_mode_enabled, enabled_features, enrollment_version, etc.)
--
--   psql "$DATABASE_URL" -f server/scripts/ensure-replit-dev-schema.sql
--
-- Safe to re-run (idempotent).

-- Locations (parent registration Preferred Location dropdown)
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

-- Schools (required for POST /api/schools and getSchool)
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS enabled_features jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS session_mode_enabled boolean NOT NULL DEFAULT false;

-- Financial reports / collections
ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS comp_amount_cents integer NOT NULL DEFAULT 0;

-- F001 enrollment columns (no FK on session_id so this works even if sessions is empty)
ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS session_id integer;

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_version text NOT NULL DEFAULT 'v1';

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS day_type text;

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_half_day_price integer;

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_full_day_price integer;

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS family_plan_id integer;

-- Optional generated balance column (summary uses inline SQL if absent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'program_enrollments' AND column_name = 'effective_balance'
  ) THEN
    ALTER TABLE program_enrollments
      ADD COLUMN effective_balance integer
      GENERATED ALWAYS AS (
        GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0))
      ) STORED;
  END IF;
END $$;

-- Payment reminder logs (collection emails)
CREATE TABLE IF NOT EXISTS payment_reminder_logs (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id),
  scheduled_payment_id integer REFERENCES scheduled_payments(id),
  parent_email text NOT NULL,
  parent_name text,
  child_name text,
  class_name text,
  amount_cents integer,
  reminder_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  is_manual boolean NOT NULL DEFAULT false,
  sent_by integer REFERENCES users(id),
  error_message text,
  sent_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE payment_reminder_logs
  DROP CONSTRAINT IF EXISTS payment_reminder_logs_reminder_type_check;

ALTER TABLE payment_reminder_logs
  ADD CONSTRAINT payment_reminder_logs_reminder_type_check
  CHECK (reminder_type IN (
    '7_days_before', '3_days_before', '1_day_before', 'due_today',
    '1_day_overdue', '7_days_overdue', 'manual', 'summary'
  ));
