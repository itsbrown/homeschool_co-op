-- Additive: checkout discount audit columns on stripe_payment_history
-- Used by Free After Threshold (and future sibling/promo) money-path snapshots.

ALTER TABLE stripe_payment_history
  ADD COLUMN IF NOT EXISTS subtotal_amount INTEGER,
  ADD COLUMN IF NOT EXISTS discount_total INTEGER,
  ADD COLUMN IF NOT EXISTS discount_snapshot JSONB;
