# Production Database Fix - Payment Discrepancies
**Generated: December 22, 2025**

## IMPORTANT: Run these in your production database console (Neon/Supabase)

---

# UNDERSTANDING THE ISSUE

## Why Some Enrollments Appear "Overpaid"

When parents checked out with **both class enrollments AND membership fee** in the same cart:
- The webhook divided the TOTAL payment (classes + membership) evenly across class enrollments
- This caused each class enrollment to get credited with extra money (the membership portion)
- Example: 2 classes ($500 each) + membership ($175) = $1,175 total
- Split evenly: $1,175 / 2 = $587.50 per class
- Each class shows as "overpaid" by $87.50

The SQL below helps identify and handle these cases.

---

# PART 1: Identify Apparent Overpayments

### Step 1A: Preview apparent overpayments with membership context
This shows enrollments where total_paid > total_cost, along with membership info:

```sql
SELECT 
  pe.id as enrollment_id,
  u.email,
  u.name,
  pe.child_name,
  pe.class_name,
  pe.total_cost / 100.0 as class_cost_dollars,
  pe.total_paid / 100.0 as paid_dollars,
  (pe.total_paid - pe.total_cost) / 100.0 as overpayment_dollars,
  pe.remaining_balance / 100.0 as current_remaining_dollars,
  me.amount / 100.0 as membership_fee_dollars,
  me.amount_paid / 100.0 as membership_paid_dollars,
  CASE 
    WHEN me.id IS NOT NULL AND me.amount_paid = 0 AND (pe.total_paid - pe.total_cost) > 0 
    THEN 'LIKELY COMBINED PAYMENT - Membership credited to class'
    WHEN (pe.total_paid - pe.total_cost) > 0 
    THEN 'TRUE OVERPAYMENT - Review for refund'
    ELSE 'OK'
  END as diagnosis
FROM program_enrollments pe
JOIN users u ON pe.parent_id = u.id
LEFT JOIN membership_enrollments me ON me.parent_user_id = u.id 
  AND me.school_id = pe.school_id 
  AND me.membership_year IN (EXTRACT(YEAR FROM pe.enrollment_date)::int, EXTRACT(YEAR FROM pe.enrollment_date)::int + 1)
WHERE pe.total_paid > pe.total_cost
  AND pe.total_cost IS NOT NULL
  AND pe.total_paid IS NOT NULL
ORDER BY (pe.total_paid - pe.total_cost) DESC;
```

---

# PART 2: Fix Combined Class+Membership Payments

### Step 2A: Transfer excess class credits to unpaid memberships
For parents who had combined checkouts, this moves the "extra" money from class enrollments to membership:

```sql
-- First, identify parents with overpaid classes AND unpaid memberships
WITH overpaid_parents AS (
  SELECT DISTINCT 
    pe.parent_id,
    pe.school_id,
    SUM(pe.total_paid - pe.total_cost) OVER (PARTITION BY pe.parent_id) as total_overpayment
  FROM program_enrollments pe
  WHERE pe.total_paid > pe.total_cost
    AND pe.total_cost IS NOT NULL
    AND pe.total_paid IS NOT NULL
),
unpaid_memberships AS (
  SELECT 
    me.id as membership_id,
    me.parent_user_id,
    me.school_id,
    me.amount,
    me.amount_paid,
    (me.amount - me.amount_paid) as membership_owed
  FROM membership_enrollments me
  WHERE me.amount_paid < me.amount
    AND me.amount IS NOT NULL
)
SELECT 
  op.parent_id,
  u.email,
  op.total_overpayment / 100.0 as class_overpayment_dollars,
  um.membership_owed / 100.0 as membership_owed_dollars,
  CASE 
    WHEN op.total_overpayment >= um.membership_owed THEN 'CAN FULLY CREDIT MEMBERSHIP'
    WHEN op.total_overpayment > 0 AND um.membership_owed > 0 THEN 'CAN PARTIALLY CREDIT MEMBERSHIP'
    ELSE 'NO ACTION NEEDED'
  END as fix_action
FROM overpaid_parents op
JOIN users u ON op.parent_id = u.id
JOIN unpaid_memberships um ON um.parent_user_id = op.parent_id AND um.school_id = op.school_id
ORDER BY op.total_overpayment DESC;
```

