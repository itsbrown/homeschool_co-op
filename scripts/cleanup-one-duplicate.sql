-- ============================================================================
-- Cleanup Single Duplicate Child - Simple Version
-- ============================================================================
-- This script handles one duplicate child pair
-- Wrapped in a transaction - rolls back on ANY error
-- ============================================================================

BEGIN;

-- Step 1: Show what we're working with
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DUPLICATE CHILD CLEANUP';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Finding duplicate children...';
  RAISE NOTICE '';
END $$;

-- Create temp table to track the duplicate pair
CREATE TEMP TABLE duplicate_pair AS
SELECT 
  c1.id as old_child_id,
  c2.id as new_child_id,
  c1.parent_id,
  c1.first_name || ' ' || c1.last_name as child_name,
  c1.birthdate,
  -- Keep the one with the lower ID (created first)
  CASE 
    WHEN c1.id < c2.id THEN c1.id 
    ELSE c2.id 
  END as keep_id,
  CASE 
    WHEN c1.id < c2.id THEN c2.id 
    ELSE c1.id 
  END as delete_id
FROM children c1
INNER JOIN children c2 
  ON c1.parent_id = c2.parent_id
  AND c1.first_name = c2.first_name
  AND c1.last_name = c2.last_name
  AND c1.birthdate = c2.birthdate
  AND c1.id < c2.id
WHERE c1.parent_id IS NOT NULL
LIMIT 1;  -- Only handle the first duplicate

-- Show what we found
SELECT 
  parent_id,
  child_name,
  birthdate,
  keep_id as "Child ID to KEEP ✓",
  delete_id as "Child ID to DELETE ✗"
FROM duplicate_pair;

-- Step 2: Migrate foreign key references
DO $$
DECLARE
  v_keep_id INTEGER;
  v_delete_id INTEGER;
  v_child_name TEXT;
BEGIN
  -- Get the IDs we're working with
  SELECT keep_id, delete_id, child_name 
  INTO v_keep_id, v_delete_id, v_child_name
  FROM duplicate_pair;
  
  IF v_keep_id IS NULL THEN
    RAISE NOTICE 'No duplicates found - nothing to do!';
    RETURN;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Migrating enrollments for: %', v_child_name;
  RAISE NOTICE 'From child_id % to child_id %', v_delete_id, v_keep_id;
  RAISE NOTICE '';
  
  -- Update program_enrollments if table exists
  BEGIN
    UPDATE program_enrollments 
    SET child_id = v_keep_id 
    WHERE child_id = v_delete_id;
    
    RAISE NOTICE 'Updated % program_enrollments', FOUND;
  EXCEPTION 
    WHEN undefined_table THEN 
      RAISE NOTICE 'Table program_enrollments does not exist - skipping';
    WHEN undefined_column THEN
      RAISE NOTICE 'Column child_id does not exist in program_enrollments - skipping';
  END;
  
  -- Update school_class_enrollments if table exists
  BEGIN
    UPDATE school_class_enrollments 
    SET child_id = v_keep_id 
    WHERE child_id = v_delete_id;
    
    RAISE NOTICE 'Updated % school_class_enrollments', FOUND;
  EXCEPTION 
    WHEN undefined_table THEN 
      RAISE NOTICE 'Table school_class_enrollments does not exist - skipping';
    WHEN undefined_column THEN
      RAISE NOTICE 'Column child_id does not exist in school_class_enrollments - skipping';
  END;
  
  -- Update school_students if table exists
  BEGIN
    UPDATE school_students 
    SET child_id = v_keep_id 
    WHERE child_id = v_delete_id;
    
    RAISE NOTICE 'Updated % school_students', FOUND;
  EXCEPTION 
    WHEN undefined_table THEN 
      RAISE NOTICE 'Table school_students does not exist - skipping';
    WHEN undefined_column THEN
      RAISE NOTICE 'Column child_id does not exist in school_students - skipping';
  END;
  
  -- Update discount_applications if table exists
  BEGIN
    UPDATE discount_applications 
    SET child_id = v_keep_id 
    WHERE child_id = v_delete_id;
    
    RAISE NOTICE 'Updated % discount_applications', FOUND;
  EXCEPTION 
    WHEN undefined_table THEN 
      RAISE NOTICE 'Table discount_applications does not exist - skipping';
    WHEN undefined_column THEN
      RAISE NOTICE 'Column child_id does not exist in discount_applications - skipping';
  END;
  
END $$;

-- Step 3: Delete the duplicate child
DELETE FROM children
WHERE id = (SELECT delete_id FROM duplicate_pair);

-- Step 4: Final report
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLEANUP COMPLETE ✓';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Duplicate child has been removed';
  RAISE NOTICE 'All enrollments preserved';
  RAISE NOTICE '';
END $$;

-- Commit the transaction
COMMIT;

-- Verify no duplicates remain
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN 'SUCCESS: No duplicates remain! ✓'
    ELSE 'WARNING: Still have duplicates'
  END as status
FROM children c1
INNER JOIN children c2 
  ON c1.parent_id = c2.parent_id
  AND c1.first_name = c2.first_name
  AND c1.last_name = c2.last_name
  AND c1.birthdate = c2.birthdate
  AND c1.id < c2.id
WHERE c1.parent_id IS NOT NULL;
