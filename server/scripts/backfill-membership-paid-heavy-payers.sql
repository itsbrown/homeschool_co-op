-- =============================================================================
-- Membership backfill: mark enrolled + paid for parents with > $175 in
-- class totals OR any completed scheduled_payment OR any completed payments row,
-- at schools that require membership with fee > 0.
--
-- Run in order: (1) preview → review rows → (2) UPDATE in a transaction →
-- (3) INSERT missing rows if needed → (4) optional member_id on users.
--
-- Amounts are in CENTS. $175 = 17500.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREVIEW — accounts that qualify + current membership (verify before writes)
-- -----------------------------------------------------------------------------
WITH yr AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y0
),
schools_req AS (
  SELECT s.id, s.name, s.membership_fee_amount, s.membership_renewal_month,
         s.membership_renewal_day, s.membership_grace_period_days
  FROM schools s
  WHERE COALESCE(s.membership_required, true) = true
    AND COALESCE(s.membership_fee_amount, 0) > 0
),
class_totals AS (
  SELECT pe.parent_id, pe.school_id, SUM(pe.total_paid)::bigint AS total_class_paid_cents
  FROM program_enrollments pe
  WHERE pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
  GROUP BY pe.parent_id, pe.school_id
  HAVING SUM(pe.total_paid) > 17500
),
from_scheduled AS (
  SELECT DISTINCT sp.parent_id, sp.school_id
  FROM scheduled_payments sp
  WHERE sp.status = 'completed'
    AND sp.amount > 17500
),
from_payments AS (
  SELECT DISTINCT p.parent_id, p.school_id
  FROM payments p
  WHERE p.status = 'completed'
    AND p.amount > 17500
    AND p.parent_id IS NOT NULL
),
candidates AS (
  SELECT DISTINCT x.parent_id, x.school_id
  FROM (
    SELECT parent_id, school_id FROM class_totals
    UNION
    SELECT parent_id, school_id FROM from_scheduled
    UNION
    SELECT parent_id, school_id FROM from_payments
  ) x
  INNER JOIN schools_req sr ON sr.id = x.school_id
),
me_display AS (
  SELECT DISTINCT ON (c.parent_id, c.school_id)
    c.parent_id,
    c.school_id,
    me.id AS membership_enrollment_id,
    me.membership_year,
    me.status AS membership_status,
    me.amount AS membership_amount_cents,
    me.amount_paid AS membership_amount_paid_cents,
    me.remaining_balance AS membership_remaining_balance_cents,
    me.balance_due AS membership_balance_due_cents,
    me.expiration_date,
    me.grace_period_end,
    me.due_date
  FROM candidates c
  LEFT JOIN membership_enrollments me
    ON me.parent_user_id = c.parent_id
   AND me.school_id = c.school_id
   AND me.membership_year IN ((SELECT y0 FROM yr), (SELECT y0 FROM yr) + 1)
  ORDER BY c.parent_id, c.school_id, me.membership_year DESC NULLS LAST
),
valid_exists AS (
  SELECT c.parent_id, c.school_id,
    EXISTS (
      SELECT 1
      FROM membership_enrollments me2, yr
      WHERE me2.parent_user_id = c.parent_id
        AND me2.school_id = c.school_id
        AND me2.membership_year IN (yr.y0, yr.y0 + 1)
        AND now() <= COALESCE(me2.grace_period_end, me2.expiration_date)
        AND (
          me2.status IN ('enrolled', 'grace_period')
          OR me2.remaining_balance <= 0
        )
    ) AS has_valid_active_membership
  FROM candidates c
)
SELECT
  c.parent_id,
  c.school_id,
  u.email AS parent_email,
  sr.name AS school_name,
  ct.total_class_paid_cents,
  md.membership_enrollment_id,
  md.membership_year,
  md.membership_status,
  md.membership_amount_cents,
  md.membership_amount_paid_cents,
  md.membership_remaining_balance_cents,
  md.membership_balance_due_cents,
  md.expiration_date,
  md.grace_period_end,
  ve.has_valid_active_membership,
  CASE
    WHEN ve.has_valid_active_membership THEN 'skip_already_ok'
    WHEN md.membership_enrollment_id IS NULL THEN 'would_insert_new_row'
    ELSE 'would_update_existing_row'
  END AS backfill_action
