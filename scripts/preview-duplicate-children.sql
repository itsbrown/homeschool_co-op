-- ============================================================================
-- Preview Duplicate Children (DRY RUN - FIXED)
-- ============================================================================
-- Purpose: Show what duplicates exist and what would be cleaned up
-- This script is READ-ONLY and makes NO changes to your database
-- ============================================================================

-- Show detailed breakdown of duplicates
WITH duplicate_groups AS (
  SELECT 
    parent_id,
    first_name,
    last_name,
    birthdate,
    COUNT(*) as duplicate_count
  FROM children
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id, first_name, last_name, birthdate
  HAVING COUNT(*) > 1
),
enrollment_counts AS (
  SELECT 
    child_id,
    SUM(enrollment_count) as total_enrollments
  FROM (
    SELECT child_id, COUNT(*) as enrollment_count FROM program_enrollments GROUP BY child_id
    UNION ALL
    SELECT child_id, COUNT(*) as enrollment_count FROM school_class_enrollments GROUP BY child_id
    UNION ALL
    SELECT child_id, COUNT(*) as enrollment_count FROM school_students GROUP BY child_id
  ) all_enrollments
  GROUP BY child_id
),
ranked_children AS (
  SELECT 
    c.id as child_id,
    c.parent_id,
    c.first_name,
    c.last_name,
    c.birthdate,
    c.school_id,
    COALESCE(ec.total_enrollments, 0) as enrollment_count,
    c.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY c.parent_id, c.first_name, c.last_name, c.birthdate 
      ORDER BY COALESCE(ec.total_enrollments, 0) DESC, c.id ASC
    ) as rank
  FROM children c
  INNER JOIN duplicate_groups dg 
    ON c.parent_id = dg.parent_id
    AND c.first_name = dg.first_name
    AND c.last_name = dg.last_name
    AND c.birthdate = dg.birthdate
  LEFT JOIN enrollment_counts ec ON ec.child_id = c.id
)
SELECT 
  parent_id,
  first_name || ' ' || last_name as child_name,
  birthdate,
  child_id,
  enrollment_count,
  school_id,
  created_at,
  CASE 
    WHEN rank = 1 THEN '✓ KEEP'
    ELSE '✗ DELETE'
  END as action
FROM ranked_children
ORDER BY parent_id, first_name, last_name, rank;

-- Summary count
SELECT 
  'SUMMARY' as report_type,
  COUNT(DISTINCT concat(parent_id, '-', first_name, '-', last_name, '-', birthdate::text)) as duplicate_groups,
  COUNT(*) as total_duplicate_children,
  SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) as records_to_keep,
  SUM(CASE WHEN rank > 1 THEN 1 ELSE 0 END) as records_to_delete
FROM (
  SELECT 
    c.id,
    c.parent_id,
    c.first_name,
    c.last_name,
    c.birthdate,
    ROW_NUMBER() OVER (
      PARTITION BY c.parent_id, c.first_name, c.last_name, c.birthdate 
      ORDER BY (
        SELECT COALESCE(SUM(enrollment_count), 0) 
        FROM (
          SELECT child_id, COUNT(*) as enrollment_count FROM program_enrollments WHERE child_id = c.id GROUP BY child_id
          UNION ALL
          SELECT child_id, COUNT(*) as enrollment_count FROM school_class_enrollments WHERE child_id = c.id GROUP BY child_id
          UNION ALL
          SELECT child_id, COUNT(*) as enrollment_count FROM school_students WHERE child_id = c.id GROUP BY child_id
        ) e
      ) DESC, c.id ASC
    ) as rank
  FROM children c
  WHERE parent_id IS NOT NULL
    AND EXISTS (
      SELECT 1 
      FROM children c2 
      WHERE c2.parent_id = c.parent_id 
        AND c2.first_name = c.first_name
        AND c2.last_name = c.last_name
        AND c2.birthdate = c.birthdate
        AND c2.id != c.id
    )
) duplicates;

-- If no results above, there are no duplicates!
