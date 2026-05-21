#!/usr/bin/env node
/**
 * Stabilization checklist runner (local dev).
 * 1) Verify F001 schema (if Postgres reachable)
 * 2) Fast unit/integration tests that mock DB
 * 3) Reminder for full suite + db:push
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  const parsed = parse(readFileSync(p, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: root, env: process.env, ...opts });
}

let failed = false;

console.log('=== ASA stabilization checks ===\n');

try {
  run('node scripts/verify-f001-schema.mjs');
} catch {
  console.warn(
    '\n⚠ Schema verify failed or DB unreachable. If F001 columns are missing, run:\n' +
      '   node scripts/db-push-with-env.mjs\n' +
      '   (requires DATABASE_URL in .env)\n',
  );
  failed = true;
}

try {
  run(
    'PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns=production-path --no-cache --forceExit',
  );
} catch {
  failed = true;
}

try {
  run(
    'npm run test:server -- --testPathPatterns="cart-checkout-enrollment-match|autopay-runtime-policy" --no-cache',
  );
} catch {
  failed = true;
}

console.log('\n=== Next (on your machine with Postgres) ===');
console.log('  export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/asa_test');
console.log('  export DATABASE_URL="$TEST_DATABASE_URL"');
console.log('  node scripts/db-push-with-env.mjs');
console.log(
  '  PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns=production-path',
);
console.log('  npm run test:server                 # full ~80 suites\n');

process.exit(failed ? 1 : 0);
