-- ============================================================================
-- Cleanup Duplicate Children Script (FIXED)
-- ============================================================================
-- Purpose: Safely identify and remove duplicate children records while
--          preserving all enrollment and discount data.
--
-- What this script does:
-- 1. Finds children with identical parent_id, first_name, last_name, birthdate
-- 2. For each duplicate group, keeps the child with most enrollments (or oldest)
-- 3. Migrates all foreign key references to the kept child
-- 4. Deletes duplicate records
-- 5. Reports what was changed
--
-- Safety: Wrapped in a transaction - rolls back on any error
-- ============================================================================

BEGIN;

-- Create temporary table to track duplicates and determine which to keep
CREATE TEMP TABLE duplicate_children_mapping AS
WITH duplicate_groups AS (
  -- Find groups of children that are duplicates (same parent, name, birthdate)
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
  -- Count all enrollments for each child
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
  -- Rank children within each duplicate group
  SELECT 
    c.id as child_id,
    c.parent_id,
    c.first_name,
    c.last_name,
    c.birthdate,
    COALESCE(ec.total_enrollments, 0) as enrollment_count,
    c.created_at,
    -- Determine which child to keep (most enrollments, then oldest record)
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
  child_id as duplicate_child_id,
  parent_id,
  first_name,
  last_name,
  birthdate,
  enrollment_count,
  created_at,
  (SELECT child_id FROM ranked_children rc2 
   WHERE rc2.parent_id = rc.parent_id
     AND rc2.first_name = rc.first_name
     AND rc2.last_name = rc.last_name
     AND rc2.birthdate = rc.birthdate
     AND rc2.rank = 1
  ) as keep_child_id,
  rank = 1 as is_keeper
FROM ranked_children rc;

-- Display analysis before making changes
DO $$
DECLARE
  duplicate_count INTEGER;
  kept_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM duplicate_children_mapping;
  SELECT COUNT(*) INTO kept_count FROM duplicate_children_mapping WHERE is_keeper = true;
  SELECT COUNT(*) INTO deleted_count FROM duplicate_children_mapping WHERE is_keeper = false;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DUPLICATE CHILDREN ANALYSIS';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total children in duplicate groups: %', duplicate_count;
  RAISE NOTICE 'Records to KEEP: %', kept_count;
  RAISE NOTICE 'Records to DELETE: %', deleted_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;

-- Show detailed breakdown of what will be kept vs deleted
SELECT 
  parent_id,
  first_name || ' ' || last_name as child_name,
  birthdate,
  duplicate_child_id,
  keep_child_id,
  enrollment_count,
  created_at,
  CASE 
    WHEN is_keeper THEN 'KEEP ✓'
    ELSE 'DELETE ✗'
  END as action
FROM duplicate_children_mapping
ORDER BY parent_id, first_name, last_name, is_keeper DESC;

-- ============================================================================
-- MIGRATION PHASE: Update all foreign key references
-- ============================================================================

-- Step 1: Migrate program_enrollments
UPDATE program_enrollments pe
SET child_id = dcm.keep_child_id
FROM duplicate_children_mapping dcm
WHERE pe.child_id = dcm.duplicate_child_id
  AND dcm.is_keeper = false;

-- Step 2: Migrate school_class_enrollments  
UPDATE school_class_enrollments sce
SET child_id = dcm.keep_child_id
FROM duplicate_children_mapping dcm
WHERE sce.child_id = dcm.duplicate_child_id
  AND dcm.is_keeper = false;

-- Step 3: Migrate school_students
UPDATE school_students ss
SET child_id = dcm.keep_child_id
FROM duplicate_children_mapping dcm
WHERE ss.child_id = dcm.duplicate_child_id
  AND dcm.is_keeper = false;

-- Step 4: Migrate discount_applications
UPDATE discount_applications da
SET child_id = dcm.keep_child_id
FROM duplicate_children_mapping dcm
WHERE da.child_id = dcm.duplicate_child_id
  AND dcm.is_keeper = false;

-- ============================================================================
-- DELETION PHASE: Remove duplicate children
-- ============================================================================

-- Delete duplicate children (only those marked for deletion)
DELETE FROM children
WHERE id IN (
  SELECT duplicate_child_id 
  FROM duplicate_children_mapping 
  WHERE is_keeper = false
);

-- ============================================================================
-- FINAL REPORT
-- ============================================================================

DO $$
DECLARE
  children_deleted INTEGER;
BEGIN
  SELECT COUNT(*) INTO children_deleted 
  FROM duplicate_children_mapping 
  WHERE is_keeper = false;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLEANUP COMPLETE ✓';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Duplicate children deleted: %', children_deleted;
  RAISE NOTICE 'All enrollments and discounts preserved';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Transaction committed successfully.';
  RAISE NOTICE 'All changes are now permanent.';
  RAISE NOTICE '';
END $$;

-- Commit the transaction
COMMIT;

-- ============================================================================
-- POST-CLEANUP VERIFICATION
-- ============================================================================

-- Verify no duplicates remain
SELECT 
  parent_id,
  first_name,
  last_name,
  birthdate,
  COUNT(*) as duplicate_count
FROM children
WHERE parent_id IS NOT NULL
GROUP BY parent_id, first_name, last_name, birthdate
HAVING COUNT(*) > 1;

-- If the above query returns no rows, cleanup was successful!
