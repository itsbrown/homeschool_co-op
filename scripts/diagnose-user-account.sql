-- ============================================================
-- DIAGNOSTIC SCRIPT: Check User Account, Children, and Discounts
-- Usage: Run this against the production database to diagnose
-- payment mismatch issues for a specific user
-- ============================================================

-- CHANGE THIS VALUE TO THE USER ID YOU WANT TO CHECK
-- For Denise: User ID = 12
\set target_user_id 12

-- ============================================================
-- 1. USER INFORMATION
-- ============================================================
SELECT '=== USER INFORMATION ===' as section;

SELECT 
    id,
    email,
    first_name,
    last_name,
    school_id,
    stripe_customer_id,
    created_at
FROM users 
WHERE id = :target_user_id;

-- ============================================================
-- 2. CHILDREN LINKED TO THIS USER
-- ============================================================
SELECT '=== CHILDREN LINKED TO USER ===' as section;

SELECT 
    c.id as child_id,
    c.first_name,
    c.last_name,
    c.parent_id,
    c.school_id as child_school_id,
    u.school_id as parent_school_id,
    CASE WHEN c.school_id = u.school_id THEN 'MATCH' ELSE 'MISMATCH!' END as school_match
FROM children c
JOIN users u ON c.parent_id = u.id
WHERE c.parent_id = :target_user_id
ORDER BY c.id;

-- Check for orphaned or mislinked children
SELECT '=== POTENTIAL ISSUES: Children with school mismatch ===' as section;

SELECT 
    c.id as child_id,
    c.first_name || ' ' || c.last_name as child_name,
    c.school_id as child_school,
    u.school_id as parent_school,
    'Child assigned to different school than parent!' as issue
FROM children c
JOIN users u ON c.parent_id = u.id
WHERE c.parent_id = :target_user_id
  AND c.school_id != u.school_id;

-- ============================================================
-- 3. SCHOOL SETTINGS (for discount calculation)
-- ============================================================
SELECT '=== SCHOOL SETTINGS ===' as section;

SELECT 
    s.id as school_id,
    s.name as school_name,
    s.membership_required,
    s.membership_fee_amount,
    s.free_after_threshold_enabled,
    s.free_after_threshold
FROM schools s
JOIN users u ON s.id = u.school_id
WHERE u.id = :target_user_id;

-- ============================================================
-- 4. ACTIVE DISCOUNTS FOR USER'S SCHOOL
-- ============================================================
SELECT '=== ACTIVE DISCOUNTS FOR SCHOOL ===' as section;

SELECT 
    d.id,
    d.name,
    d.type,
    d.value,
    d.application_method,
    d.sibling_discount,
    d.applies_to_membership,
    d.min_order_amount,
    d.max_discount_amount,
    d.combinable_with_others,
    d.priority,
    d.is_active
FROM discounts d
JOIN users u ON d.school_id = u.school_id
WHERE u.id = :target_user_id
  AND d.is_active = true
ORDER BY d.priority DESC;

-- ============================================================
-- 5. MEMBERSHIP ENROLLMENTS
-- ============================================================
SELECT '=== MEMBERSHIP ENROLLMENTS ===' as section;

SELECT 
    me.id,
    me.parent_id,
    me.school_id,
    me.membership_year,
    me.status,
    me.payment_status,
    me.amount_paid,
    me.created_at
FROM membership_enrollments me
WHERE me.parent_id = :target_user_id
ORDER BY me.membership_year DESC;

-- ============================================================
-- 6. RECENT PROGRAM ENROLLMENTS (last 90 days)
-- ============================================================
SELECT '=== RECENT PROGRAM ENROLLMENTS ===' as section;

SELECT 
    pe.id,
    pe.child_id,
    c.first_name || ' ' || c.last_name as child_name,
    pe.class_id,
    mc.title as class_title,
    pe.status,
    pe.payment_status,
    pe.total_cost,
    pe.amount_paid,
    pe.remaining_balance,
    pe.created_at
FROM program_enrollments pe
JOIN children c ON pe.child_id = c.id
LEFT JOIN marketplace_classes mc ON pe.marketplace_class_id = mc.id
WHERE c.parent_id = :target_user_id
  AND pe.created_at > NOW() - INTERVAL '90 days'
ORDER BY pe.created_at DESC;

-- ============================================================
-- 7. CHECK FOR DUPLICATE CHILDREN
-- ============================================================
SELECT '=== POTENTIAL DUPLICATE CHILDREN ===' as section;

SELECT 
    first_name,
    last_name,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as child_ids
FROM children
WHERE parent_id = :target_user_id
GROUP BY first_name, last_name
HAVING COUNT(*) > 1;

-- ============================================================
-- 8. SIBLING DISCOUNT ELIGIBILITY CHECK
-- ============================================================
SELECT '=== SIBLING DISCOUNT ELIGIBILITY ===' as section;

SELECT 
    (SELECT COUNT(*) FROM children WHERE parent_id = :target_user_id) as total_children,
    CASE 
        WHEN (SELECT COUNT(*) FROM children WHERE parent_id = :target_user_id) > 1 
        THEN 'ELIGIBLE for sibling discount' 
        ELSE 'NOT eligible (need 2+ children)'
    END as sibling_discount_status;

-- Check if sibling discount is configured for the school
SELECT 
    d.id as discount_id,
    d.name,
    d.value as discount_percentage,
    'Sibling discount configured' as status
FROM discounts d
JOIN users u ON d.school_id = u.school_id
WHERE u.id = :target_user_id
  AND d.sibling_discount = true
  AND d.is_active = true;

-- ============================================================
-- 9. FREE AFTER THRESHOLD ELIGIBILITY
-- ============================================================
SELECT '=== FREE AFTER THRESHOLD ELIGIBILITY ===' as section;

SELECT 
    s.free_after_threshold_enabled,
    s.free_after_threshold,
    (SELECT COUNT(*) FROM children WHERE parent_id = :target_user_id) as child_count,
    CASE 
        WHEN s.free_after_threshold_enabled 
             AND (SELECT COUNT(*) FROM children WHERE parent_id = :target_user_id) > s.free_after_threshold
        THEN 'ELIGIBLE for free classes (child #' || (s.free_after_threshold + 1)::text || '+ free)'
        ELSE 'NOT eligible'
    END as free_after_threshold_status
FROM schools s
JOIN users u ON s.id = u.school_id
WHERE u.id = :target_user_id;

-- ============================================================
-- 10. SUMMARY
-- ============================================================
SELECT '=== ACCOUNT SUMMARY ===' as section;

SELECT 
    u.id as user_id,
    u.email,
    u.school_id,
    s.name as school_name,
    (SELECT COUNT(*) FROM children WHERE parent_id = u.id) as children_count,
    (SELECT COUNT(*) FROM membership_enrollments WHERE parent_id = u.id AND status IN ('enrolled', 'active', 'paid')) as active_memberships,
    (SELECT COUNT(*) FROM program_enrollments pe JOIN children c ON pe.child_id = c.id WHERE c.parent_id = u.id AND pe.status = 'pending_payment') as pending_enrollments,
    (SELECT COUNT(*) FROM discounts d WHERE d.school_id = u.school_id AND d.is_active = true) as active_school_discounts
FROM users u
JOIN schools s ON u.school_id = s.id
WHERE u.id = :target_user_id;
