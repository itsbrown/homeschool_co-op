-- Migration: Add multi-role support
-- Date: 2025-11-20
-- Description: Adds user_roles table for multi-role assignments and active_role column to users table

-- Step 1: Add active_role column to users table (nullable, defaults to NULL which means use primary role)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS active_role TEXT;

-- Step 2: Create user_roles table for multi-role assignments
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role NOT NULL, -- Uses existing role enum
  school_id INTEGER, -- For tenant scoping - educators/admins must be tied to a school
  is_primary BOOLEAN NOT NULL DEFAULT FALSE, -- Which role is the user's primary/default role
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON user_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON user_roles(user_id, role);

-- Step 4: Add unique constraint to prevent duplicate role assignments for same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_user_role ON user_roles(user_id, role, COALESCE(school_id, 0));

COMMENT ON TABLE user_roles IS 'Stores multiple role assignments for users (e.g., someone can be both parent AND educator)';
COMMENT ON COLUMN user_roles.school_id IS 'Required for educator/admin roles to enforce tenant isolation. NULL for roles like parent.';
COMMENT ON COLUMN user_roles.is_primary IS 'Indicates the users primary/default role. Only one role per user should have is_primary=true.';
COMMENT ON COLUMN users.active_role IS 'Currently active role for multi-role users. NULL means use the primary role from user_roles table.';
