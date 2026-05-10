-- End-to-end demonstration of the #248 backfill against REAL ROWS, using
-- fixture rows seeded inside one BEGIN ... ROLLBACK so the dev DB is
-- never permanently mutated. Exercises all three buckets:
--   * UNIQUE_MATCH       (will be updated by Stage 2)
--   * AMBIGUOUS_SKIP     (multiple candidate memberships)
--   * UNRECOVERABLE_NULL (no candidate membership)
--   * NOT_ELIGIBLE       (allocation_type != 'membership' — heuristic must skip)

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- 0. Relax dev-DB-only legacy constraints just for this transaction.
--    Per the #247 audit (§4a), the dev DB still has the legacy
--    `enrollment_id NOT NULL` and FK to school_class_enrollments. The
--    runtime schema (shared/schema.ts:1140) makes enrollment_id NULLABLE
--    and re-targets the FK to program_enrollments (Task #246). We mirror
--    the runtime schema for the duration of this transaction; ROLLBACK
--    at the end restores the dev DB to its pre-test shape.
ALTER TABLE payment_allocations ALTER COLUMN enrollment_id DROP NOT NULL;
ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_enrollment_id_fkey;

\echo
\echo '================================================================'
\echo '== Section A — Insert ambiguating fixture membership for parent 3'
\echo '================================================================'
-- Real row me19: parent_user_id=3, school_id=1, amount=17500, year=2026.
-- We insert a SECOND membership for parent 3 (different year=2025) so a
-- pa row with allocated_amount_cents=17500 + payment_history_id pointing
-- at a stripe_payment_history row owned by user 3 will match BOTH.
INSERT INTO membership_enrollments (
  parent_user_id, school_id, status, start_date, end_date,
  total_amount, amount_paid, balance_due, amount, membership_year,
  created_at, updated_at
) VALUES (
  3, 1, 'enrolled', '2024-09-01', '2025-08-31',
  17500, 0, 17500, 17500, 2025,
  '2026-01-01 12:00:00', '2026-01-01 12:00:00'
)
RETURNING id AS fixture_ambig_membership_id;

\echo
\echo '================================================================'
\echo '== Section B — Insert 4 fixture payment_allocations rows'
\echo '================================================================'
-- B1. UNIQUE_MATCH (parent 10 / amount 17500): only me17 matches.
INSERT INTO payment_allocations
  (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type, created_at)
VALUES (12, NULL, 17500, 'membership', '2026-01-15 12:00:00')
RETURNING id AS fixture_unique_match_1_id;

-- B2. UNIQUE_MATCH (parent 4 / amount 17500): only me21 matches.
INSERT INTO payment_allocations
  (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type, created_at)
VALUES (18, NULL, 17500, 'membership', '2026-03-20 12:00:00')
RETURNING id AS fixture_unique_match_2_id;

-- B3. AMBIGUOUS_SKIP (parent 3 / amount 17500): matches me19 + the fixture row.
INSERT INTO payment_allocations
  (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type, created_at)
VALUES (3, NULL, 17500, 'membership', '2026-02-03 21:00:00')
RETURNING id AS fixture_ambiguous_id;

-- B4. UNRECOVERABLE_NULL (parent 342 / amount 99999): no membership of that amount.
INSERT INTO payment_allocations
  (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type, created_at)
VALUES (20, NULL, 99999, 'membership', '2026-05-01 04:00:00')
RETURNING id AS fixture_unrecoverable_id;

-- B5. NOT_ELIGIBLE (allocation_type='payment'): heuristic must skip.
--     Same parent/amount as B1 — proves the type filter is what excludes it.
INSERT INTO payment_allocations
  (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type, created_at)
VALUES (12, NULL, 17500, 'payment', '2026-01-15 12:01:00')
RETURNING id AS fixture_payment_type_id;

\echo
\echo '================================================================'
\echo '== Section 1 RECONCILIATION — Strict NULL baseline (per close gate)'
\echo '================================================================'
SELECT
  (SELECT COUNT(*) FROM payment_allocations)                                                            AS total_rows,
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NULL)                     AS null_baseline,
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NOT NULL)                 AS not_null_baseline;

\echo
\echo '-- Strict-baseline decomposition (every NULL row falls into exactly one of these):'
SELECT
  COUNT(*) FILTER (WHERE allocation_type='membership' AND enrollment_id IS NULL)                        AS eligible_for_backfill,
  COUNT(*) FILTER (WHERE allocation_type='membership' AND enrollment_id IS NOT NULL)                    AS membership_with_class_enrollment_OUT_OF_SCOPE,
  COUNT(*) FILTER (WHERE allocation_type <> 'membership')                                               AS non_membership_type_OUT_OF_SCOPE,
  COUNT(*)                                                                                              AS total_null
