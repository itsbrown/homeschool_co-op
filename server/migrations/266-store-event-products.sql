-- Event products: RSVP config (attendee prices, meals, when/where)

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS rsvp jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE store_products DROP CONSTRAINT IF EXISTS store_products_product_kind_check;

ALTER TABLE store_products
  ADD CONSTRAINT store_products_product_kind_check
  CHECK (product_kind IN ('owned', 'affiliate', 'event'));
