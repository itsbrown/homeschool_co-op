#!/usr/bin/env node
/**
 * Reliable npm ci for GitHub Actions (guards against "Exit handler never called"
 * leaving a partial node_modules without devDependencies like drizzle-kit / vite).
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredBins = ['drizzle-kit', 'vite', 'playwright', 'tsx'];

function runCi() {
  execSync('npm ci', { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } });
}

function verify() {
  const missing = requiredBins.filter((name) => !existsSync(resolve(root, 'node_modules', '.bin', name)));
  if (missing.length > 0) {
    throw new Error(`node_modules/.bin missing after npm ci: ${missing.join(', ')}`);
  }
}

try {
  runCi();
  verify();
} catch (first) {
  console.warn('[ci-npm-install] npm ci failed or incomplete — retrying after rm node_modules');
  execSync('rm -rf node_modules', { cwd: root, stdio: 'inherit' });
  runCi();
  verify();
}
