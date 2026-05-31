-- Location activation threshold (wishlist until N students with saved PM)
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS patterns)

ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_threshold integer;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_status text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS notice_started_at timestamp;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS charge_scheduled_at timestamp;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS activated_at timestamp;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_deadline timestamp;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_notice_hours integer NOT NULL DEFAULT 72;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location_id integer REFERENCES locations(id);

ALTER TABLE program_enrollments ADD COLUMN IF NOT EXISTS location_id integer REFERENCES locations(id);

-- Legacy rows: no threshold, treat as already active
UPDATE locations
SET activation_status = 'activated'
WHERE activation_threshold IS NULL
  AND (activation_status IS NULL OR activation_status = '');

ALTER TABLE program_enrollments
  DROP CONSTRAINT IF EXISTS program_enrollments_status_check;

ALTER TABLE program_enrollments
  ADD CONSTRAINT program_enrollments_status_check
  CHECK (status IN (
    'pending_payment',
    'pending_admin_approval',
    'enrolled',
    'waitlist',
    'location_wishlist',
    'cancelled',
    'completed',
    'withdrawn',
    'failed'
  ));
