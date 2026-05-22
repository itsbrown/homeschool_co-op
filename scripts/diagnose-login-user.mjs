#!/usr/bin/env node
/**
 * Check whether a login email exists in the app database (users + user_roles).
 * Run on Replit/local with DATABASE_URL set: node scripts/diagnose-login-user.mjs user@example.com
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';

const email = process.argv[2]?.trim();
if (!email) {
  console.error('Usage: node scripts/diagnose-login-user.mjs <email>');
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
  console.error('DATABASE_URL is not set. Configure Secrets / .env before running.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const normalized = email.toLowerCase();

try {
  const users = await sql`
    SELECT id, email, role, school_id, active_role_id
    FROM users
    WHERE lower(trim(email)) = ${normalized}
  `;

  if (users.length === 0) {
    console.log(`❌ No users row for: ${email}`);
    console.log('   Supabase login will return 403 REGISTRATION_REQUIRED until the user registers.');
    console.log('   Confirm DATABASE_URL points at the database you expect (prod vs dev).');
    process.exit(2);
  }

  console.log(`✅ Found ${users.length} user row(s):`);
  for (const u of users) {
    console.log(`   id=${u.id} email=${u.email} role=${u.role} school_id=${u.school_id}`);
    const roles = await sql`
      SELECT id, role, school_id, is_primary
      FROM user_roles
      WHERE user_id = ${u.id}
    `;
    if (roles.length === 0) {
      console.log('   (no user_roles rows — may rely on users.role only)');
    } else {
      for (const r of roles) {
        console.log(`   user_roles: id=${r.id} role=${r.role} school_id=${r.school_id} primary=${r.is_primary}`);
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
