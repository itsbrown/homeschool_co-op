ALTER TABLE weekly_skeletons
  ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES school_classes(id);
