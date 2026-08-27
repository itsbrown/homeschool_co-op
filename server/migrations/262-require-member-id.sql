-- Opt-in members-first enrollment: parents without users.member_id cannot
-- self-enroll while require_member_id is true. Default false — no behavior
-- change until an admin flips the toggle.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS require_member_id BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS require_member_id BOOLEAN NOT NULL DEFAULT false;
