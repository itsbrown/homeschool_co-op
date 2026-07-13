-- Permissions scoping (safe to re-run). Do NOT use db:push on prod/shared DBs.
-- Aligns user_locations + user_school_permissions with shared/schema.ts

-- Location-scoped staff grants
ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_view_parent_contacts boolean NOT NULL DEFAULT false;

ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_view_reports boolean NOT NULL DEFAULT false;

ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_manage_staff boolean NOT NULL DEFAULT false;

ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_manage_classes boolean NOT NULL DEFAULT false;

ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_manage_students boolean NOT NULL DEFAULT false;

ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS can_send_notifications boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_locations_user_active
  ON user_locations (user_id)
  WHERE is_active = true;

-- School-wide staff grants (regional manager / entire-school access)
CREATE TABLE IF NOT EXISTS user_school_permissions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  school_id integer NOT NULL REFERENCES schools(id),
  access_level text NOT NULL DEFAULT 'view',
  can_view_reports boolean NOT NULL DEFAULT false,
  can_manage_staff boolean NOT NULL DEFAULT false,
  can_manage_classes boolean NOT NULL DEFAULT false,
  can_manage_students boolean NOT NULL DEFAULT false,
  can_send_notifications boolean NOT NULL DEFAULT false,
  can_view_parent_contacts boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_view_parent_contacts boolean NOT NULL DEFAULT false;

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_view_reports boolean NOT NULL DEFAULT false;

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_manage_staff boolean NOT NULL DEFAULT false;

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_manage_classes boolean NOT NULL DEFAULT false;

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_manage_students boolean NOT NULL DEFAULT false;

ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_send_notifications boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_school_permissions_user_school_unique'
  ) THEN
    ALTER TABLE user_school_permissions
      ADD CONSTRAINT user_school_permissions_user_school_unique UNIQUE (user_id, school_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_school_permissions_user_school
  ON user_school_permissions (user_id, school_id)
  WHERE is_active = true;