FROM candidates c
JOIN schools_req sr ON sr.id = c.school_id
JOIN users u ON u.id = c.parent_id
LEFT JOIN me_display md ON md.parent_id = c.parent_id AND md.school_id = c.school_id
LEFT JOIN valid_exists ve ON ve.parent_id = c.parent_id AND ve.school_id = c.school_id
LEFT JOIN class_totals ct ON ct.parent_id = c.parent_id AND ct.school_id = c.school_id
ORDER BY c.school_id, backfill_action, c.parent_id;

-- Optional: restrict to one school while verifying
-- Add at end of FROM candidates c:  AND c.school_id = 2


-- -----------------------------------------------------------------------------
-- 2) UPDATE existing membership rows (pending / expired / etc.) → enrolled + paid
--    Run inside a transaction; COMMIT only after re-running section 1 counts.
-- -----------------------------------------------------------------------------
/*
BEGIN;

WITH yr AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y0
),
schools_req AS (
  SELECT s.id, s.membership_fee_amount, s.membership_renewal_month,
         s.membership_renewal_day, s.membership_grace_period_days
  FROM schools s
  WHERE COALESCE(s.membership_required, true) = true
    AND COALESCE(s.membership_fee_amount, 0) > 0
),
class_totals AS (
  SELECT pe.parent_id, pe.school_id, SUM(pe.total_paid)::bigint AS total_class_paid_cents
  FROM program_enrollments pe
  WHERE pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
  GROUP BY pe.parent_id, pe.school_id
  HAVING SUM(pe.total_paid) > 17500
),
from_scheduled AS (
  SELECT DISTINCT sp.parent_id, sp.school_id
  FROM scheduled_payments sp
  WHERE sp.status = 'completed' AND sp.amount > 17500
),
from_payments AS (
  SELECT DISTINCT p.parent_id, p.school_id
  FROM payments p
  WHERE p.status = 'completed' AND p.amount > 17500 AND p.parent_id IS NOT NULL
),
candidates AS (
  SELECT DISTINCT x.parent_id, x.school_id
  FROM (
    SELECT parent_id, school_id FROM class_totals
    UNION SELECT parent_id, school_id FROM from_scheduled
    UNION SELECT parent_id, school_id FROM from_payments
  ) x
  INNER JOIN schools_req sr ON sr.id = x.school_id
)
UPDATE membership_enrollments me
SET
  status = 'enrolled',
  amount = GREATEST(COALESCE(me.amount, 0), COALESCE(s.membership_fee_amount, 17500)),
  amount_paid = GREATEST(COALESCE(me.amount, 0), COALESCE(s.membership_fee_amount, 17500)),
  total_amount = GREATEST(COALESCE(me.amount, 0), COALESCE(s.membership_fee_amount, 17500)),
  remaining_balance = 0,
  balance_due = 0,
  payment_method = 'other',
  start_date = COALESCE(me.start_date, now()),
  due_date = CASE
    WHEN me.status = 'pending_payment'
         AND me.expiration_date > now()
    THEN me.due_date
    ELSE make_timestamp(
      me.membership_year,
      COALESCE(s.membership_renewal_month, 9),
      COALESCE(s.membership_renewal_day, 1),
      0, 0, 0.0
    )::timestamp
  END,
  expiration_date = CASE
    WHEN me.status = 'pending_payment'
         AND me.expiration_date > now()
    THEN me.expiration_date
    ELSE make_timestamp(
      me.membership_year + 1,
      COALESCE(s.membership_renewal_month, 9),
      COALESCE(s.membership_renewal_day, 1),
      0, 0, 0.0
    )::timestamp
  END,
  end_date = CASE
    WHEN me.status = 'pending_payment'
         AND me.expiration_date > now()
    THEN me.end_date
    ELSE make_timestamp(
      me.membership_year + 1,
      COALESCE(s.membership_renewal_month, 9),
      COALESCE(s.membership_renewal_day, 1),
      0, 0, 0.0
    )::timestamp
  END,
  grace_period_end = CASE
    WHEN me.status = 'pending_payment'
         AND me.expiration_date > now()
    THEN me.grace_period_end
    ELSE (
      make_timestamp(
        me.membership_year + 1,
        COALESCE(s.membership_renewal_month, 9),
        COALESCE(s.membership_renewal_day, 1),
        0, 0, 0.0
      )::timestamp
      + (COALESCE(s.membership_grace_period_days, 30) || ' days')::interval
    )
  END,
  renewal_date = CASE
    WHEN me.status = 'pending_payment'
         AND me.expiration_date > now()
    THEN COALESCE(me.renewal_date, me.expiration_date)
    ELSE make_timestamp(
      me.membership_year + 1,
      COALESCE(s.membership_renewal_month, 9),
      COALESCE(s.membership_renewal_day, 1),
      0, 0, 0.0
    )::timestamp
  END,
  notes = trim(both E'\n' from concat_ws(E'\n',
    NULLIF(trim(both FROM me.notes), ''),
    '[sql-backfill-membership-paid-heavy-payers ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS') || '] enrolled + paid (>' || (17500 / 100) || ' USD activity threshold)'
  )),
  updated_at = now()
FROM candidates c
JOIN schools s ON s.id = c.school_id
JOIN yr ON true
WHERE me.parent_user_id = c.parent_id
  AND me.school_id = c.school_id
  AND me.membership_year IN (yr.y0, yr.y0 + 1)
  AND NOT EXISTS (
    SELECT 1
    FROM membership_enrollments me2
    WHERE me2.parent_user_id = c.parent_id
      AND me2.school_id = c.school_id
      AND me2.membership_year IN (yr.y0, yr.y0 + 1)
      AND now() <= COALESCE(me2.grace_period_end, me2.expiration_date)
      AND (
        me2.status IN ('enrolled', 'grace_period')
        OR me2.remaining_balance <= 0
      )
  );

-- Check rowcount in client, then:
COMMIT;
-- or ROLLBACK;
*/


