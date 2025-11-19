-- Rollback Migration: Restore Enrollment Currency Units
-- Description: Restore program_enrollments from backup if migration failed
-- Date: 2025-11-19
-- Use this ONLY if the migration produced incorrect results

-- Step 1: Verify backup exists
SELECT 
  COUNT(*) as backup_record_count,
  'program_enrollments_backup_20251119' as backup_table
FROM program_enrollments_backup_20251119;

-- Step 2: Compare record counts
SELECT 
  (SELECT COUNT(*) FROM program_enrollments) as current_count,
  (SELECT COUNT(*) FROM program_enrollments_backup_20251119) as backup_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM program_enrollments) = (SELECT COUNT(*) FROM program_enrollments_backup_20251119)
    THEN 'COUNTS MATCH - Safe to rollback'
    ELSE 'WARNING: Counts differ - Review before rollback'
  END as status;

-- Step 3: Restore from backup
-- WARNING: This will delete all current data and restore from backup
BEGIN;

-- Drop current table
DROP TABLE IF EXISTS program_enrollments;

-- Restore from backup
CREATE TABLE program_enrollments AS 
SELECT * FROM program_enrollments_backup_20251119;

-- Verify restoration
SELECT COUNT(*) as restored_records FROM program_enrollments;

-- If everything looks correct, commit the transaction
-- COMMIT;

-- If something is wrong, rollback the transaction
-- ROLLBACK;

-- Step 4: Clean up backup table (only after verifying restoration)
-- DROP TABLE IF EXISTS program_enrollments_backup_20251119;
