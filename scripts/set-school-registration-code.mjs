#!/usr/bin/env node
/**
 * Assign a specific registration code to a school (e.g. after dev restore).
 *
 *   node scripts/set-school-registration-code.mjs --school-id 1 --code X8BMC1JE
 *   CONFIRM_SET_SCHOOL_CODE=1 node scripts/set-school-registration-code.mjs --school-id 1 --code X8BMC1JE --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const args = process.argv.slice(2);
let schoolId = null;
let code = null;
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--school-id' && args[i + 1]) schoolId = Number(args[++i]);
  else if (args[i] === '--code' && args[i + 1]) code = args[++i].trim();
  else if (args[i] === '--apply') apply = true;
}

if (!schoolId || !code) {
  console.error('Usage: node scripts/set-school-registration-code.mjs --school-id <id> --code <CODE> [--apply]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  const [school] = await sql`SELECT id, name, registration_code FROM schools WHERE id = ${schoolId}`;
  if (!school) {
    console.error(`No school with id=${schoolId}`);
    process.exit(2);
  }

  const [collision] = await sql`
    SELECT id, name FROM schools
    WHERE LOWER(TRIM(registration_code)) = LOWER(TRIM(${code}))
      AND id <> ${schoolId}
    LIMIT 1
  `;
  if (collision) {
    console.error(`Code ${code} already used by school ${collision.id} (${collision.name})`);
    process.exit(3);
  }

  console.log(`School ${school.id} (${school.name})`);
  console.log(`  current code: ${school.registration_code ?? '(null)'}`);
  console.log(`  new code:     ${code}`);

  if (!apply) {
    console.log('Dry-run — pass --apply with CONFIRM_SET_SCHOOL_CODE=1 to write.');
    process.exit(0);
  }
  if (process.env.CONFIRM_SET_SCHOOL_CODE !== '1') {
    console.error('Set CONFIRM_SET_SCHOOL_CODE=1 to apply.');
    process.exit(1);
  }

  await sql`
    UPDATE schools
    SET registration_code = ${code}, updated_at = NOW()
    WHERE id = ${schoolId}
  `;
  console.log('✅ Updated.');
} finally {
  await sql.end({ timeout: 5 });
}
