-- F001 Phase 1: Schema foundation (manual apply if drizzle-kit push is unavailable)
-- Prefer: npm run db:push (with DATABASE_URL set)

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS session_mode_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS family_payment_plans (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id),
  parent_id integer NOT NULL REFERENCES users(id),
  total_amount_cents integer NOT NULL,
  total_paid_cents integer NOT NULL DEFAULT 0,
  remaining_balance_cents integer NOT NULL,
  payment_frequency text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  locked_at timestamp,
  locked_by text,
  stripe_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS session_id integer REFERENCES sessions(id),
  ADD COLUMN IF NOT EXISTS enrollment_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS day_type text,
  ADD COLUMN IF NOT EXISTS enrolled_half_day_price integer,
  ADD COLUMN IF NOT EXISTS enrolled_full_day_price integer,
  ADD COLUMN IF NOT EXISTS family_plan_id integer REFERENCES family_payment_plans(id);

CREATE TABLE IF NOT EXISTS enrollment_price_history (
  id serial PRIMARY KEY,
  enrollment_id integer NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  previous_day_type text,
  new_day_type text,
  previous_price_cents integer NOT NULL,
  new_price_cents integer NOT NULL,
  difference_cents integer NOT NULL,
  prorated_days integer,
  total_days_in_session integer,
  effective_date date NOT NULL,
  changed_by integer NOT NULL REFERENCES users(id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);
