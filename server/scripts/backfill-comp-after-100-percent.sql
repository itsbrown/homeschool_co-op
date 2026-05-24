-- Backfill a 100% comp when the admin comp succeeded (status enrolled) but comp_amount_cents
-- was not persisted (pre-schema fix). Preview first, then run the UPDATE.

-- Preview
SELECT id, child_name, class_name, status, payment_status,
       total_cost, total_paid, comp_amount_cents, comp_percentage, remaining_balance, effective_balance
FROM program_enrollments
WHERE parent_email ILIKE '%kuhnsqueen@gmail.com%'
  AND status = 'enrolled'
  AND COALESCE(comp_amount_cents, 0) = 0
  AND total_cost > 0;

-- Example: Amelia / Brighton (adjust id if preview shows a different row)
-- UPDATE program_enrollments
-- SET
--   comp_percentage = 100,
--   comp_amount_cents = total_cost,
--   remaining_balance = 0,
--   payment_status = 'completed',
--   comp_reason = COALESCE(comp_reason, '100% comp applied by administrator (backfill)'),
--   comp_at = COALESCE(comp_at, NOW())
-- WHERE id = <enrollment_id_from_preview>;
