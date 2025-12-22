# Production Database Fix - Payment Discrepancies
**Generated: December 22, 2025**

## IMPORTANT: Run these in your production database console (Neon/Supabase)

---

# PART 1: Program Enrollments (Class Enrollments)

### Step 1A: Preview program enrollment fixes (DRY RUN - Safe to run)
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
  GREATEST(0, pe.total_cost - pe.total_paid) / 100.0 as correct_remaining_dollars,
  CASE 
    WHEN pe.total_paid >= pe.total_cost THEN 'completed'
    WHEN pe.total_paid > 0 THEN 'deposit_paid'
    ELSE 'pending'
  END as correct_payment_status,
  CASE 
    WHEN (pe.total_cost - pe.total_paid) < 0 THEN 'OVERPAID'
    ELSE 'UNDERPAID'
  END as discrepancy_type
FROM program_enrollments pe
JOIN users u ON pe.parent_id = u.id
WHERE pe.remaining_balance != GREATEST(0, pe.total_cost - pe.total_paid)
  AND pe.total_cost IS NOT NULL
  AND pe.total_paid IS NOT NULL
ORDER BY ABS(pe.remaining_balance - GREATEST(0, pe.total_cost - pe.total_paid)) DESC;
```

### Step 2A: Apply the program enrollment fix (MAKES CHANGES)
Only run this after reviewing Step 1A output:

```sql
-- Update remaining_balance to correct value: GREATEST(0, total_cost - total_paid)
-- This handles overpayments correctly by setting remaining to 0
UPDATE program_enrollments
SET 
  remaining_balance = GREATEST(0, total_cost - total_paid),
  payment_status = CASE 
    WHEN total_paid >= total_cost THEN 'completed'
    WHEN total_paid > 0 THEN 'deposit_paid'
    ELSE 'pending'
  END
WHERE remaining_balance != GREATEST(0, total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL;
```

### Step 3A: Verify program enrollment fix worked
Run this verification - it should return 0 rows:

```sql
SELECT COUNT(*) as program_enrollment_discrepancies
FROM program_enrollments
WHERE remaining_balance != GREATEST(0, total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL;
```

Expected result: `program_enrollment_discrepancies = 0`

---

# PART 2: Membership Enrollments

### Step 1B: Preview membership enrollment fixes (DRY RUN - Safe to run)
This shows what would be fixed without making any changes:

```sql
SELECT 
  me.id,
  u.email,
  u.name,
  me.membership_year,
  me.amount / 100.0 as total_amount_dollars,
  me.amount_paid / 100.0 as amount_paid_dollars,
  me.remaining_balance / 100.0 as current_remaining_dollars,
  GREATEST(0, me.amount - me.amount_paid) / 100.0 as correct_remaining_dollars,
  me.status as current_status,
  CASE 
    WHEN (me.amount - me.amount_paid) < 0 THEN 'OVERPAID'
    ELSE 'UNDERPAID'
  END as discrepancy_type
FROM membership_enrollments me
JOIN users u ON me.parent_user_id = u.id
WHERE me.remaining_balance != GREATEST(0, me.amount - me.amount_paid)
  AND me.amount IS NOT NULL
  AND me.amount_paid IS NOT NULL
ORDER BY ABS(me.remaining_balance - GREATEST(0, me.amount - me.amount_paid)) DESC;
```

### Step 2B: Apply the membership enrollment fix (MAKES CHANGES)
Only run this after reviewing Step 1B output:

```sql
-- Update remaining_balance to correct value: GREATEST(0, amount - amount_paid)
-- This handles overpayments correctly by setting remaining to 0
UPDATE membership_enrollments
SET 
  remaining_balance = GREATEST(0, amount - amount_paid),
  balance_due = GREATEST(0, amount - amount_paid)
WHERE remaining_balance != GREATEST(0, amount - amount_paid)
  AND amount IS NOT NULL
  AND amount_paid IS NOT NULL;
```

### Step 3B: Verify membership enrollment fix worked
Run this verification - it should return 0 rows:

```sql
SELECT COUNT(*) as membership_enrollment_discrepancies
FROM membership_enrollments
WHERE remaining_balance != GREATEST(0, amount - amount_paid)
  AND amount IS NOT NULL
  AND amount_paid IS NOT NULL;
```

Expected result: `membership_enrollment_discrepancies = 0`

---

# Summary of What This Fixes

## Program Enrollments (Classes):
- Sets `remaining_balance = GREATEST(0, total_cost - total_paid)` for all class enrollments
- Handles overpayments correctly (remaining_balance = 0 when total_paid > total_cost)
- Updates `payment_status` to reflect actual payment state:
  - `completed` if fully paid or overpaid
  - `deposit_paid` if partially paid
  - `pending` if no payment made

## Membership Enrollments:
- Sets `remaining_balance = GREATEST(0, amount - amount_paid)` for all membership enrollments
- Sets `balance_due = remaining_balance` to keep both fields in sync
- Handles overpayments correctly (remaining_balance = 0)

---

# Quick Check: Count all discrepancies before starting

```sql
SELECT 
  'program_enrollments' as table_name,
  COUNT(*) as discrepancy_count
FROM program_enrollments
WHERE remaining_balance != GREATEST(0, total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL
UNION ALL
SELECT 
  'membership_enrollments' as table_name,
  COUNT(*) as discrepancy_count
FROM membership_enrollments
WHERE remaining_balance != GREATEST(0, amount - amount_paid)
  AND amount IS NOT NULL
  AND amount_paid IS NOT NULL;
```

---

# NOTE: Overpayment Audit
If the preview queries show records marked as "OVERPAID", these are families who paid more than the enrollment cost. The fix will set their remaining_balance to 0, but you may want to review these cases separately to determine if refunds are needed.
