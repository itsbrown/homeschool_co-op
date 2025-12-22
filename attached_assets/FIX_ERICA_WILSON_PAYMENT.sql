-- FIX: Apply Erica Wilson's $153.90 scheduled payment to her enrollments
-- The scheduled payment (ID: 3) was marked "completed" but never applied to enrollment balances
-- This script also creates the payment history record for proper audit trail

-- Step 1: Verify current state
SELECT 
    pe.id as enrollment_id,
    pe.child_name,
    pe.total_cost / 100.0 as cost,
    pe.total_paid / 100.0 as paid,
    pe.remaining_balance / 100.0 as remaining,
    pe.payment_status
FROM program_enrollments pe
WHERE pe.parent_id = 23;

-- Step 2: Verify the scheduled payment
SELECT 
    id, 
    amount / 100.0 as amount,
    status,
    scheduled_date,
    enrollment_id
FROM scheduled_payments
WHERE parent_email = 'erica_wilson223@yahoo.com' AND status = 'completed';

-- Step 3: Calculate the fix
-- $153.90 = 15390 cents
-- 2 enrollments = 15390 / 2 = 7695 cents per enrollment ($76.95)

-- Step 4: Apply the payment to enrollment 109 (Miles)
UPDATE program_enrollments
SET 
    total_paid = total_paid + 7695,
    remaining_balance = total_cost - (total_paid + 7695),
    payment_status = CASE 
        WHEN (total_cost - (total_paid + 7695)) <= 0 THEN 'completed'
        ELSE 'deposit_paid'
    END,
    updated_at = NOW()
WHERE id = 109;

-- Step 5: Apply the payment to enrollment 110 (Maddox)
UPDATE program_enrollments
SET 
    total_paid = total_paid + 7695,
    remaining_balance = total_cost - (total_paid + 7695),
    payment_status = CASE 
        WHEN (total_cost - (total_paid + 7695)) <= 0 THEN 'completed'
        ELSE 'deposit_paid'
    END,
    updated_at = NOW()
WHERE id = 110;

-- Step 6: Create payment history record for audit trail
-- Get school_id and parent_id first
INSERT INTO payments (
    school_id,
    parent_id,
    parent_email,
    child_name,
    class_name,
    description,
    amount,
    currency,
    status,
    stripe_payment_intent_id,
    stripe_charge_id,
    stripe_refund_id,
    original_payment_id,
    enrollment_ids,
    metadata,
    created_at,
    updated_at
)
SELECT 
    2 as school_id,
    23 as parent_id,
    'erica_wilson223@yahoo.com' as parent_email,
    'Miles Marek, Maddox Marek' as child_name,
    'Macaronis | Greece | Winter 2026' as class_name,
    'Scheduled payment - Manual fix applied' as description,
    15390 as amount,
    'usd' as currency,
    'completed' as status,
    'manual_fix_' || NOW()::text as stripe_payment_intent_id,
    NULL as stripe_charge_id,
    NULL as stripe_refund_id,
    NULL as original_payment_id,
    '[109, 110]'::jsonb as enrollment_ids,
    jsonb_build_object(
        'fixType', 'manual_sql_fix',
        'scheduledPaymentId', 3,
        'reason', 'Scheduled payment marked completed but not applied to enrollments',
        'fixedAt', NOW()
    ) as metadata,
    NOW() as created_at,
    NOW() as updated_at;

-- Step 7: Verify the fix
SELECT 
    pe.id as enrollment_id,
    pe.child_name,
    pe.total_cost / 100.0 as cost,
    pe.total_paid / 100.0 as paid,
    pe.remaining_balance / 100.0 as remaining,
    pe.payment_status,
    -- Validate math
    CASE 
        WHEN pe.total_cost = pe.total_paid + pe.remaining_balance THEN 'VALID'
        ELSE 'MISMATCH'
    END as balance_check
FROM program_enrollments pe
WHERE pe.parent_id = 23;

-- Step 8: Verify payment history was created
SELECT id, parent_email, description, amount/100.0 as amount, status, created_at
FROM payments
WHERE parent_email = 'erica_wilson223@yahoo.com'
ORDER BY created_at DESC
LIMIT 5;
