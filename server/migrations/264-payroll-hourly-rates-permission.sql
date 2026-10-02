ALTER TABLE user_school_permissions
  ADD COLUMN IF NOT EXISTS can_manage_hourly_rates boolean NOT NULL DEFAULT false;
