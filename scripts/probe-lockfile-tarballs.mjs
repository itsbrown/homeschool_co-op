#!/usr/bin/env node
/**
 * Probe every resolved tarball URL in package-lock.json (Replit firewall diagnostics).
 * Run on Replit after hard-sync to confirm overrides are minimal and complete.
 *
 * Usage: node scripts/probe-lockfile-tarballs.mjs
 */
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { resolve } from 'node:path';

const lockPath = resolve(import.meta.dirname, '..', 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const seen = new Set();
const pkgs = [];

for (const [pkgPath, pkg] of Object.entries(lock.packages ?? {})) {
  if (!pkg?.resolved || seen.has(pkg.resolved)) continue;
  seen.add(pkg.resolved);
  pkgs.push({
    name: pkgPath.replace(/^node_modules\//, '') || pkg.name || pkg.resolved,
    version: pkg.version,
    resolved: pkg.resolved,
  });
}

const probe = (url) =>
  new Promise((res) => {
    const req = https.get(url, { timeout: 15000 }, (r) => {
      r.resume();
      res(r.statusCode);
    });
    req.on('error', () => res('ERR'));
    req.on('timeout', () => {
      req.destroy();
      res('TIMEOUT');
    });
  });

const blocked = [];
for (const p of pkgs.sort((a, b) => a.name.localeCompare(b.name))) {
  const status = await probe(p.resolved);
  if (status !== 200) {
    blocked.push({ ...p, status });
    console.log(`BLOCKED ${status} ${p.name}@${p.version}`);
  }
}

console.log(`\n${blocked.length} blocked / ${pkgs.length} total tarballs`);
if (blocked.length > 0) {
  console.log(JSON.stringify(blocked, null, 2));
  process.exit(1);
}
