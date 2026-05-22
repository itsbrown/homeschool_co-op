#!/usr/bin/env node
/**
 * Print schools, registration codes, locations per school_id, and admin users.
 * Use when registration shows different locations than Location Management.
 *
 *   node scripts/diagnose-location-school-alignment.mjs [REGISTRATION_CODE]
 */
import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from '../server/lib/database-url.mjs';

const code = process.argv[2]?.trim();

const url = getNormalizedDatabaseUrl();
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, {
  prepare: false,
  max: 1,
  ssl: getPostgresJsSslOption(url),
});

try {
  const schools = await sql`
    SELECT id, name, admin_id, registration_code
    FROM schools
    ORDER BY id
  `;
  console.log('\n=== Schools ===');
  for (const s of schools) {
    console.log(
      `  id=${s.id} admin_id=${s.admin_id ?? 'null'} code=${s.registration_code ?? '(none)'} name=${s.name}`,
    );
  }

  const locations = await sql`
    SELECT id, school_id, name, code, is_active
    FROM locations
    ORDER BY school_id, id
  `;
  console.log('\n=== Locations (all rows) ===');
  for (const l of locations) {
    console.log(
      `  id=${l.id} school_id=${l.school_id} active=${l.is_active} ${l.name} (${l.code})`,
    );
  }

  const admins = await sql`
    SELECT u.id, u.email, u.school_id, u.role, s.id AS admin_school_id, s.name AS admin_school_name
    FROM users u
    LEFT JOIN schools s ON s.admin_id = u.id
    WHERE u.role IN ('schoolAdmin', 'director')
    ORDER BY u.id
  `;
  console.log('\n=== School admins ===');
  for (const a of admins) {
    const mismatch =
      a.admin_school_id != null && a.school_id != null && a.admin_school_id !== a.school_id;
    console.log(
      `  ${a.email} users.school_id=${a.school_id} schools.admin_id→${a.admin_school_id} (${a.admin_school_name ?? 'n/a'})${mismatch ? ' ⚠️ MISMATCH' : ''}`,
    );
  }

  if (code) {
    const rows = await sql`
      SELECT id, name, registration_code
      FROM schools
      WHERE LOWER(TRIM(registration_code)) = LOWER(TRIM(${code}))
      LIMIT 1
    `;
    console.log(`\n=== Registration code "${code}" ===`);
    if (rows.length === 0) {
      console.log('  (no school found)');
    } else {
      const school = rows[0];
      console.log(`  school id=${school.id} name=${school.name}`);
      const locs = locations.filter((l) => l.school_id === school.id && l.is_active);
      console.log(`  active locations for registration (${locs.length}):`);
      for (const l of locs) {
        console.log(`    - ${l.name} (id=${l.id})`);
      }
    }
  }

  console.log('\nTip: Brighton/Greece must share the same school_id as the registration code school.\n');
} finally {
  await sql.end();
}
