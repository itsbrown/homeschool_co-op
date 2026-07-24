-- Grade Placement: auto-place session-paid students onto class rosters by grade
-- Additive only — safe for production shared DBs

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES sessions(id);

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS auto_place_by_grade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS placement_source TEXT;

CREATE INDEX IF NOT EXISTS idx_classes_session_id
  ON classes(session_id);

CREATE INDEX IF NOT EXISTS idx_classes_auto_place_by_grade
  ON classes(auto_place_by_grade)
  WHERE auto_place_by_grade = true;

CREATE INDEX IF NOT EXISTS idx_program_enrollments_placement_source
  ON program_enrollments(marketplace_class_id, placement_source)
  WHERE placement_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_program_enrollments_child_session_status
  ON program_enrollments(child_id, session_id, status)
  WHERE session_id IS NOT NULL;
