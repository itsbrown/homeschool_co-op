-- B1 — Orphaned scheduled payments (production triage)
-- Schema: scheduled_payments.enrollment_id -> program_enrollments.id (see shared/schema.ts)
-- Run in psql or admin SQL console. READ-ONLY unless you add UPDATE below.

-- 1a) True orphans: scheduled row points at non-existent enrollment
SELECT sp.id AS scheduled_payment_id,
       sp.enrollment_id,
       sp.school_id,
       sp.amount,
       sp.status,
       sp.parent_email,
       sp.scheduled_date
FROM scheduled_payments sp
LEFT JOIN program_enrollments pe ON pe.id = sp.enrollment_id
WHERE pe.id IS NULL
ORDER BY sp.id;

-- 1b) Count
SELECT COUNT(*) AS orphan_count
FROM scheduled_payments sp
LEFT JOIN program_enrollments pe ON pe.id = sp.enrollment_id
WHERE pe.id IS NULL;

-- 1c) OPTIONAL — rows where enrollment exists but is terminal (tighten policy before cancelling)
-- Review with product: cancelled/withdrawn may still need payment history.
SELECT sp.id AS scheduled_payment_id,
       sp.enrollment_id,
       pe.status AS enrollment_status,
       sp.amount,
       sp.status AS scheduled_status
FROM scheduled_payments sp
JOIN program_enrollments pe ON pe.id = sp.enrollment_id
WHERE pe.status IN ('cancelled', 'withdrawn', 'failed')
  AND sp.status IN ('pending', 'processing')
ORDER BY sp.id
LIMIT 500;