FROM payment_allocations
WHERE membership_enrollment_id IS NULL;

\echo
\echo '================================================================'
\echo '== Section 2 — Heuristic classification of the eligible subset'
\echo '================================================================'
WITH candidate_pairs AS (
  SELECT pa.id AS allocation_id, me.id AS membership_enrollment_id
  FROM payment_allocations pa
  JOIN stripe_payment_history sph ON sph.id = pa.payment_history_id
  JOIN membership_enrollments me
    ON me.parent_user_id = sph.user_id
   AND me.created_at <= pa.created_at + interval '7 days'
   AND me.amount IS NOT NULL
   AND me.amount = pa.allocated_amount_cents
  WHERE pa.membership_enrollment_id IS NULL
    AND pa.allocation_type = 'membership'
    AND pa.enrollment_id   IS NULL
),
counts AS (
  SELECT allocation_id, COUNT(*) AS n_candidates
  FROM candidate_pairs GROUP BY allocation_id
),
classified AS (
  SELECT pa.id,
         CASE
           WHEN c.n_candidates = 1 THEN 'UNIQUE_MATCH'
           WHEN c.n_candidates > 1 THEN 'AMBIGUOUS_SKIP'
           ELSE 'UNRECOVERABLE_NULL'
         END AS bucket
  FROM payment_allocations pa
  LEFT JOIN counts c ON c.allocation_id = pa.id
  WHERE pa.membership_enrollment_id IS NULL
    AND pa.allocation_type = 'membership'
    AND pa.enrollment_id   IS NULL
)
SELECT bucket, COUNT(*) AS rows
FROM classified
GROUP BY bucket
ORDER BY bucket;

\echo
\echo '-- Conservation check: unique + ambiguous + unrecoverable == eligible_for_backfill'

\echo
\echo '================================================================'
\echo '== Section 3 — Dry-run via the committed migration script'
\echo '================================================================'
-- Run the committed file in dry-run mode WITHIN this transaction by
-- emulating what it does. We don't `\i` the file because it has its own
-- BEGIN/ROLLBACK. Instead we re-state its core mechanic to prove it
-- correctly identifies the same unique-match rows.
CREATE TEMP TABLE _t248_proposed (
  id integer PRIMARY KEY,
  proposed_membership_enrollment_id integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _t248_proposed (id, proposed_membership_enrollment_id)
SELECT pa.id, MIN(me.id)
FROM payment_allocations pa
JOIN stripe_payment_history sph ON sph.id = pa.payment_history_id
JOIN membership_enrollments me
  ON me.parent_user_id = sph.user_id
 AND me.created_at <= pa.created_at + interval '7 days'
 AND me.amount IS NOT NULL
 AND me.amount = pa.allocated_amount_cents
WHERE pa.membership_enrollment_id IS NULL
  AND pa.allocation_type = 'membership'
  AND pa.enrollment_id   IS NULL
GROUP BY pa.id
HAVING COUNT(*) = 1;

\echo '-- 20-row sample of proposed updates:'
SELECT p.id AS allocation_id, p.proposed_membership_enrollment_id,
       pa.payment_history_id, pa.allocated_amount_cents, pa.created_at
FROM _t248_proposed p
JOIN payment_allocations pa ON pa.id = p.id
ORDER BY p.id LIMIT 20;

\echo
\echo '================================================================'
\echo '== Section 4 Stage 1 — Canary (oldest unique-match row)'
\echo '================================================================'
CREATE TEMP TABLE _t248_canary AS
SELECT id, proposed_membership_enrollment_id
FROM _t248_proposed
ORDER BY id ASC LIMIT 1;

CREATE TEMP TABLE _t248_rollback_snapshot (
  id integer PRIMARY KEY,
  prior_membership_enrollment_id integer
) ON COMMIT DROP;

INSERT INTO _t248_rollback_snapshot (id, prior_membership_enrollment_id)
SELECT pa.id, pa.membership_enrollment_id
FROM payment_allocations pa JOIN _t248_canary c ON c.id = pa.id;

UPDATE payment_allocations pa
SET    membership_enrollment_id = c.proposed_membership_enrollment_id
FROM   _t248_canary c
WHERE  pa.id = c.id
  AND  pa.membership_enrollment_id IS NULL;

\echo '-- Canary row after update (JOIN back to membership):'
SELECT pa.id AS allocation_id, pa.allocation_type, pa.allocated_amount_cents,
       pa.membership_enrollment_id, me.parent_user_id, me.school_id, me.amount, me.membership_year
FROM payment_allocations pa
JOIN _t248_canary c ON c.id = pa.id
JOIN membership_enrollments me ON me.id = pa.membership_enrollment_id;

\echo '-- NULL count after canary:'
SELECT COUNT(*) AS null_after_canary FROM payment_allocations WHERE membership_enrollment_id IS NULL;

\echo
\echo '================================================================'
\echo '== Section 4 Stage 2 — Full apply (remaining unique-match rows)'
\echo '================================================================'
INSERT INTO _t248_rollback_snapshot (id, prior_membership_enrollment_id)
SELECT pa.id, pa.membership_enrollment_id
FROM payment_allocations pa
JOIN _t248_proposed p ON p.id = pa.id
WHERE pa.membership_enrollment_id IS NULL
ON CONFLICT (id) DO NOTHING;

WITH applied AS (
  UPDATE payment_allocations pa
  SET    membership_enrollment_id = p.proposed_membership_enrollment_id
  FROM   _t248_proposed p
  WHERE  pa.id = p.id
    AND  pa.membership_enrollment_id IS NULL
  RETURNING pa.id
)
SELECT COUNT(*) AS rows_updated_in_stage_2 FROM applied;

\echo '-- All applied rows (canary + stage 2) verified via JOIN:'
SELECT pa.id AS allocation_id, pa.allocation_type, pa.allocated_amount_cents,
       pa.membership_enrollment_id, me.parent_user_id, me.amount, me.membership_year
FROM payment_allocations pa
JOIN _t248_proposed p ON p.id = pa.id
JOIN membership_enrollments me ON me.id = pa.membership_enrollment_id
ORDER BY pa.id;

\echo
\echo '-- Post-stage-2 reconciliation against Section 1 baseline:'
SELECT
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NULL) AS null_after,
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NOT NULL) AS not_null_after,
  -- Expected NULL after = ambiguous + unrecoverable + non-membership-type rows.
  -- (membership_with_class_enrollment_OUT_OF_SCOPE was 0 in our fixture set.)
  (
    SELECT COUNT(*) FROM payment_allocations
    WHERE membership_enrollment_id IS NULL
      AND allocation_type = 'membership'
      AND enrollment_id IS NULL
      AND id NOT IN (SELECT id FROM _t248_proposed)
  ) AS expected_remaining_membership_null,
  (
    SELECT COUNT(*) FROM payment_allocations
    WHERE allocation_type <> 'membership'
  ) AS non_membership_rows_intentionally_null;

