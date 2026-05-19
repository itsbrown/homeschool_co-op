-- Backfill children.school_id from their parent's users.school_id when missing.
-- Safe to run multiple times (only updates rows where child.school_id IS NULL).
UPDATE children c
SET
  school_id = u.school_id,
  updated_at = NOW()
FROM users u
WHERE c.parent_id = u.id
  AND c.school_id IS NULL
  AND u.school_id IS NOT NULL;
