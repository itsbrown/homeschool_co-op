#!/usr/bin/env node
/**
 * Reliable dependency install for GitHub Actions.
 * npm ci can hit "Exit handler never called" and leave node_modules without
 * devDependencies (drizzle-kit, vite, playwright). Fall back to npm install.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredBins = ['drizzle-kit', 'vite', 'playwright', 'tsx'];
const env = { ...process.env, NODE_ENV: 'development' };

function verify() {
  const missing = requiredBins.filter((name) => !existsSync(resolve(root, 'node_modules', '.bin', name)));
  if (missing.length > 0) {
    throw new Error(`node_modules/.bin missing: ${missing.join(', ')}`);
  }
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

try {
  run('npm cache clean --force');
} catch {
  /* best-effort */
}

const attempts = [
  'npm ci --no-audit --no-fund',
  'npm install --no-audit --no-fund',
];

let lastErr;
for (let i = 0; i < attempts.length; i++) {
  if (i > 0) {
    console.warn(`[ci-npm-install] retry ${i + 1}: ${attempts[i]}`);
    run('rm -rf node_modules');
  }
  try {
    run(attempts[i]);
    verify();
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.warn(`[ci-npm-install] ${attempts[i]} failed:`, err instanceof Error ? err.message : err);
  }
}

console.error('[ci-npm-install] All install attempts failed.');
if (lastErr) throw lastErr;
process.exit(1);
