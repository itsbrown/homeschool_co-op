#!/usr/bin/env node
/**
 * Check whether a registration code exists on schools (Neon DATABASE_URL).
 *   node scripts/diagnose-school-code.mjs X8BMC1JE
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const code = process.argv[2]?.trim();
if (!code) {
  console.error('Usage: node scripts/diagnose-school-code.mjs <CODE>');
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
  const schools = await sql`
    SELECT id, name, status, registration_code, admin_id
    FROM schools
    WHERE LOWER(TRIM(registration_code)) = LOWER(TRIM(${code}))
  `;

  if (schools.length === 0) {
    console.log(`❌ No school with registration_code matching: ${code}`);
    const all = await sql`
      SELECT id, name, registration_code, status
      FROM schools
      ORDER BY id
    `;
    console.log(`Schools in DB (${all.length}):`);
    for (const s of all) {
      console.log(
        `  id=${s.id} status=${s.status} code=${s.registration_code ?? '(null)'} name=${s.name}`,
      );
    }
    process.exit(2);
  }

  for (const s of schools) {
    console.log(`✅ Found: id=${s.id} name=${s.name} status=${s.status} code=${s.registration_code}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
