#!/usr/bin/env node
/**
 * Verify permissions schema columns/tables exist (read-only).
 * If missing: apply server/migrations/permissions-scoping.sql via SQL tool (never db:push on shared/prod).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  const parsed = parse(readFileSync(p, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const url =
  process.env.DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgresql://test:test@localhost:5432/asa_test';

const sql = postgres(url, { prepare: false, max: 1 });
let ok = true;

async function hasColumn(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
  `;
  return rows.length > 0;
}

async function hasTable(table) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

try {
  await sql`SELECT 1`;
  console.log('Connected to database.');

  const locationCols = [
    'can_view_reports',
    'can_manage_staff',
    'can_manage_classes',
    'can_manage_students',
    'can_send_notifications',
    'can_view_parent_contacts',
  ];

  const ulExists = await hasTable('user_locations');
  console.log(`${ulExists ? '✓' : '✗'} public.user_locations`);
  if (!ulExists) ok = false;

  if (ulExists) {
    for (const col of locationCols) {
      const pass = await hasColumn('user_locations', col);
      console.log(`${pass ? '✓' : '✗'} user_locations.${col}`);
      if (!pass) ok = false;
    }
  }

  const uspExists = await hasTable('user_school_permissions');
  console.log(`${uspExists ? '✓' : '✗'} public.user_school_permissions`);
  if (!uspExists) ok = false;

  if (uspExists) {
    for (const col of locationCols) {
      const pass = await hasColumn('user_school_permissions', col);
      console.log(`${pass ? '✓' : '✗'} user_school_permissions.${col}`);
      if (!pass) ok = false;
    }
  }

  if (!ok) {
    console.error(
      '\nPermissions schema incomplete. Apply additive SQL (do NOT use db:push on shared/prod):\n' +
        '  server/migrations/permissions-scoping.sql\n' +
        '  e.g. psql "$DATABASE_URL" -f server/migrations/permissions-scoping.sql\n',
    );
  } else {
    console.log('\nPermissions schema OK.');
  }
} catch (err) {
  const e = err;
  const detail =
    e && typeof e === 'object'
      ? [e.code, e.message].filter(Boolean).join(' ')
      : String(err);
  console.error('Database check failed:', detail || '(no detail)');
  ok = false;
} finally {
  await sql.end({ timeout: 2 });
}

process.exit(ok ? 0 : 1);
