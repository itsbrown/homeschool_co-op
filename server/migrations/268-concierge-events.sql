-- Parent concierge analytics (additive).
-- Apply this file as SQL only, after server/migrations/267-platform-schools.sql
-- (PR #150, school onboarding). Never apply it with db:push or drizzle-kit push.
-- Keep the number 268 so it stays ordered after 267. Do not renumber.
-- Not user_activity_events: that check constraint only allows login, page_view,
-- session_start, session_end, and heartbeat, and those rows feed engagement
-- slices by child age and gender. Do not export this table to Brevo or marketing_links.
-- metadata must not contain child birthdate, medical text, allergies, or a marketing segment.

CREATE TABLE IF NOT EXISTS concierge_events (
  id serial PRIMARY KEY,
  school_id integer REFERENCES schools(id) ON DELETE SET NULL,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('concierge_turn', 'concierge_tool')),
  tool_name text,
  ok boolean,
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_events_user_created
  ON concierge_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_concierge_events_type_created
  ON concierge_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_concierge_events_school_created
  ON concierge_events (school_id, created_at DESC);
