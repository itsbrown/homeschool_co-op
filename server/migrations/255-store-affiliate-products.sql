-- Amazon affiliate products on public store (additive)

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'owned',
  ADD COLUMN IF NOT EXISTS affiliate_url text,
  ADD COLUMN IF NOT EXISTS asin text,
  ADD COLUMN IF NOT EXISTS affiliate_metadata jsonb NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_products_product_kind_check'
  ) THEN
    ALTER TABLE store_products
      ADD CONSTRAINT store_products_product_kind_check
      CHECK (product_kind IN ('owned', 'affiliate'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_products_school_kind
  ON store_products (school_id, product_kind);
