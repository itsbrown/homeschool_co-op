#!/usr/bin/env node
/**
 * Seed minimal schools rows after a dev DB truncate (so user school_id FKs resolve).
 *
 *   DATABASE_URL="..." node scripts/seed-dev-schools.mjs
 *   CONFIRM_SEED_DEV_SCHOOLS=1 DATABASE_URL="..." node scripts/seed-dev-schools.mjs --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
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

const DEV_SCHOOLS = [
  {
    id: 1,
    name: 'American Seekers Academy',
    type: 'school',
    email: 'contact@americanseekersacademy.com',
    city: 'New York',
    state: 'NY',
    zip_code: '10001',
  },
  {
    id: 2,
    name: 'Freedom Mobility NY',
    type: 'co-op',
    email: 'contact@freedommobilityny.com',
    city: 'New York',
    state: 'NY',
    zip_code: '10001',
  },
];

try {
  const existing = await sql`SELECT id, name FROM schools ORDER BY id`;
  console.log(`Schools in DB: ${existing.length ? existing.map((s) => `${s.id}:${s.name}`).join(', ') : '(none)'}`);

  const [admin] = await sql`
    SELECT id, email, role FROM users
    WHERE role IN ('superAdmin', 'admin', 'schoolAdmin')
    ORDER BY id
    LIMIT 1
  `;
  if (!admin) {
    console.error('❌ No admin/schoolAdmin user in DB — import users first, then re-run this script.');
    process.exit(2);
  }
  console.log(`Using admin_id=${admin.id} (${admin.email}, role=${admin.role})`);

  if (!apply) {
    console.log('Dry-run — would upsert schools:', DEV_SCHOOLS.map((s) => s.id).join(', '));
    console.log('Pass --apply with CONFIRM_SEED_DEV_SCHOOLS=1 to write.');
    process.exit(0);
  }
  if (process.env.CONFIRM_SEED_DEV_SCHOOLS !== '1') {
    console.error('Set CONFIRM_SEED_DEV_SCHOOLS=1 to apply.');
    process.exit(1);
  }

  for (const school of DEV_SCHOOLS) {
    await sql`
      INSERT INTO schools (
        id, name, type, admin_id, city, state, zip_code, email, status, is_verified
      ) VALUES (
        ${school.id},
        ${school.name},
        ${school.type},
        ${admin.id},
        ${school.city},
        ${school.state},
        ${school.zip_code},
        ${school.email},
        'active',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        admin_id = EXCLUDED.admin_id,
        email = EXCLUDED.email,
        status = 'active',
        updated_at = NOW()
    `;
  }

  await sql`SELECT setval(pg_get_serial_sequence('schools', 'id'), (SELECT COALESCE(MAX(id), 1) FROM schools))`;

  const after = await sql`SELECT id, name, email FROM schools ORDER BY id`;
  console.log('✅ Schools:', after.map((s) => `${s.id} ${s.name}`).join(' | '));
} finally {
  await sql.end({ timeout: 5 });
}
