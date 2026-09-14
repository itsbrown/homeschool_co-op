-- Grade Placement: optional half/full day filter on auto-place classes
-- Additive only — safe for production shared DBs
-- NULL = current behavior (place both day types)

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS auto_place_day_type TEXT;

ALTER TABLE classes
  DROP CONSTRAINT IF EXISTS classes_auto_place_day_type_check;

ALTER TABLE classes
  ADD CONSTRAINT classes_auto_place_day_type_check
  CHECK (
    auto_place_day_type IS NULL
    OR auto_place_day_type IN ('full_day', 'half_day')
  );