### Step 2B: Apply the membership credit fix (MAKES CHANGES)
**CAUTION: Review Step 2A output first. This modifies both tables.**

```sql
-- For each parent with overpaid classes and unpaid membership,
-- transfer the appropriate amount
WITH overpaid_enrollments AS (
  SELECT 
    pe.id,
    pe.parent_id,
    pe.school_id,
    pe.total_cost,
    pe.total_paid,
    (pe.total_paid - pe.total_cost) as overpayment
  FROM program_enrollments pe
  WHERE pe.total_paid > pe.total_cost
    AND pe.total_cost IS NOT NULL
    AND pe.total_paid IS NOT NULL
),
parent_totals AS (
  SELECT 
    parent_id,
    school_id,
    SUM(overpayment) as total_overpayment
  FROM overpaid_enrollments
  GROUP BY parent_id, school_id
),
membership_credits AS (
  SELECT 
    me.id as membership_id,
    pt.parent_id,
    pt.school_id,
    me.amount as membership_fee,
    me.amount_paid as current_paid,
    LEAST(pt.total_overpayment, me.amount - me.amount_paid) as credit_to_apply
  FROM membership_enrollments me
  JOIN parent_totals pt ON pt.parent_id = me.parent_user_id AND pt.school_id = me.school_id
  WHERE me.amount_paid < me.amount
)
-- Update membership enrollments with the credit
UPDATE membership_enrollments me
SET 
  amount_paid = me.amount_paid + mc.credit_to_apply,
  remaining_balance = GREATEST(0, me.amount - (me.amount_paid + mc.credit_to_apply)),
  balance_due = GREATEST(0, me.amount - (me.amount_paid + mc.credit_to_apply)),
  status = CASE 
    WHEN (me.amount_paid + mc.credit_to_apply) >= me.amount THEN 'enrolled'
    ELSE me.status
  END
FROM membership_credits mc
WHERE me.id = mc.membership_id;
```

---

# PART 3: Fix Class Enrollment Balances

### Step 3A: Fix program enrollment remaining balances
After crediting memberships, fix the class enrollment records:

```sql
-- Set remaining_balance correctly for all program enrollments
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

---

# PART 4: Fix Membership Enrollment Balances

### Step 4A: Fix membership enrollment remaining balances

```sql
UPDATE membership_enrollments
SET 
  remaining_balance = GREATEST(0, amount - amount_paid),
  balance_due = GREATEST(0, amount - amount_paid)
WHERE remaining_balance != GREATEST(0, amount - amount_paid)
  AND amount IS NOT NULL
  AND amount_paid IS NOT NULL;
```

---

# VERIFICATION QUERIES

### Check for remaining discrepancies:

```sql
-- Program enrollments with incorrect balances
SELECT COUNT(*) as program_enrollment_issues
FROM program_enrollments
WHERE remaining_balance != GREATEST(0, total_cost - total_paid)
  AND total_cost IS NOT NULL
  AND total_paid IS NOT NULL;

-- Membership enrollments with incorrect balances  
SELECT COUNT(*) as membership_enrollment_issues
FROM membership_enrollments
WHERE remaining_balance != GREATEST(0, amount - amount_paid)
  AND amount IS NOT NULL
  AND amount_paid IS NOT NULL;
```

Both should return 0 after running the fixes.

---

# SUMMARY

1. **Run Part 1** to understand the scope of the issue
2. **Run Part 2** if you find parents with overpaid classes AND unpaid memberships (combined checkout issue)
3. **Run Part 3** to fix all program enrollment balances
4. **Run Part 4** to fix all membership enrollment balances
5. **Run Verification** to confirm all issues are resolved