-- -----------------------------------------------------------------------------
-- 3) INSERT missing membership_enrollments for candidates with no row (y0 / y0+1)
--    Run after UPDATE. Uses current calendar year as membership_year.
-- -----------------------------------------------------------------------------
/*
BEGIN;

WITH yr AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y0
),
schools_req AS (
  SELECT s.id, s.membership_fee_amount, s.membership_renewal_month,
         s.membership_renewal_day, s.membership_grace_period_days
  FROM schools s
  WHERE COALESCE(s.membership_required, true) = true
    AND COALESCE(s.membership_fee_amount, 0) > 0
),
class_totals AS (
  SELECT pe.parent_id, pe.school_id, SUM(pe.total_paid)::bigint AS total_class_paid_cents
  FROM program_enrollments pe
  WHERE pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
  GROUP BY pe.parent_id, pe.school_id
  HAVING SUM(pe.total_paid) > 17500
),
from_scheduled AS (
  SELECT DISTINCT sp.parent_id, sp.school_id
  FROM scheduled_payments sp
  WHERE sp.status = 'completed' AND sp.amount > 17500
),
from_payments AS (
  SELECT DISTINCT p.parent_id, p.school_id
  FROM payments p
  WHERE p.status = 'completed' AND p.amount > 17500 AND p.parent_id IS NOT NULL
),
candidates AS (
  SELECT DISTINCT x.parent_id, x.school_id
  FROM (
    SELECT parent_id, school_id FROM class_totals
    UNION SELECT parent_id, school_id FROM from_scheduled
    UNION SELECT parent_id, school_id FROM from_payments
  ) x
  INNER JOIN schools_req sr ON sr.id = x.school_id
),
to_insert AS (
  SELECT c.parent_id, c.school_id, yr.y0 AS membership_year, s.membership_fee_amount AS fee_cents,
         COALESCE(s.membership_renewal_month, 9) AS rm,
         COALESCE(s.membership_renewal_day, 1) AS rd,
         COALESCE(s.membership_grace_period_days, 30) AS gd
  FROM candidates c
  CROSS JOIN yr
  JOIN schools s ON s.id = c.school_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM membership_enrollments me
    WHERE me.parent_user_id = c.parent_id
      AND me.school_id = c.school_id
      AND me.membership_year IN (yr.y0, yr.y0 + 1)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM membership_enrollments me2, yr y
    WHERE me2.parent_user_id = c.parent_id
      AND me2.school_id = c.school_id
      AND me2.membership_year IN (y.y0, y.y0 + 1)
      AND now() <= COALESCE(me2.grace_period_end, me2.expiration_date)
      AND (
        me2.status IN ('enrolled', 'grace_period')
        OR me2.remaining_balance <= 0
      )
  )
)
INSERT INTO membership_enrollments (
  school_id, parent_user_id, membership_year, amount, amount_paid, remaining_balance,
  total_amount, balance_due, status, due_date, expiration_date, end_date, grace_period_end,
  membership_tier, stripe_subscription_id, stripe_customer_id, start_date, renewal_date,
  payment_method, notes, created_at, updated_at
)
SELECT
  ti.school_id,
  ti.parent_id,
  ti.membership_year,
  ti.fee_cents,
  ti.fee_cents,
  0,
  ti.fee_cents,
  0,
  'enrolled',
  make_timestamp(ti.membership_year, ti.rm, ti.rd, 0, 0, 0.0)::timestamp,
  make_timestamp(ti.membership_year + 1, ti.rm, ti.rd, 0, 0, 0.0)::timestamp,
  make_timestamp(ti.membership_year + 1, ti.rm, ti.rd, 0, 0, 0.0)::timestamp,
  make_timestamp(ti.membership_year + 1, ti.rm, ti.rd, 0, 0, 0.0)::timestamp
    + (ti.gd || ' days')::interval,
  'basic',
  NULL,
  NULL,
  now(),
  make_timestamp(ti.membership_year + 1, ti.rm, ti.rd, 0, 0, 0.0)::timestamp,
  'other',
  '[sql-backfill-membership-paid-heavy-payers] new row enrolled + paid',
  now(),
  now()
FROM to_insert ti;

COMMIT;
*/


