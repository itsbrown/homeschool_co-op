#!/usr/bin/env node
/**
 * Post-merge / Replit: run idempotent init-db migrations without starting the server.
 * Replaces `npm run db:push` (blocked on shared DBs; drizzle-kit COALESCE index bug).
 *
 * Usage:
 *   node scripts/run-init-db.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  const parsed = parse(readFileSync(p, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

if (!process.env.DATABASE_URL) {
  console.error('run-init-db: DATABASE_URL is not set — skipping (file-storage mode).');
  process.exit(1);
}

execSync('npx tsx scripts/run-init-db.ts', {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
