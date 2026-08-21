-- Family calendar: school-scoped events, campus targeting, parent ICS feed token.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id),
  ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE events
  ALTER COLUMN is_all_day SET DEFAULT false;

UPDATE events SET is_all_day = false WHERE is_all_day IS NULL;

DO $$
BEGIN
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
  ALTER TABLE events ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN ('class', 'meeting', 'workshop', 'camp', 'holiday', 'deadline', 'special', 'other'));
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_school_dates
  ON events (school_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_events_school_location
  ON events (school_id, location_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS calendar_feed_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_calendar_feed_token_uidx
  ON users (calendar_feed_token)
  WHERE calendar_feed_token IS NOT NULL;
