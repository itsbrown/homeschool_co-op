-- Platform onboarding for additional schools.
-- Additive only. Apply before or with the deploy that selects these columns.
-- Existing rows stay on the unlimited internal plan (ASA families unchanged).

ALTER TABLE schools ADD COLUMN IF NOT EXISTS brand_color text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS platform_plan text NOT NULL DEFAULT 'internal';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS platform_subscription_status text NOT NULL DEFAULT 'active';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS platform_stripe_customer_id text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS platform_stripe_subscription_id text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS setup_completed_at timestamp;

ALTER TABLE school_applications ADD COLUMN IF NOT EXISTS school_id integer;
ALTER TABLE school_applications ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_schools_platform_plan ON schools (platform_plan);
CREATE INDEX IF NOT EXISTS idx_school_applications_school_id ON school_applications (school_id);
