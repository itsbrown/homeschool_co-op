#!/usr/bin/env node
/**
 * Load `.env` / `.env.local` then run `drizzle-kit push`.
 * drizzle.config.ts does not load dotenv itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Add it to .env or export it, then re-run:\n' +
      '  node scripts/db-push-with-env.mjs',
  );
  process.exit(1);
}

execSync('npx drizzle-kit push', { stdio: 'inherit', env: process.env, cwd: root });
