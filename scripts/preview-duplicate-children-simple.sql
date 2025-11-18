-- ============================================================================
-- Simple Preview - Find Duplicate Children
-- ============================================================================
-- This simplified version helps identify which tables exist and find duplicates
-- ============================================================================

-- First, let's see what duplicate children exist (without checking enrollments)
SELECT 
  c1.parent_id,
  c1.first_name || ' ' || c1.last_name as child_name,
  c1.birthdate,
  c1.id as child_id_1,
  c2.id as child_id_2,
  c1.created_at as created_1,
  c2.created_at as created_2,
  c1.school_id as school_1,
  c2.school_id as school_2
FROM children c1
INNER JOIN children c2 
  ON c1.parent_id = c2.parent_id
  AND c1.first_name = c2.first_name
  AND c1.last_name = c2.last_name
  AND c1.birthdate = c2.birthdate
  AND c1.id < c2.id  -- Only show each pair once
WHERE c1.parent_id IS NOT NULL
ORDER BY c1.parent_id, c1.first_name, c1.last_name;

-- Summary
SELECT 
  COUNT(*) as duplicate_pairs,
  COUNT(*) * 2 as total_duplicate_children
FROM children c1
INNER JOIN children c2 
  ON c1.parent_id = c2.parent_id
  AND c1.first_name = c2.first_name
  AND c1.last_name = c2.last_name
  AND c1.birthdate = c2.birthdate
  AND c1.id < c2.id
WHERE c1.parent_id IS NOT NULL;
