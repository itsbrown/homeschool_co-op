-- Migration: Fix Enrollment Currency Units (Dollars to Cents)
-- Description: Convert enrollment monetary fields from dollars to cents
-- Date: 2025-11-19
-- Status: PENDING - Review before executing

-- CRITICAL: This migration multiplies monetary values by 100 to convert from dollars to cents
-- All monetary values in the schema should be stored in CENTS per shared/schema.ts

-- Step 1: Create backup table
CREATE TABLE IF NOT EXISTS program_enrollments_backup_20251119 AS 
SELECT * FROM program_enrollments;

-- Step 2: Identify affected records (for logging)
-- These are records with values likely stored in dollars (< $100 = 10000 cents)
SELECT 
  COUNT(*) as affected_records,
  'Enrollments with monetary values < 10000 (likely in dollars)' as description
FROM program_enrollments
WHERE 
  status IN ('pending_payment', 'partially_paid', 'enrolled', 'cancelled', 'waitlist')
  AND (
    total_cost < 10000 
    OR remaining_balance < 10000 
    OR deposit_required < 10000 
    OR amount_paid < 10000
  );

-- Step 3: Display sample records before migration
SELECT 
  id,
  child_id,
  total_cost,
  remaining_balance,
  deposit_required,
  amount_paid,
  status,
  created_at
FROM program_enrollments
WHERE 
  (total_cost < 10000 OR remaining_balance < 10000 OR deposit_required < 10000 OR amount_paid < 10000)
  AND status IN ('pending_payment', 'partially_paid', 'enrolled')
ORDER BY id
LIMIT 10;

-- Step 4: Perform the migration
-- Convert dollar values to cents by multiplying by 100
UPDATE program_enrollments
SET 
  total_cost = CASE 
    WHEN total_cost IS NOT NULL AND total_cost > 0 AND total_cost < 10000 
    THEN total_cost * 100 
    ELSE total_cost 
  END,
  remaining_balance = CASE 
    WHEN remaining_balance IS NOT NULL AND remaining_balance > 0 AND remaining_balance < 10000 
    THEN remaining_balance * 100 
    ELSE remaining_balance 
  END,
  deposit_required = CASE 
    WHEN deposit_required IS NOT NULL AND deposit_required > 0 AND deposit_required < 10000 
    THEN deposit_required * 100 
    ELSE deposit_required 
  END,
  amount_paid = CASE 
    WHEN amount_paid IS NOT NULL AND amount_paid > 0 AND amount_paid < 10000 
    THEN amount_paid * 100 
    ELSE amount_paid 
  END
WHERE 
  status IN ('pending_payment', 'partially_paid', 'enrolled', 'cancelled', 'waitlist')
  AND (
    (total_cost IS NOT NULL AND total_cost > 0 AND total_cost < 10000)
    OR (remaining_balance IS NOT NULL AND remaining_balance > 0 AND remaining_balance < 10000)
    OR (deposit_required IS NOT NULL AND deposit_required > 0 AND deposit_required < 10000)
    OR (amount_paid IS NOT NULL AND amount_paid > 0 AND amount_paid < 10000)
  );

-- Step 5: Verify the migration
SELECT 
  COUNT(*) as migrated_records,
  'Records with values still < 10000 after migration (should be 0 or very few)' as description
FROM program_enrollments
WHERE 
  status IN ('pending_payment', 'partially_paid', 'enrolled', 'cancelled', 'waitlist')
  AND (
    (total_cost IS NOT NULL AND total_cost > 0 AND total_cost < 10000)
    OR (remaining_balance IS NOT NULL AND remaining_balance > 0 AND remaining_balance < 10000)
    OR (deposit_required IS NOT NULL AND deposit_required > 0 AND deposit_required < 10000)
    OR (amount_paid IS NOT NULL AND amount_paid > 0 AND amount_paid < 10000)
  );

-- Step 6: Display sample records after migration
SELECT 
  id,
  child_id,
  total_cost,
  remaining_balance,
  deposit_required,
  amount_paid,
  status,
  created_at
FROM program_enrollments
WHERE id IN (
  SELECT id FROM program_enrollments
  ORDER BY id
  LIMIT 10
);

-- ROLLBACK INSTRUCTIONS:
-- If the migration fails or produces incorrect results, restore from backup:
-- DROP TABLE program_enrollments;
-- CREATE TABLE program_enrollments AS SELECT * FROM program_enrollments_backup_20251119;
-- Then verify: SELECT COUNT(*) FROM program_enrollments;