-- -----------------------------------------------------------------------------
-- 4) OPTIONAL — assign member_id for parents in candidates who still have none
--    (Format similar to app: ASA-YYYY-XXXXXX; uses md5 — run once, check duplicates.)
-- -----------------------------------------------------------------------------
/*
BEGIN;

WITH yr AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y0
),
schools_req AS (
  SELECT s.id FROM schools s
  WHERE COALESCE(s.membership_required, true) = true
    AND COALESCE(s.membership_fee_amount, 0) > 0
),
class_totals AS (
  SELECT pe.parent_id, pe.school_id, SUM(pe.total_paid)::bigint AS t
  FROM program_enrollments pe
  WHERE pe.status NOT IN ('cancelled', 'withdrawn', 'failed')
  GROUP BY pe.parent_id, pe.school_id
  HAVING SUM(pe.total_paid) > 17500
),
from_scheduled AS (
  SELECT DISTINCT sp.parent_id, sp.school_id FROM scheduled_payments sp
  WHERE sp.status = 'completed' AND sp.amount > 17500
),
from_payments AS (
  SELECT DISTINCT p.parent_id, p.school_id FROM payments p
  WHERE p.status = 'completed' AND p.amount > 17500 AND p.parent_id IS NOT NULL
),
candidates AS (
  SELECT DISTINCT x.parent_id, x.school_id
  FROM (
    SELECT parent_id, school_id FROM class_totals
    UNION SELECT parent_id, school_id FROM from_scheduled
    UNION SELECT parent_id, school_id FROM from_payments
  ) x
  INNER JOIN schools_req sr ON sr.id = x.school_id
)
UPDATE users u
SET member_id = 'ASA-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-'
    || upper(substring(replace(replace(encode(gen_random_bytes(6), 'hex'), '/', ''), '+', '') from 1 for 6)),
    updated_at = now()
FROM candidates c
WHERE u.id = c.parent_id
  AND (u.member_id IS NULL OR trim(u.member_id) = '');

-- If gen_random_bytes unavailable, use:
-- upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6))

COMMIT;
*/
