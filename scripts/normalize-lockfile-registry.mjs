#!/usr/bin/env node
/**
 * Replit's package firewall rewrites lockfile "resolved" URLs to
 * package-firewall.replit.local — unreachable on GitHub Actions / local dev.
 * Rewrite to registry.npmjs.org before npm ci.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = resolve(import.meta.dirname, '..', 'package-lock.json');
const text = readFileSync(lockPath, 'utf8');
const fixed = text.replaceAll(
  'http://package-firewall.replit.local/npm/',
  'https://registry.npmjs.org/',
);

if (fixed === text) {
  process.exit(0);
}

writeFileSync(lockPath, fixed, 'utf8');
console.log('[normalize-lockfile-registry] Rewrote Replit firewall URLs → registry.npmjs.org');
