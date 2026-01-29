-- SQL Diagnostic Query: Identify Enrollments with Duplicate Scheduled Payment Dates
-- Run this in your database admin tool to preview affected records before fixing
-- This is a READ-ONLY diagnostic query (DRY RUN)

-- Find all scheduled payments with duplicate dates within the same enrollment
WITH duplicate_dates AS (
  SELECT 
    sp.enrollment_id,
    DATE(sp.scheduled_date) as payment_date,
    COUNT(*) as date_count
  FROM scheduled_payments sp
  WHERE sp.status IN ('pending', 'processing')
  GROUP BY sp.enrollment_id, DATE(sp.scheduled_date)
  HAVING COUNT(*) > 1
),
enrollment_details AS (
  SELECT 
    pe.id as enrollment_id,
    pe.child_name,
    pe.class_name,
    pe.payment_frequency,
    pe.program_start_date,
    pe.program_end_date,
    pe.total_cost,
    pe.total_paid,
    u.first_name || ' ' || u.last_name as parent_name,
    u.email as parent_email
  FROM program_enrollments pe
  JOIN users u ON pe.parent_id = u.id
  WHERE pe.id IN (SELECT DISTINCT enrollment_id FROM duplicate_dates)
)
SELECT 
  ed.enrollment_id,
  ed.child_name,
  ed.class_name,
  ed.parent_name,
  ed.parent_email,
  ed.payment_frequency,
  ed.program_start_date,
  ed.program_end_date,
  dd.payment_date as duplicate_date,
  dd.date_count as payments_on_same_date,
  (ed.total_cost - COALESCE(ed.total_paid, 0)) / 100.0 as remaining_balance_dollars
FROM enrollment_details ed
JOIN duplicate_dates dd ON ed.enrollment_id = dd.enrollment_id
ORDER BY ed.parent_email, ed.child_name, dd.payment_date;

-- Summary statistics
SELECT 
  'SUMMARY' as report_type,
  COUNT(DISTINCT enrollment_id) as total_affected_enrollments,
  COUNT(*) as total_duplicate_date_instances,
  SUM(date_count) as total_payments_with_duplicates
FROM (
  SELECT 
    enrollment_id,
    DATE(scheduled_date) as payment_date,
    COUNT(*) as date_count
  FROM scheduled_payments
  WHERE status IN ('pending', 'processing')
  GROUP BY enrollment_id, DATE(scheduled_date)
  HAVING COUNT(*) > 1
) duplicates;

-- Detailed view: All scheduled payments for affected enrollments (to see the full picture)
SELECT 
  pe.id as enrollment_id,
  pe.child_name,
  pe.class_name,
  u.email as parent_email,
  pe.payment_frequency,
  sp.id as payment_id,
  sp.scheduled_date,
  sp.amount / 100.0 as amount_dollars,
  sp.status,
  sp.installment_number,
  sp.total_installments,
  LAG(sp.scheduled_date) OVER (PARTITION BY sp.enrollment_id ORDER BY sp.scheduled_date) as prev_payment_date,
  EXTRACT(DAY FROM sp.scheduled_date - LAG(sp.scheduled_date) OVER (PARTITION BY sp.enrollment_id ORDER BY sp.scheduled_date)) as days_since_prev
FROM scheduled_payments sp
JOIN program_enrollments pe ON sp.enrollment_id = pe.id
JOIN users u ON pe.parent_id = u.id
WHERE sp.enrollment_id IN (
  SELECT DISTINCT enrollment_id 
  FROM scheduled_payments 
  WHERE status IN ('pending', 'processing')
  GROUP BY enrollment_id, DATE(scheduled_date)
  HAVING COUNT(*) > 1
)
AND sp.status IN ('pending', 'processing')
ORDER BY pe.id, sp.scheduled_date;
