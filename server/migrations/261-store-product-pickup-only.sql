-- Pickup-only owned merch (e.g. Orthography notebooks sold at school)

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS pickup_only boolean NOT NULL DEFAULT false;
