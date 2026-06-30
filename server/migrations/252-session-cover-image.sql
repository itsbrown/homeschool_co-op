-- Store catalog images for enrollment-period sessions (classes already have cover_image).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cover_image text;
