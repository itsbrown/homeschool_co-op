#!/usr/bin/env node
/**
 * Import app `users` rows from a platform CSV export (attached_assets/users_*.csv).
 * Use when Supabase auth export missed accounts (e.g. contact.americanseekersacademy@gmail.com).
 *
 *   node scripts/import-app-users-from-csv.mjs --csv attached_assets/users_1761901890907.csv
 *   CONFIRM_APP_USER_IMPORT=1 node scripts/import-app-users-from-csv.mjs --csv ... --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseDotenv } from 'dotenv';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const args = process.argv.slice(2);
let csvPath = '';
let apply = false;
let emailsOnly = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--csv' && args[i + 1]) csvPath = args[++i];
  else if (args[i] === '--apply') apply = true;
  else if (args[i] === '--email' && args[i + 1]) {
    emailsOnly = new Set(args[++i].split(',').map((e) => e.trim().toLowerCase()));
  }
}

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parseDotenv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!csvPath) {
  console.error('Usage: node scripts/import-app-users-from-csv.mjs --csv <path> [--email a@b.com] [--apply]');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const resolvedCsv = resolve(process.cwd(), csvPath);
if (!existsSync(resolvedCsv)) {
  console.error(`CSV not found: ${resolvedCsv}`);
  process.exit(1);
}

const raw = readFileSync(resolvedCsv, 'utf8');
const rows = parseCsv(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });

const sql = postgres(url, { max: 1 });
const placeholderPassword = await bcrypt.hash(`app-csv-import-${Date.now()}`, 10);

function normalizeRole(role) {
  const r = (role || 'parent').trim();
  const map = {
    schooladmin: 'schoolAdmin',
    superadmin: 'superAdmin',
  };
  return map[r.toLowerCase()] || r;
}

try {
  const schools = await sql`SELECT id FROM schools`;
  const validSchoolIds = new Set(schools.map((s) => s.id));
  console.log(`CSV rows: ${rows.length}`);
  console.log(`Schools: ${[...validSchoolIds].sort((a, b) => a - b).join(', ') || '(none — run seed-dev-schools.mjs first)'}`);
  console.log(apply ? 'APPLY' : 'dry-run');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }
    if (emailsOnly && !emailsOnly.has(email)) {
      skipped++;
      continue;
    }

    const role = normalizeRole(row.role);
    const roleLabel = role === 'schoolAdmin' ? 'schoolAdmin' : role;
    const schoolIdRaw = (row.school_id || '').trim();
    const schoolId =
      schoolIdRaw && validSchoolIds.has(Number(schoolIdRaw))
        ? Number(schoolIdRaw)
        : validSchoolIds.has(1)
          ? 1
          : null;

    const [existing] = await sql`
      SELECT id, email, role, school_id FROM users WHERE lower(trim(email)) = ${email} LIMIT 1
    `;

    if (existing) {
      updated++;
      if (!apply) continue;
      await sql`
        UPDATE users SET
          role = ${role},
          name = COALESCE(NULLIF(${row.name || ''}, ''), name),
          school_id = COALESCE(${schoolId}, school_id),
          is_active = true,
          updated_at = NOW()
        WHERE id = ${existing.id}
      `;
      const roleRows = await sql`SELECT id FROM user_roles WHERE user_id = ${existing.id}`;
      if (roleRows.length === 0) {
        const [ur] = await sql`
          INSERT INTO user_roles (user_id, role, school_id, is_primary)
          VALUES (${existing.id}, ${roleLabel}, ${schoolId}, true)
          RETURNING id
        `;
        await sql`
          UPDATE users SET active_role = ${roleLabel}, active_role_id = ${ur.id}
          WHERE id = ${existing.id}
        `;
      }
      continue;
    }

    inserted++;
    if (!apply) continue;

    let username = (row.username || email.split('@')[0]).trim();
    const [usernameTaken] = await sql`
      SELECT id FROM users WHERE lower(username) = lower(${username}) LIMIT 1
    `;
    if (usernameTaken) username = `${username}_${Date.now().toString(36).slice(-4)}`;

    const [user] = await sql`
      INSERT INTO users (
        username, email, password, name, role, school_id, subscription, permissions, is_active
      ) VALUES (
        ${username},
        ${email},
        ${row.password?.startsWith('$2') ? row.password : placeholderPassword},
        ${row.name || email},
        ${role},
        ${schoolId},
        ${row.subscription || 'free'},
        ${row.permissions && row.permissions !== '{}' ? row.permissions : '{}'}::jsonb,
        true
      )
      RETURNING id
    `;

    const [ur] = await sql`
      INSERT INTO user_roles (user_id, role, school_id, is_primary)
      VALUES (${user.id}, ${roleLabel}, ${schoolId}, true)
      RETURNING id
    `;
    await sql`
      UPDATE users SET active_role = ${roleLabel}, active_role_id = ${ur.id}
      WHERE id = ${user.id}
    `;
    console.log(`  + ${email} (${roleLabel}, school_id=${schoolId})`);
  }

  console.log(`Done — insert: ${inserted}, update: ${updated}, skip: ${skipped}`);
  if (!apply) {
    console.log('Add CONFIRM_APP_USER_IMPORT=1 and --apply to write.');
  }
} finally {
  await sql.end({ timeout: 5 });
}
