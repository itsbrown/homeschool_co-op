#!/usr/bin/env tsx
/**
 * Standalone, idempotent database initialization for post-merge / CI.
 *
 * Replaces the destructive `npm run db:push` (drizzle-kit push), which diffs
 * the schema, can prompt interactively, and has aborted with a ZodError during
 * introspection. This instead runs the app's own idempotent migration logic
 * (server/init-db.ts `initializeDatabase`) — the exact same path the server
 * runs on startup — which is safe to run repeatedly and never prompts.
 *
 * Loads DATABASE_URL from the environment, falling back to .env / .env.local
 * so it works both on Replit (Secrets) and locally.
 */
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
  console.log('init-db: DATABASE_URL not set; skipping (file-storage mode).');
  process.exit(0);
}

const { initializeDatabase } = await import('../server/init-db');
await initializeDatabase();
console.log('init-db: complete.');
process.exit(0);
