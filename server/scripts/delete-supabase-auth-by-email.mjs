#!/usr/bin/env node
/**
 * Delete a Supabase auth user by email when the DB row was removed but auth remains.
 *
 * Usage (Replit Shell):
 *   node server/scripts/delete-supabase-auth-by-email.mjs parent@example.com
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '../..');
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node server/scripts/delete-supabase-auth-by-email.mjs <email>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let found = null;
for (let page = 1; page <= 50; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('listUsers failed:', error.message);
    process.exit(1);
  }
  found = data.users.find((u) => u.email?.trim().toLowerCase() === email);
  if (found || !data.users.length || data.users.length < 200) break;
}

if (!found) {
  console.log(`No Supabase auth user found for ${email}`);
  process.exit(0);
}

console.log(`Deleting Supabase auth user ${found.id} (${found.email})...`);
const { error: delErr } = await supabase.auth.admin.deleteUser(found.id);
if (delErr) {
  console.error('deleteUser failed:', delErr.message);
  process.exit(1);
}

console.log('Done. They can register again with this email.');
