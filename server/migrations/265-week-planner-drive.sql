-- Week Planner Drive catalog: class + per-lesson folders, indexed files, optional block attachment.
-- Additive only. Do not db:push on prod.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE skeleton_blocks ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

CREATE TABLE IF NOT EXISTS curriculum_assets (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  web_view_link TEXT,
  band TEXT,
  unit TEXT,
  session_no INTEGER,
  title TEXT,
  objectives TEXT[],
  materials TEXT[],
  minutes INTEGER,
  subject TEXT,
  asset_kind TEXT NOT NULL DEFAULT 'lesson',
  drive_folder_id TEXT,
  content_hash TEXT,
  indexed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_assets_class_drive_file
  ON curriculum_assets (class_id, drive_file_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_assets_school_class
  ON curriculum_assets (school_id, class_id);

ALTER TABLE curriculum_assets ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE week_plan_blocks
  ADD COLUMN IF NOT EXISTS curriculum_asset_id INTEGER REFERENCES curriculum_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_week_plan_blocks_curriculum_asset
  ON week_plan_blocks (curriculum_asset_id)
  WHERE curriculum_asset_id IS NOT NULL;
