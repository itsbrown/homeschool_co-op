#!/usr/bin/env node
/**
 * CI-only: bootstrap Postgres enums, then drizzle-kit push --force.
 * Fails the job if push errors (drizzle-kit may log errors without a non-zero exit).
 */
import { execSync } from 'node:child_process';
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

process.env.DATABASE_URL = url;

const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql`SELECT 1`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE role AS ENUM (
        'student', 'parent', 'learner', 'educator', 'teacher',
        'schoolAdmin', 'admin', 'superAdmin'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `;
  console.log('Bootstrap: role enum ready.');
} finally {
  await sql.end({ timeout: 2 });
}

try {
  execSync('npx drizzle-kit push --force', {
    stdio: 'inherit',
    env: process.env,
    cwd: root,
  });
} catch {
  console.error('drizzle-kit push failed.');
  process.exit(1);
}
