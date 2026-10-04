#!/bin/bash
set -e
npm install

# Task #242: Replace the legacy idx_user_roles_unique_user_role expression index
# (UNIQUE on COALESCE(school_id, 0)) with two partial UNIQUE indexes that
# drizzle-kit can introspect. The migration is idempotent (DROP
# INDEX IF EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS) so it is safe to run
# on every post-merge.
if [ -n "$DATABASE_URL" ]; then
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -f server/migrations/fix-user-roles-unique-index.sql
  else
    echo "post-merge: psql not found on PATH; skipping fix-user-roles-unique-index.sql." >&2
    echo "post-merge: install psql and re-run this script, or apply" >&2
    echo "post-merge: server/migrations/fix-user-roles-unique-index.sql manually." >&2
    echo "post-merge: do not schema-push production; use additive SQL in server/migrations/." >&2
  fi
fi

# Initialize the schema using the app's own idempotent migrations.
# Do not schema-push here. init-db is idempotent and never prompts;
# verify-core-schema then fails the post-merge if tables are missing.
if [ -n "$DATABASE_URL" ]; then
  npx tsx scripts/init-db.ts
  node scripts/verify-core-schema.mjs
  node scripts/verify-quarterly-schema.mjs
else
  echo "post-merge: DATABASE_URL not set; skipping init-db + schema verify." >&2
fi
