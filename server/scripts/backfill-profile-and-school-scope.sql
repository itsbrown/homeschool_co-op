-- Backfill legacy user profile + school scope fields (additive, safe to re-run).
-- Run against Replit dev or production Postgres after deploying code fixes.
-- Review each section's row counts before COMMIT; use a transaction in psql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Split users.name into first_name / last_name when empty
-- ---------------------------------------------------------------------------
UPDATE users
SET
  first_name = split_part(trim(name), ' ', 1),
  last_name = nullif(
    trim(substring(trim(name) from position(' ' in trim(name)) + 1)),
    ''
  ),
  updated_at = NOW()
WHERE (first_name IS NULL OR trim(first_name) = '')
  AND (last_name IS NULL OR trim(last_name) = '')
  AND name IS NOT NULL
  AND trim(name) <> ''
  AND position(' ' in trim(name)) > 0;

-- Single-token names: use same value for first and last
UPDATE users
SET
  first_name = trim(name),
  last_name = trim(name),
  updated_at = NOW()
WHERE (first_name IS NULL OR trim(first_name) = '')
  AND (last_name IS NULL OR trim(last_name) = '')
  AND name IS NOT NULL
  AND trim(name) <> ''
  AND position(' ' in trim(name)) = 0;

-- ---------------------------------------------------------------------------
-- 2) Align school admins: users.school_id + primary user_roles.school_id
--    to schools.admin_id (canonical tenant for that admin)
-- ---------------------------------------------------------------------------
UPDATE users u
SET school_id = s.id, updated_at = NOW()
FROM schools s
WHERE s.admin_id = u.id
  AND u.role IN ('schoolAdmin', 'director')
  AND (u.school_id IS NULL OR u.school_id <> s.id);

UPDATE user_roles ur
SET school_id = s.id
FROM schools s
JOIN users u ON u.id = s.admin_id
WHERE ur.user_id = u.id
  AND ur.is_primary = true
  AND ur.role IN ('schoolAdmin', 'director')
  AND (ur.school_id IS NULL OR ur.school_id <> s.id);

-- ---------------------------------------------------------------------------
-- 3) Parents: set users.school_id from membership at their school
-- ---------------------------------------------------------------------------
UPDATE users u
SET school_id = me.school_id, updated_at = NOW()
FROM (
  SELECT DISTINCT ON (parent_user_id) parent_user_id, school_id
  FROM membership_enrollments
  WHERE school_id IS NOT NULL
  ORDER BY parent_user_id, id DESC
) me
WHERE u.id = me.parent_user_id
  AND u.role = 'parent'
  AND (u.school_id IS NULL OR u.school_id <> me.school_id);

-- ---------------------------------------------------------------------------
-- 4) Parents: school_id from children when still missing
-- ---------------------------------------------------------------------------
UPDATE users u
SET school_id = c.school_id, updated_at = NOW()
FROM (
  SELECT parent_email, min(school_id) AS school_id
  FROM children
  WHERE school_id IS NOT NULL
    AND parent_email IS NOT NULL
    AND trim(parent_email) <> ''
  GROUP BY parent_email
) c
WHERE lower(trim(u.email)) = lower(trim(c.parent_email))
  AND u.role = 'parent'
  AND (u.school_id IS NULL OR u.school_id <> c.school_id);

-- ---------------------------------------------------------------------------
-- 5) Children: copy parent users.school_id when child.school_id is null
-- ---------------------------------------------------------------------------
UPDATE children c
SET school_id = u.school_id, updated_at = NOW()
FROM users u
WHERE (
    c.parent_id = u.id
    OR lower(trim(c.parent_email)) = lower(trim(u.email))
  )
  AND c.school_id IS NULL
  AND u.school_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) Parent user_roles.school_id (legacy multi-role rows)
-- ---------------------------------------------------------------------------
UPDATE user_roles ur
SET school_id = u.school_id
FROM users u
WHERE ur.user_id = u.id
  AND ur.role = 'parent'
  AND u.school_id IS NOT NULL
  AND (ur.school_id IS NULL OR ur.school_id <> u.school_id);

COMMIT;

-- Spot-check (run after COMMIT):
-- SELECT id, email, name, first_name, last_name, school_id, role FROM users WHERE email IN ('jocimarie@gmail.com', '<admin-email>');
-- SELECT * FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = '<admin-email>');
