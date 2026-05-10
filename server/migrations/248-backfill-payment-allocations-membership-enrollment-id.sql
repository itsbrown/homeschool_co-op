-- Task #248 — Backfill payment_allocations.membership_enrollment_id
--
-- Background:
--   Task #247 added the column. Every payment_allocations row created
--   BEFORE #247 has membership_enrollment_id = NULL, INCLUDING rows whose
--   allocation_type='membership' which were unambiguously paying for a
--   membership. This migration retroactively populates the column on the
--   subset of rows where the linkage can be reconstructed with confidence.
--
-- Heuristic (UNIQUE-MATCH ONLY — see audit report §2 for full analysis):
--
--   A historical row is eligible for backfill iff ALL hold:
--     (a) pa.membership_enrollment_id IS NULL
--     (b) pa.allocation_type = 'membership'   -- never touch 'payment' rows
--     (c) pa.enrollment_id IS NULL            -- membership-only allocations set this NULL
--     (d) Exactly ONE row in membership_enrollments matches:
--           me.parent_user_id = sph.user_id
--             (joined via pa.payment_history_id -> stripe_payment_history.id)
--           AND me.created_at <= pa.created_at + interval '7 days'
--             (membership row must exist at or near allocation time;
--              7-day forward tolerance covers webhook lag where
--              the allocation insert raced ahead of the membership update)
--           AND me.amount IS NOT NULL
--           AND me.amount = pa.allocated_amount_cents
--             (exact amount match — no fuzzy tolerance for money)
--
--   Multiple-candidate rows are SKIPPED (AMBIGUOUS_SKIP).
--   Zero-candidate rows are LEFT NULL (UNRECOVERABLE_NULL).
--
-- This file is idempotent: re-running it will not re-update already-set rows
-- because the WHERE clause filters on `membership_enrollment_id IS NULL`.
--
-- USAGE:
--   Dry run (default — wrapped in BEGIN/ROLLBACK; prints proposed counts):
--     psql "$DATABASE_URL" -v dry_run=1 \
--       -f server/migrations/248-backfill-payment-allocations-membership-enrollment-id.sql
--
--   Live run (commits):
--     psql "$DATABASE_URL" -v dry_run=0 \
--       -f server/migrations/248-backfill-payment-allocations-membership-enrollment-id.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1. Snapshot table for rollback (one row per allocation we're about to touch).
--    Survives only inside this transaction; for a live run we re-create it as
--    a real table outside the BEGIN/COMMIT (see prod runbook in audit report).
CREATE TEMP TABLE _t248_snapshot (
  id integer PRIMARY KEY,
  prior_membership_enrollment_id integer,
  proposed_membership_enrollment_id integer NOT NULL
) ON COMMIT DROP;

-- 2. Build the candidate set with bucket classification.
WITH candidate_pairs AS (
  SELECT
    pa.id            AS allocation_id,
    pa.created_at    AS allocation_created_at,
    pa.allocated_amount_cents,
    sph.user_id      AS parent_user_id,
    me.id            AS membership_enrollment_id
  FROM payment_allocations pa
  JOIN stripe_payment_history sph ON sph.id = pa.payment_history_id
  JOIN membership_enrollments me
    ON me.parent_user_id = sph.user_id
   AND me.created_at <= pa.created_at + interval '7 days'
   AND me.amount IS NOT NULL
   AND me.amount = pa.allocated_amount_cents
  WHERE pa.membership_enrollment_id IS NULL
    AND pa.allocation_type = 'membership'
    AND pa.enrollment_id IS NULL
),
counts AS (
  SELECT allocation_id, COUNT(*) AS n_candidates,
         MIN(membership_enrollment_id) AS only_candidate_id
  FROM candidate_pairs
  GROUP BY allocation_id
)
INSERT INTO _t248_snapshot (id, prior_membership_enrollment_id, proposed_membership_enrollment_id)
SELECT c.allocation_id, NULL, c.only_candidate_id
FROM counts c
WHERE c.n_candidates = 1;

-- 3. Print classification breakdown (always, dry-run or live).
\echo
\echo '=== Backfill classification (current transaction) ==='
SELECT
  (SELECT COUNT(*) FROM payment_allocations
     WHERE membership_enrollment_id IS NULL
       AND allocation_type = 'membership'
       AND enrollment_id IS NULL)                                  AS eligible_null_rows,
  (SELECT COUNT(*) FROM _t248_snapshot)                            AS unique_match_will_update,
  (
    SELECT COUNT(*) FROM (
      SELECT pa.id
      FROM payment_allocations pa
      JOIN stripe_payment_history sph ON sph.id = pa.payment_history_id
      JOIN membership_enrollments me
        ON me.parent_user_id = sph.user_id
       AND me.created_at <= pa.created_at + interval '7 days'
       AND me.amount IS NOT NULL
       AND me.amount = pa.allocated_amount_cents
      WHERE pa.membership_enrollment_id IS NULL
        AND pa.allocation_type = 'membership'
        AND pa.enrollment_id IS NULL
      GROUP BY pa.id
      HAVING COUNT(*) > 1
    ) ambig
  )                                                                AS ambiguous_skip,
  (
    -- unrecoverable = (eligible) - (unique-match) - (ambiguous)
    (SELECT COUNT(*) FROM payment_allocations
       WHERE membership_enrollment_id IS NULL
         AND allocation_type = 'membership'
         AND enrollment_id IS NULL)
    - (SELECT COUNT(*) FROM _t248_snapshot)
    - (
      SELECT COUNT(*) FROM (
        SELECT pa.id
        FROM payment_allocations pa
        JOIN stripe_payment_history sph ON sph.id = pa.payment_history_id
        JOIN membership_enrollments me
          ON me.parent_user_id = sph.user_id
         AND me.created_at <= pa.created_at + interval '7 days'
         AND me.amount IS NOT NULL
         AND me.amount = pa.allocated_amount_cents
        WHERE pa.membership_enrollment_id IS NULL
          AND pa.allocation_type = 'membership'
          AND pa.enrollment_id IS NULL
        GROUP BY pa.id
        HAVING COUNT(*) > 1
      ) ambig2
    )
  )                                                                AS unrecoverable_null;

\echo
\echo '=== Sample of proposed updates (up to 20) ==='
SELECT id AS allocation_id,
       prior_membership_enrollment_id,
       proposed_membership_enrollment_id
FROM _t248_snapshot
ORDER BY id
LIMIT 20;

-- 4. Apply UPDATE.
UPDATE payment_allocations pa
SET    membership_enrollment_id = s.proposed_membership_enrollment_id
FROM   _t248_snapshot s
WHERE  pa.id = s.id
  AND  pa.membership_enrollment_id IS NULL;  -- defensive double-check

\echo
\echo '=== Post-update verification ==='
SELECT
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NULL) AS null_after,
  (SELECT COUNT(*) FROM payment_allocations WHERE membership_enrollment_id IS NOT NULL) AS not_null_after;

-- 5. FK validity check — must return 0.
\echo
\echo '=== FK validity check (must be 0) ==='
SELECT COUNT(*) AS dangling_fk_rows
FROM   payment_allocations pa
LEFT JOIN membership_enrollments me ON pa.membership_enrollment_id = me.id
WHERE  pa.membership_enrollment_id IS NOT NULL
  AND  me.id IS NULL;

-- 6. Commit or rollback based on :dry_run psql variable.
--    When :dry_run is unset or '1' we ROLLBACK so the changes are previewed
--    only. Set -v dry_run=0 from the command line to commit.
\if :{?dry_run}
  \if :dry_run
    \echo
    \echo '*** DRY RUN: rolling back ***'
    ROLLBACK;
  \else
    \echo
    \echo '*** LIVE RUN: committing ***'
    COMMIT;
  \endif
\else
  \echo
  \echo '*** dry_run not set — defaulting to ROLLBACK (safe) ***'
  ROLLBACK;
\endif
