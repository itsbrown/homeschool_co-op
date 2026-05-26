-- repair-comp-amount-cents.sql
-- One-time data repair for production rows where comp_percentage > 0 but
-- comp_amount_cents = 0 (i.e. the comp write path updated workflow fields but
-- did not persist the cent amount).
--
-- DO NOT run this automatically. Review diagnostic output first, confirm the
-- rows make sense, then run the UPDATE in a transaction with ROLLBACK available.
--
-- Deploy after the server-side fix (resolveEnrollmentEffectiveBalance) is live
-- so that any newly comped rows are written correctly going forward.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Diagnostic — find all broken comp rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    id,
    child_name,
    class_name,
    total_cost,
    total_paid,
    comp_percentage,
    comp_amount_cents,
    remaining_balance,
    effective_balance,
    GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0)) AS computed_owed,
    GREATEST(0, total_cost - total_paid)                                  AS should_be_comp
FROM program_enrollments
WHERE comp_percentage > 0
  AND GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0)) > 0
ORDER BY id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Repair — set comp_amount_cents for fully-comped (100%) rows where
--         the field was never written (comp_amount_cents = 0).
--
-- Scope is intentionally narrow: only rows with comp_percentage >= 100
-- AND comp_amount_cents = 0 AND total_cost > total_paid.
-- Partial-comp rows (comp_percentage < 100) require per-enrollment review.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE program_enrollments
SET
    comp_amount_cents = GREATEST(0, total_cost - total_paid),
    remaining_balance = 0,
    payment_status    = 'completed'
WHERE
    comp_percentage  >= 100
    AND comp_amount_cents = 0
    AND total_cost    > total_paid;

-- Review the rows that will be affected before committing:
--   SELECT id, child_name, comp_percentage, comp_amount_cents, remaining_balance
--   FROM program_enrollments
--   WHERE comp_percentage >= 100 AND comp_amount_cents = 0 AND total_cost > total_paid;
--
-- If the output looks correct, run COMMIT. Otherwise ROLLBACK.

-- COMMIT;
-- ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3 (optional): Force refresh of the generated effective_balance column.
-- On PostgreSQL the generated column recomputes automatically on UPDATE, so
-- the UPDATE above is sufficient. If for any reason the column is stale, a
-- no-op touch will trigger a recompute:
--
--   UPDATE program_enrollments
--   SET comp_amount_cents = comp_amount_cents
--   WHERE comp_percentage >= 100 AND comp_amount_cents > 0;
-- ─────────────────────────────────────────────────────────────────────────────
