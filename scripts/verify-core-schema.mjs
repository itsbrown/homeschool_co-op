#!/usr/bin/env node
/**
 * Verify core app tables exist in Postgres (read-only).
 * Fails CI if db:push did not create the schema production-path tests need.
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

const requiredTables = ['users', 'schools', 'locations', 'user_roles', 'children'];

const sql = postgres(url, { prepare: false, max: 1 });
let ok = true;

try {
  await sql`SELECT 1`;
  console.log('Connected to database.');

  for (const table of requiredTables) {
    const rows = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    const pass = rows.length > 0;
    console.log(`${pass ? '✓' : '✗'} public.${table}`);
    if (!pass) ok = false;
  }

  if (!ok) {
    console.error(
      '\nCore schema missing. On asa_test run: npx drizzle-kit push --force\n' +
        '  (or npm run db:push -- --force with DATABASE_URL pointing at asa_test only)',
    );
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
