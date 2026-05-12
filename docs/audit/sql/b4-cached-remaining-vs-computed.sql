-- B4 — Cached remaining_balance vs computed (total_cost - total_paid)
-- All amounts in CENTS per schema (shared/schema.ts program_enrollments).

-- 4a) Drift: stored remaining does not match computed (ignores effectiveBalance — that is app-layer)
SELECT id,
       school_id,
       parent_email,
       child_name,
       class_name,
       status,
       total_cost,
       total_paid,
       remaining_balance,
       (COALESCE(total_cost, 0) - COALESCE(total_paid, 0)) AS computed_remaining_cents,
       (remaining_balance - (COALESCE(total_cost, 0) - COALESCE(total_paid, 0))) AS drift_cents
FROM program_enrollments
WHERE status NOT IN ('cancelled', 'withdrawn', 'failed')
  AND remaining_balance IS DISTINCT FROM (COALESCE(total_cost, 0) - COALESCE(total_paid, 0))
ORDER BY ABS(remaining_balance - (COALESCE(total_cost, 0) - COALESCE(total_paid, 0))) DESC
LIMIT 200;

-- 4b) Single enrollment deep-dive (replace :id)
-- SELECT * FROM program_enrollments WHERE id = :id;
-- SELECT id, amount, status, scheduled_date, stripe_payment_intent_id FROM scheduled_payments WHERE enrollment_id = :id ORDER BY scheduled_date, id;
-- SELECT * FROM payments WHERE ... -- add if payment_history drives effective balance in your app
