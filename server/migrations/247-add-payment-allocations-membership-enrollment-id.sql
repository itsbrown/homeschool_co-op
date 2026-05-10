-- Task #247 — Add payment_allocations.membership_enrollment_id
--
-- Background:
--   shared/schema.ts has declared `paymentAllocations.membershipEnrollmentId`
--   since commit 74503776 (2026-01-30), but the column was never added to
--   any database. PaymentReallocationService.ts inserts this column name
--   directly via raw SQL (server/services/PaymentReallocationService.ts
--   lines 541-573), so the missing column raises
--     ERROR: column "membership_enrollment_id" of relation
--            "payment_allocations" does not exist
--   on every reallocation attempt. See
--   docs/audit/247-missing-membership-enrollment-id-report.md.
--
-- This migration is online-safe for Postgres:
--   * ADD COLUMN is nullable with no default — no table rewrite, only a
--     brief catalog lock.
--   * ADD CONSTRAINT FOREIGN KEY validates against existing rows; with the
--     column NULL on every existing row, validation is a no-op.
--
-- Idempotent: safe to run multiple times.

BEGIN;

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS membership_enrollment_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_allocations_membership_enrollment_id_fkey'
  ) THEN
    ALTER TABLE payment_allocations
      ADD CONSTRAINT payment_allocations_membership_enrollment_id_fkey
      FOREIGN KEY (membership_enrollment_id)
      REFERENCES membership_enrollments(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

-- Rollback (run only if no application writes have populated the column):
--   BEGIN;
--   ALTER TABLE payment_allocations
--     DROP CONSTRAINT IF EXISTS payment_allocations_membership_enrollment_id_fkey;
--   ALTER TABLE payment_allocations
--     DROP COLUMN IF EXISTS membership_enrollment_id;
--   COMMIT;
