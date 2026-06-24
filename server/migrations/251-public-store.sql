-- Public storefront (v1) — additive only

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS store_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_store_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_store_settings jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS store_products (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  image_url text,
  inventory_qty integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_listings (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('product', 'session', 'class')),
  source_id integer NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  members_only boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (school_id, listing_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_store_listings_school_published
  ON store_listings (school_id, is_published, sort_order);

CREATE TABLE IF NOT EXISTS store_orders (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id integer REFERENCES users(id),
  parent_email text NOT NULL,
  parent_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  total_cents integer NOT NULL DEFAULT 0,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  access_token text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_orders_access_token ON store_orders (access_token);

CREATE TABLE IF NOT EXISTS store_order_items (
  id serial PRIMARY KEY,
  store_order_id integer NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  listing_id integer REFERENCES store_listings(id),
  product_id integer REFERENCES store_products(id),
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL,
  line_total_cents integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_checkout_snapshots (
  id text PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  store_slug text NOT NULL,
  parent_email text,
  parent_name text,
  parent_phone text,
  parent_user_id integer REFERENCES users(id),
  payload jsonb NOT NULL,
  amount_due_cents integer NOT NULL DEFAULT 0,
  expires_at timestamp NOT NULL,
  fulfilled_at timestamp,
  stripe_checkout_session_id text,
  store_order_id integer REFERENCES store_orders(id),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_checkout_snapshots_expires
  ON store_checkout_snapshots (expires_at);

CREATE TABLE IF NOT EXISTS program_delivery_documents (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('class', 'session')),
  source_id integer NOT NULL,
  school_document_id integer NOT NULL REFERENCES school_documents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (school_id, source_type, source_id, school_document_id)
);

CREATE INDEX IF NOT EXISTS idx_program_delivery_documents_source
  ON program_delivery_documents (school_id, source_type, source_id);
