-- Run once on production if Financial Reports summary returns 500 after deploy.
-- Safe to re-run (idempotent).

ALTER TABLE program_enrollments
  ADD COLUMN IF NOT EXISTS comp_amount_cents INTEGER NOT NULL DEFAULT 0;

-- effective_balance (optional; summary no longer requires this column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'program_enrollments' AND column_name = 'effective_balance'
  ) THEN
    ALTER TABLE program_enrollments
      ADD COLUMN effective_balance INTEGER
      GENERATED ALWAYS AS (
        GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0))
      ) STORED;
  END IF;
END $$;
