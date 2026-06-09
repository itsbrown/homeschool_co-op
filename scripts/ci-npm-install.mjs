#!/usr/bin/env node
/**
 * Dependency install for GitHub Actions.
 * npm 10 on ubuntu-latest can log "Exit handler never called" and exit non-zero
 * while leaving node_modules mostly populated — verify packages, then fill gaps.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, NODE_ENV: 'development' };

const requiredBins = ['drizzle-kit', 'vite', 'playwright', 'tsx'];
const devPin = [
  'drizzle-kit@^0.30.4',
  'vite@^5.4.14',
  'tsx@^4.19.1',
  '@playwright/test@^1.60.0',
];

function run(cmd, { allowFail = false } = {}) {
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', env });
    return true;
  } catch {
    if (!allowFail) return false;
    return false;
  }
}

function missingBins() {
  return requiredBins.filter((name) => !existsSync(resolve(root, 'node_modules', '.bin', name)));
}

function ensureBins() {
  const missing = missingBins();
  if (missing.length === 0) return;

  console.warn(`[ci-npm-install] filling missing bins: ${missing.join(', ')}`);
  run(`npm install --no-audit --no-fund --save-dev ${devPin.join(' ')}`, { allowFail: true });

  const still = missingBins();
  if (still.length > 0) {
    throw new Error(`node_modules/.bin still missing: ${still.join(', ')}`);
  }
}

run('node scripts/normalize-lockfile-registry.mjs', { allowFail: true });
run('npm cache clean --force', { allowFail: true });

// Pin npm 9 — fewer "Exit handler never called" reports on large trees.
run('npm install -g npm@9.9.3', { allowFail: true });

if (!run('npm ci --no-audit --no-fund', { allowFail: true })) {
  console.warn('[ci-npm-install] npm ci failed — rm node_modules and npm install');
  run('rm -rf node_modules', { allowFail: true });
  run('npm install --no-audit --no-fund', { allowFail: true });
}

ensureBins();
console.log('[ci-npm-install] OK');
