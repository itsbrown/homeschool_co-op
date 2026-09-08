-- Math level on student profile (Dimensions Math placement / grade-equivalent label).
-- Additive only. Never db:push on shared/prod DBs.

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS current_math_level TEXT;

-- Assessment type used for math-level history (mirrors Lexile Reading Level).
INSERT INTO assessment_types (
  school_id, name, description, category, score_format, is_active, sort_order, created_at, updated_at
)
SELECT
  s.id,
  'Math Level',
  'Tracks student math placement level (e.g. Dimensions Math 3A)',
  'math',
  'level',
  true,
  110,
  NOW(),
  NOW()
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM assessment_types at2
  WHERE at2.school_id = s.id AND at2.name = 'Math Level'
);
