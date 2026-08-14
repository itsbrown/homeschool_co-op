-- Family supply lists: structured items on classes and sessions (additive)

CREATE TABLE IF NOT EXISTS supply_items (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('class', 'session')),
  owner_id integer NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit text,
  scope text NOT NULL CHECK (scope IN ('student', 'class', 'family')),
  required boolean NOT NULL DEFAULT true,
  notes text,
  store_product_id integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_items_owner
  ON supply_items (school_id, owner_type, owner_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_supply_items_store_product
  ON supply_items (store_product_id)
  WHERE store_product_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_products'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supply_items_store_product_id_fkey'
  ) THEN
    ALTER TABLE supply_items
      ADD CONSTRAINT supply_items_store_product_id_fkey
      FOREIGN KEY (store_product_id) REFERENCES store_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS parent_supply_checks (
  parent_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supply_item_id integer NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
  checked_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, supply_item_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_supply_checks_item
  ON parent_supply_checks (supply_item_id);