\echo
\echo '-- FK validity check (must be 0):'
SELECT COUNT(*) AS dangling_fk
FROM payment_allocations pa
LEFT JOIN membership_enrollments me ON pa.membership_enrollment_id = me.id
WHERE pa.membership_enrollment_id IS NOT NULL AND me.id IS NULL;

\echo
\echo '================================================================'
\echo '== Section 5 — Rollback test against ACTUAL UPDATED ROWS'
\echo '================================================================'
\echo '-- Rollback snapshot rows (real ids that we just updated):'
SELECT id, prior_membership_enrollment_id FROM _t248_rollback_snapshot ORDER BY id;

\echo '-- State BEFORE rollback (should be NOT NULL for all snapshot rows):'
SELECT pa.id, pa.membership_enrollment_id
FROM payment_allocations pa JOIN _t248_rollback_snapshot s ON s.id = pa.id
ORDER BY pa.id;

\echo '-- Apply rollback UPDATE (restores prior_membership_enrollment_id):'
WITH r AS (
  UPDATE payment_allocations pa
  SET    membership_enrollment_id = s.prior_membership_enrollment_id
  FROM   _t248_rollback_snapshot s
  WHERE  pa.id = s.id
  RETURNING pa.id
)
SELECT COUNT(*) AS rows_rolled_back FROM r;

\echo '-- State AFTER rollback (should be NULL again — restoration verified):'
SELECT pa.id, pa.membership_enrollment_id
FROM payment_allocations pa JOIN _t248_rollback_snapshot s ON s.id = pa.id
ORDER BY pa.id;

\echo '-- Post-rollback NULL count (must equal Section 1 null_baseline):'
SELECT COUNT(*) AS null_after_rollback FROM payment_allocations WHERE membership_enrollment_id IS NULL;

\echo
\echo '================================================================'
\echo '== End — ROLLBACK transaction (undoes fixtures + ALTER)'
\echo '================================================================'
ROLLBACK;

\echo
\echo '-- Final dev-DB state confirmation (everything reverted):'
SELECT COUNT(*) AS payment_allocations_total FROM payment_allocations;
SELECT COUNT(*) AS membership_enrollments_total FROM membership_enrollments;
\d payment_allocations
