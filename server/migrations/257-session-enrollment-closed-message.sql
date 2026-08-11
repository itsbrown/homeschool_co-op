-- Optional parent-facing message when a session has enrollment_open = false.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS enrollment_closed_message TEXT;

COMMENT ON COLUMN sessions.enrollment_closed_message IS
  'Shown to parents when this session is not open for self-enrollment (case-by-case / contact us).';
