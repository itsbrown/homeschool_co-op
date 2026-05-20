#!/usr/bin/env node
/**
 * Verify F001 Phase 1 columns/tables exist (read-only).
 * Loads `.env` / `.env.local` like db-push-with-env.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const url =
  process.env.DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgresql://test:test@localhost:5432/asa_test';

const checks = [
  {
    label: 'schools.session_mode_enabled',
    sql: `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'session_mode_enabled'`,
  },
  {
    label: 'program_enrollments.session_id',
    sql: `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'program_enrollments' AND column_name = 'session_id'`,
  },
  {
    label: 'family_payment_plans table',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'family_payment_plans'`,
  },
  {
    label: 'enrollment_price_history table',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'enrollment_price_history'`,
  },
];

const sql = postgres(url, { prepare: false, max: 1 });
let ok = true;
try {
  await sql`SELECT 1`;
  console.log('Connected to database.');
  for (const c of checks) {
    const rows = await sql.unsafe(c.sql);
    const pass = rows.length > 0;
    console.log(`${pass ? '✓' : '✗'} ${c.label}`);
    if (!pass) ok = false;
  }
} catch (err) {
  const e = err;
  const detail =
    e && typeof e === 'object'
      ? [e.code, e.message, e.address, e.port].filter(Boolean).join(' ')
      : String(err);
  console.error(
    'Database check failed:',
    detail || '(no detail — is Postgres running? set TEST_DATABASE_URL or DATABASE_URL in .env)',
  );
  ok = false;
} finally {
  await sql.end({ timeout: 2 });
}
process.exit(ok ? 0 : 1);
