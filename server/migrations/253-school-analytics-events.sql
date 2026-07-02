-- School analytics: user activity + checkout funnel events (additive)

CREATE TABLE IF NOT EXISTS user_activity_events (
  id serial PRIMARY KEY,
  school_id integer REFERENCES schools(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  role text,
  event_type text NOT NULL CHECK (event_type IN (
    'login', 'page_view', 'session_start', 'session_end', 'heartbeat'
  )),
  path text,
  duration_ms integer,
  session_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_school_created
  ON user_activity_events (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_created
  ON user_activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_type
  ON user_activity_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS checkout_funnel_events (
  id serial PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  parent_id integer REFERENCES users(id) ON DELETE SET NULL,
  parent_email text,
  lane text NOT NULL CHECK (lane IN ('member_cart', 'public_store')),
  step text NOT NULL CHECK (step IN (
    'add_to_cart', 'view_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'abandon'
  )),
  enrollment_ids jsonb NOT NULL DEFAULT '[]',
  store_order_id integer REFERENCES store_orders(id) ON DELETE SET NULL,
  class_ids jsonb NOT NULL DEFAULT '[]',
  child_ids jsonb NOT NULL DEFAULT '[]',
  cart_value_cents integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_funnel_school_created
  ON checkout_funnel_events (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkout_funnel_correlation
  ON checkout_funnel_events (correlation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_checkout_funnel_parent_email
  ON checkout_funnel_events (parent_email, created_at DESC);
