-- B5 — Sum of pending scheduled payment amounts vs enrollment owed (gross check)
-- After B1 orphans are excluded or cancelled, re-run dashboard; use this to compare sums.

SELECT sp.enrollment_id,
       pe.parent_email,
       pe.child_name,
       SUM(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END) AS pending_sum_cents,
       (COALESCE(pe.total_cost, 0) - COALESCE(pe.total_paid, 0)) AS enrollment_owed_cents,
       pe.remaining_balance AS stored_remaining_cents
FROM scheduled_payments sp
JOIN program_enrollments pe ON pe.id = sp.enrollment_id
WHERE pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
GROUP BY sp.enrollment_id, pe.parent_email, pe.child_name,
         pe.total_cost, pe.total_paid, pe.remaining_balance
HAVING SUM(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END)
       IS DISTINCT FROM (COALESCE(pe.total_cost, 0) - COALESCE(pe.total_paid, 0))
ORDER BY ABS(
  SUM(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END)
  - (COALESCE(pe.total_cost, 0) - COALESCE(pe.total_paid, 0))
) DESC
LIMIT 200;
