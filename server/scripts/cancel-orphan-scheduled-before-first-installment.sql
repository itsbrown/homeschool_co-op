-- Cancel pending scheduled_payments for enrollments that never paid installment 1.
-- Run after deploying deferred scheduled-payment creation (installments 2+ only after PI succeeds).
--
-- Preview:
-- SELECT sp.id, sp.parent_email, sp.installment_number, sp.status, e.id AS enrollment_id, e.total_paid
-- FROM scheduled_payments sp
-- JOIN program_enrollments e ON e.id = sp.enrollment_id
-- WHERE sp.status = 'pending'
--   AND (e.total_paid IS NULL OR e.total_paid = 0)
--   AND sp.installment_number >= 2;

UPDATE scheduled_payments sp
SET status = 'cancelled',
    updated_at = NOW()
FROM program_enrollments e
WHERE sp.enrollment_id = e.id
  AND sp.status = 'pending'
  AND COALESCE(e.total_paid, 0) = 0
  AND sp.installment_number >= 2;
