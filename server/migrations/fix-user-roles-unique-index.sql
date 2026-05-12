-- Migration: Fix user_roles unique index for drizzle-kit compatibility
-- Date: 2026-05-12
-- Task: #242
--
-- Replaces idx_user_roles_unique_user_role (UNIQUE on user_id, role, COALESCE(school_id, 0))
-- with two partial UNIQUE indexes that drizzle-kit can introspect (no expression columns).
--
-- Original semantic: a user cannot hold the same role twice in the same school context,
-- and NULL school_id is treated as duplicate of NULL school_id (because COALESCE(NULL, 0)
-- collapses NULLs to 0). The two partial indexes preserve this exactly:
--   * (user_id, role, school_id) WHERE school_id IS NOT NULL  -- per-school uniqueness
--   * (user_id, role)              WHERE school_id IS NULL    -- one global-NULL row per user/role
--
-- Edge case difference from the legacy index: a row with school_id = 0 and a row with
-- school_id = NULL were treated as duplicates by the COALESCE expression. Under the new
-- partial indexes they are NOT duplicates. school_id=0 is not a valid school PK in this
-- schema (serial starts at 1), so this case does not occur in practice.

BEGIN;

DROP INDEX IF EXISTS idx_user_roles_unique_user_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_user_role_school
  ON user_roles (user_id, role, school_id)
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_user_role_no_school
  ON user_roles (user_id, role)
  WHERE school_id IS NULL;

COMMIT;
