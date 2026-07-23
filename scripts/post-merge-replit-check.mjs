#!/usr/bin/env node
/**
 * Post-merge Replit / dev DB check (read-only).
 * 1) Reminds you to confirm git SHA matches origin/main
 * 2) Runs verify-core-schema + verify-f001-schema against DATABASE_URL
 *
 * Usage on Replit (after git pull says "Already up to date"):
 *   node scripts/post-merge-replit-check.mjs
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expectedMergeHint = '27839229'; // PR #16 merge to main (May 2026)

console.log('--- Post-merge Replit check ---\n');

console.log('Git (run in shell if unsure):');
console.log('  git fetch origin');
console.log('  git rev-parse HEAD');
console.log('  git rev-parse origin/main');
console.log(`  Expect main at or after merge containing ${expectedMergeHint}`);
console.log('  If SHAs match but app feels old: Stop → Run the workflow (not just git pull).\n');

let gitOk = false;
try {
  const head = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  execSync('git fetch origin 2>/dev/null', { cwd: root, stdio: 'ignore' });
  const main = execSync('git rev-parse --short origin/main', { cwd: root, encoding: 'utf8' }).trim();
  console.log(`  This machine: HEAD=${head}  origin/main=${main}`);
  if (head === main) {
    console.log('  Git: HEAD matches origin/main.\n');
    gitOk = true;
  } else {
    console.log('  Git: HEAD differs from origin/main — run: git checkout main && git pull origin main\n');
  }
} catch {
  console.log('  (Could not run git commands here — run manually on Replit.)\n');
}

console.log('Schema verify (uses DATABASE_URL from .env / Secrets):\n');

function runScript(name) {
  try {
    execSync(`node scripts/${name}`, { cwd: root, stdio: 'inherit', env: process.env });
    return true;
  } catch {
    return false;
  }
}

const coreOk = runScript('verify-core-schema.mjs');
const f001Ok = runScript('verify-f001-schema.mjs');
const quarterlyOk = runScript('verify-quarterly-schema.mjs');
const permissionsOk = runScript('verify-permissions-schema.mjs');

console.log('\n--- Summary ---');
if (coreOk && f001Ok && quarterlyOk && permissionsOk) {
  console.log('Schema OK — no additive SQL required unless smoke tests still fail.');
  console.log('If locations/API errors: server/migrations/locations-schema-align.sql');
  console.log('If F001/session features missing: server/migrations/f001-phase1-schema.sql');
  console.log('If permissions columns missing: server/migrations/permissions-scoping.sql');
} else {
  if (!coreOk) {
    console.log('Core schema missing → run server/migrations/locations-schema-align.sql if locations broken');
    console.log('  (and ensure DATABASE_URL points at Postgres, not mem/file fallback)');
  }
  if (!f001Ok) {
    console.log('F001 schema missing → run server/migrations/f001-phase1-schema.sql only if you use session mode');
  }
  if (!quarterlyOk) {
    console.log('Quarterly report schema missing → run: npx tsx scripts/init-db.ts');
  }
  if (!permissionsOk) {
    console.log('Permissions schema missing → run server/migrations/permissions-scoping.sql (never db:push on shared/prod)');
  }
}

process.exit(coreOk && f001Ok && quarterlyOk && permissionsOk ? 0 : 1);
