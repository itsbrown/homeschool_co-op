#!/bin/bash
set -e
npm install

# Task #242: Replace the legacy idx_user_roles_unique_user_role expression index
# (UNIQUE on COALESCE(school_id, 0)) with two partial UNIQUE indexes that
# drizzle-kit can introspect. Without this, `npm run db:push` aborts with a
# ZodError during schema introspection. The migration is idempotent (DROP
# INDEX IF EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS) so it is safe to run
# on every post-merge.
if [ -n "$DATABASE_URL" ]; then
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -f server/migrations/fix-user-roles-unique-index.sql
  else
    echo "post-merge: psql not found on PATH; skipping fix-user-roles-unique-index.sql." >&2
    echo "post-merge: if 'npm run db:push' fails with a ZodError on" >&2
    echo "post-merge: idx_user_roles_unique_user_role, install psql and re-run this script," >&2
    echo "post-merge: or apply server/migrations/fix-user-roles-unique-index.sql manually." >&2
  fi
fi

# Idempotent schema via init-db (never db:push on shared/prod DBs).
node scripts/run-init-db.mjs

node scripts/post-merge-replit-check.mjs
