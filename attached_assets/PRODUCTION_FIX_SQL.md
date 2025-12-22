# Production Database Fix - Payment Discrepancies
**Generated: December 22, 2025**

## IMPORTANT: Run these in your production database console (Neon/Supabase)

### Step 1: Preview the fix (DRY RUN - Safe to run)
This shows what would be fixed without making any changes:

```sql
SELECT 
  pe.id,
  u.email,
  u.name,
  pe.child_name,
  pe.class_name,
  pe.total_cost / 100.0 as total_cost_dollars,
  pe.total_paid / 100.0 as total_paid_dollars,
  pe.remaining_balance / 100.0 as current_remaining_dollars,
  (pe.total_cost - pe.total_paid) / 100.0 as correct_remaining_dollars,
  CASE 
    WHEN (pe.total_cost - pe.total_paid) <= 0 THEN 'completed'
    WHEN pe.total_paid > 0 THEN 'deposit_paid'
    ELSE 'pending'
  END as correct_payment_status
FROM program_enrollments pe
JOIN users u ON pe.parent_id = u.id
WHERE pe.remaining_balance != (pe.total_cost - pe.total_paid)
ORDER BY ABS(pe.remaining_balance - (pe.total_cost - pe.total_paid)) DESC;
```

### Step 2: Apply the fix (MAKES CHANGES)
Only run this after reviewing Step 1 output:

```sql
-- Update remaining_balance to correct value: total_cost - total_paid
UPDATE program_enrollments
SET 
  remaining_balance = GREATEST(0, total_cost - total_paid),
  payment_status = CASE 
    WHEN (total_cost - total_paid) <= 0 THEN 'completed'
    WHEN total_paid > 0 THEN 'deposit_paid'
    ELSE 'pending'
  END
WHERE remaining_balance != (total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL;
```

### Step 3: Verify the fix worked
Run the preview query again - it should return 0 rows:

```sql
SELECT COUNT(*) as remaining_discrepancies
FROM program_enrollments
WHERE remaining_balance != (total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL;
```

Expected result: `remaining_discrepancies = 0`

---

## Summary of What This Fixes:
- Sets `remaining_balance = total_cost - total_paid` for all enrollments
- Updates `payment_status` to reflect actual payment state:
  - `completed` if fully paid
  - `deposit_paid` if partially paid
  - `pending` if no payment made
