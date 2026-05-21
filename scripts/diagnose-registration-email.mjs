#!/usr/bin/env node
/**
 * Explain "email already exists" when the Replit users table looks empty.
 *
 *   node scripts/diagnose-registration-email.mjs jocimarie@gmail.com
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const email = process.argv[2]?.trim();
if (!email) {
  console.error('Usage: node scripts/diagnose-registration-email.mjs <email>');
  process.exit(1);
}

const normalized = email.trim().toLowerCase();
const dbUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n=== Registration email diagnosis ===');
console.log('Email:', email);
console.log('Normalized:', normalized);

if (dbUrl) {
  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const users = await sql`
      SELECT id, email, role, school_id, supabase_id
      FROM users
      WHERE lower(trim(email)) = ${normalized}
    `;
    const children = await sql`
      SELECT id, parent_email, first_name, last_name
      FROM children
      WHERE lower(trim(parent_email)) = ${normalized}
      LIMIT 5
    `;
    console.log('\n--- Postgres users table ---');
    if (users.length === 0) {
      console.log('  (no row)');
    } else {
      for (const u of users) {
        console.log(`  id=${u.id} email=${u.email} role=${u.role} school_id=${u.school_id} supabase_id=${u.supabase_id ?? 'null'}`);
      }
    }
    console.log('\n--- Postgres children.parent_email ---');
    if (children.length === 0) {
      console.log('  (no rows)');
    } else {
      for (const c of children) {
        console.log(`  child id=${c.id} parent_email=${c.parent_email}`);
      }
    }
  } finally {
    await sql.end();
  }
} else {
  console.log('\nDATABASE_URL not set — skipping Postgres check');
}

if (supabaseUrl && serviceKey) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let found = null;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('\nSupabase listUsers error:', error.message);
      break;
    }
    found = data.users.find((u) => u.email?.trim().toLowerCase() === normalized) ?? null;
    if (found || data.users.length < 200) break;
  }
  console.log('\n--- Supabase Auth (login identities) ---');
  if (!found) {
    console.log('  (no auth user)');
  } else {
    console.log(`  id=${found.id}`);
    console.log(`  email=${found.email}`);
    console.log(`  created=${found.created_at}`);
    console.log('\n  ^ Registration blocks on THIS even when Postgres users is empty.');
    console.log('  Fix: node server/scripts/delete-supabase-auth-by-email.mjs', email);
    console.log('  Or: use Login / Forgot password with this email.');
  }
} else {
  console.log('\nSupabase keys not set — skipping Auth check');
}

console.log('');
