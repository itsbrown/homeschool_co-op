-- B2 — Enrollments on a payment plan with amount owed but no PENDING scheduled rows
-- Heuristic: not full_payment; owes money by (total_cost - total_paid) or remaining_balance.
-- Tune enums to match your DB if different.

SELECT pe.id AS enrollment_id,
       pe.school_id,
       pe.parent_email,
       pe.child_name,
       pe.class_name,
       pe.payment_plan,
       pe.status,
       pe.total_cost,
       pe.total_paid,
       pe.remaining_balance,
       (COALESCE(pe.total_cost, 0) - COALESCE(pe.total_paid, 0)) AS computed_owed_cents,
       COUNT(sp.id) FILTER (WHERE sp.status = 'pending') AS pending_scheduled_count
FROM program_enrollments pe
LEFT JOIN scheduled_payments sp ON sp.enrollment_id = pe.id
WHERE pe.payment_plan IS NOT NULL
  AND pe.payment_plan <> 'full_payment'
  AND pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
  AND (
    (COALESCE(pe.total_cost, 0) - COALESCE(pe.total_paid, 0)) > 0
    OR COALESCE(pe.remaining_balance, 0) > 0
  )
GROUP BY pe.id, pe.school_id, pe.parent_email, pe.child_name, pe.class_name,
         pe.payment_plan, pe.status, pe.total_cost, pe.total_paid, pe.remaining_balance
HAVING COUNT(sp.id) FILTER (WHERE sp.status = 'pending') = 0
ORDER BY computed_owed_cents DESC
LIMIT 200;
