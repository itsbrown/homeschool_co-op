#!/usr/bin/env node
/**
 * Run a command with env vars from `.env.prod` (gitignored).
 * Use when Replit dev shell cannot reach production Postgres.
 *
 * Usage:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts --from-json docs/audit/heather-jacks-pi.json
 *   node scripts/with-prod-env.mjs node scripts/prod-query.mjs "SELECT COUNT(*) FROM users"
 *
 * `.env.prod` format (one KEY=VALUE per line, # comments ok):
 *   DATABASE_URL=postgresql://...
 *   STRIPE_SECRET_KEY=sk_live_...   # optional, for live Stripe scripts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envProdPath = path.join(repoRoot, '.env.prod');

function loadEnvProd() {
  if (!fs.existsSync(envProdPath)) {
    console.error(
      `Missing ${envProdPath}\n` +
        `Copy Deployment DATABASE_URL from Replit Secrets (Production tab) into:\n` +
        `  DATABASE_URL=postgresql://...\n`,
    );
    process.exit(2);
  }
  const out = {};
  for (const line of fs.readFileSync(envProdPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  if (!out.DATABASE_URL) {
    console.error(`${envProdPath} must contain DATABASE_URL=...`);
    process.exit(2);
  }
  return out;
}

const sep = process.argv.indexOf('--');
const childArgs = sep >= 0 ? process.argv.slice(sep + 1) : process.argv.slice(2);
if (childArgs.length === 0) {
  console.error('Usage: node scripts/with-prod-env.mjs -- <command> [args...]');
  process.exit(2);
}

const prodEnv = loadEnvProd();
const env = {
  ...process.env,
  ...prodEnv,
  NODE_ENV: 'production',
};

const result = spawnSync(childArgs[0], childArgs.slice(1), {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
