-- SQL Fix Query: Recalculate Bi-weekly Payment Dates with Proper 14-Day Spacing
-- 
-- INSTRUCTIONS:
-- 1. First run sql-diagnose-duplicate-payments.sql to see affected enrollments
-- 2. Review the output below in DRY RUN mode (SELECT statements only)
-- 3. When ready to apply, uncomment the UPDATE statements at the bottom
--
-- This script recalculates dates starting from the earliest pending payment date
-- and spaces subsequent payments at 14-day intervals

-- Step 1: DRY RUN - Preview what changes would be made
WITH affected_enrollments AS (
  SELECT DISTINCT sp.enrollment_id
  FROM scheduled_payments sp
  WHERE sp.status IN ('pending', 'processing')
  GROUP BY sp.enrollment_id, DATE(sp.scheduled_date)
  HAVING COUNT(*) > 1
),
pending_payments AS (
  SELECT 
    sp.id as payment_id,
    sp.enrollment_id,
    sp.scheduled_date as current_date,
    sp.amount,
    sp.installment_number,
    ROW_NUMBER() OVER (PARTITION BY sp.enrollment_id ORDER BY sp.scheduled_date, sp.id) as new_order
  FROM scheduled_payments sp
  WHERE sp.enrollment_id IN (SELECT enrollment_id FROM affected_enrollments)
    AND sp.status IN ('pending', 'processing')
),
first_dates AS (
  SELECT 
    enrollment_id,
    MIN(scheduled_date) as first_payment_date
  FROM scheduled_payments
  WHERE enrollment_id IN (SELECT enrollment_id FROM affected_enrollments)
    AND status IN ('pending', 'processing')
  GROUP BY enrollment_id
),
new_dates AS (
  SELECT 
    pp.payment_id,
    pp.enrollment_id,
    pp.current_date as old_date,
    pp.new_order,
    fd.first_payment_date + INTERVAL '14 days' * (pp.new_order - 1) as new_date,
    pe.program_end_date
  FROM pending_payments pp
  JOIN first_dates fd ON pp.enrollment_id = fd.enrollment_id
  JOIN program_enrollments pe ON pp.enrollment_id = pe.id
)
SELECT 
  nd.payment_id,
  nd.enrollment_id,
  pe.child_name,
  pe.class_name,
  u.email as parent_email,
  nd.old_date,
  nd.new_date,
  nd.new_date::date - nd.old_date::date as days_difference,
  CASE 
    WHEN nd.new_date > nd.program_end_date THEN 'WARNING: Exceeds program end date'
    ELSE 'OK'
  END as validation_status
FROM new_dates nd
JOIN program_enrollments pe ON nd.enrollment_id = pe.id
JOIN users u ON pe.parent_id = u.id
ORDER BY nd.enrollment_id, nd.new_order;

-- Summary of changes
SELECT 
  'PREVIEW SUMMARY' as report_type,
  COUNT(DISTINCT enrollment_id) as enrollments_to_update,
  COUNT(*) as payments_to_update,
  SUM(CASE WHEN new_date > program_end_date THEN 1 ELSE 0 END) as payments_exceeding_end_date
FROM (
  SELECT 
    pp.payment_id,
    pp.enrollment_id,
    fd.first_payment_date + INTERVAL '14 days' * (ROW_NUMBER() OVER (PARTITION BY pp.enrollment_id ORDER BY pp.current_date, pp.payment_id) - 1) as new_date,
    pe.program_end_date
  FROM (
    SELECT 
      sp.id as payment_id,
      sp.enrollment_id,
      sp.scheduled_date as current_date
    FROM scheduled_payments sp
    WHERE sp.enrollment_id IN (
      SELECT DISTINCT enrollment_id
      FROM scheduled_payments
      WHERE status IN ('pending', 'processing')
      GROUP BY enrollment_id, DATE(scheduled_date)
      HAVING COUNT(*) > 1
    )
    AND sp.status IN ('pending', 'processing')
  ) pp
  JOIN (
    SELECT enrollment_id, MIN(scheduled_date) as first_payment_date
    FROM scheduled_payments
    WHERE status IN ('pending', 'processing')
    GROUP BY enrollment_id
  ) fd ON pp.enrollment_id = fd.enrollment_id
  JOIN program_enrollments pe ON pp.enrollment_id = pe.id
) calculated;

-- ============================================================================
-- STEP 2: APPLY CHANGES (UNCOMMENT BELOW TO EXECUTE)
-- ============================================================================
-- WARNING: Review the preview above before uncommenting and running!
-- 
-- UPDATE scheduled_payments sp
-- SET 
--   scheduled_date = calculated.new_date,
--   updated_at = NOW()
-- FROM (
--   WITH pending_payments AS (
--     SELECT 
--       sp.id as payment_id,
--       sp.enrollment_id,
--       sp.scheduled_date as current_date,
--       ROW_NUMBER() OVER (PARTITION BY sp.enrollment_id ORDER BY sp.scheduled_date, sp.id) as new_order
--     FROM scheduled_payments sp
--     WHERE sp.enrollment_id IN (
--       SELECT DISTINCT enrollment_id
--       FROM scheduled_payments
--       WHERE status IN ('pending', 'processing')
--       GROUP BY enrollment_id, DATE(scheduled_date)
--       HAVING COUNT(*) > 1
--     )
--     AND sp.status IN ('pending', 'processing')
--   ),
--   first_dates AS (
--     SELECT enrollment_id, MIN(scheduled_date) as first_payment_date
--     FROM scheduled_payments
--     WHERE status IN ('pending', 'processing')
--     GROUP BY enrollment_id
--   )
--   SELECT 
--     pp.payment_id,
--     fd.first_payment_date + INTERVAL '14 days' * (pp.new_order - 1) as new_date
--   FROM pending_payments pp
--   JOIN first_dates fd ON pp.enrollment_id = fd.enrollment_id
-- ) calculated
-- WHERE sp.id = calculated.payment_id;
--
-- After running, verify with:
-- SELECT 'UPDATE COMPLETE' as status, COUNT(*) as rows_updated 
-- FROM scheduled_payments WHERE updated_at > NOW() - INTERVAL '1 minute';
