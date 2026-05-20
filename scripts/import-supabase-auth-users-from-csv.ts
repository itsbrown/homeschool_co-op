/**
 * Import Supabase auth.users export (CSV) into Postgres `users` + `user_roles`.
 *
 * Login passwords stay in Supabase — this only restores app rows so middleware
 * can resolve users after a dev DB truncate.
 *
 * Usage (dry-run first):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/import-supabase-auth-users-from-csv.ts \
 *     --csv "/path/to/Supabase Snippet SQL Query.csv"
 *
 * Apply:
 *   CONFIRM_SUPABASE_USER_IMPORT=1 DATABASE_URL="..." npx tsx scripts/import-supabase-auth-users-from-csv.ts \
 *     --csv "/path/to/Supabase Snippet SQL Query.csv" --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '../server/db';
import { schools, userRoles, users, type SystemRole } from '../shared/schema';

const SYSTEM_ROLES = new Set<string>([
  'student',
  'parent',
  'learner',
  'educator',
  'teacher',
  'schoolAdmin',
  'admin',
  'superAdmin',
]);

type CsvRow = Record<string, string>;

function parseArgs(argv: string[]) {
  let csvPath = '';
  let apply = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--csv' && argv[i + 1]) {
      csvPath = argv[++i];
    } else if (argv[i] === '--apply') {
      apply = true;
    }
  }
  if (!csvPath) {
    csvPath = path.join(
      process.env.HOME || '',
      'Downloads',
      'Supabase Snippet SQL Query.csv',
    );
  }
  return { csvPath, apply };
}

/** Supabase SQL exports use the literal string "null" for empty cells. */
function csvEmpty(value: string | undefined): boolean {
  if (value == null) return true;
  const t = value.trim().toLowerCase();
  return t === '' || t === 'null' || t === 'undefined';
}

function parseJsonField(raw: string | undefined): Record<string, unknown> {
  if (csvEmpty(raw)) return {};
  try {
    return JSON.parse(raw!) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Map Supabase metadata role → users.role enum + user_roles.role text */
function resolveRoles(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>,
): { primaryRole: SystemRole; roleLabel: string } {
  const raw =
    (typeof appMeta.role === 'string' && appMeta.role) ||
    (typeof userMeta.role === 'string' && userMeta.role) ||
    (Array.isArray(appMeta.roles) && typeof appMeta.roles[0] === 'string'
      ? appMeta.roles[0]
      : '') ||
    'parent';

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, '');

  let primaryRole: SystemRole = 'parent';
  if (lower === 'schooladmin' || lower === 'school_admin') primaryRole = 'schoolAdmin';
  else if (lower === 'superadmin') primaryRole = 'superAdmin';
  else if (lower === 'admin') primaryRole = 'admin';
  else if (lower === 'educator' || lower === 'mentor' || lower === 'director') primaryRole = 'educator';
  else if (lower === 'teacher') primaryRole = 'teacher';
  else if (lower === 'learner') primaryRole = 'learner';
  else if (lower === 'student') primaryRole = 'student';
  else if (lower === 'parent') primaryRole = 'parent';
  else if (SYSTEM_ROLES.has(trimmed)) primaryRole = trimmed as SystemRole;

  const roleLabel = SYSTEM_ROLES.has(trimmed)
    ? primaryRole
    : trimmed || primaryRole;

  return { primaryRole, roleLabel };
}

function resolveSchoolId(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>,
  validSchoolIds: Set<number>,
): number | null {
  const candidates = [
    appMeta.school_id,
    appMeta.schoolId,
    userMeta.school_id,
    userMeta.schoolId,
  ];
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : Number(c);
    if (Number.isFinite(n) && n > 0 && validSchoolIds.has(n)) {
      return n;
    }
  }
  return null;
}

function resolveName(
  email: string,
  userMeta: Record<string, unknown>,
): { name: string; firstName: string | null; lastName: string | null } {
  const name =
    (typeof userMeta.name === 'string' && userMeta.name.trim()) ||
    (typeof userMeta.full_name === 'string' && userMeta.full_name.trim()) ||
    email.split('@')[0];
  const firstName =
    (typeof userMeta.first_name === 'string' && userMeta.first_name.trim()) ||
    (typeof userMeta.firstName === 'string' && userMeta.firstName.trim()) ||
    null;
  const lastName =
    (typeof userMeta.last_name === 'string' && userMeta.last_name.trim()) ||
    (typeof userMeta.lastName === 'string' && userMeta.lastName.trim()) ||
    null;
  return { name, firstName, lastName };
}

function baseUsername(email: string): string {
  const local = email.split('@')[0] || 'user';
  return local.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'user';
}

async function main() {
  const { csvPath, apply } = parseArgs(process.argv);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  if (apply && process.env.CONFIRM_SUPABASE_USER_IMPORT !== '1') {
    console.error(
      'Refusing to write: set CONFIRM_SUPABASE_USER_IMPORT=1 with --apply',
    );
    process.exit(1);
  }

  const resolvedCsv = path.resolve(csvPath);
  if (!fs.existsSync(resolvedCsv)) {
    console.error(`CSV not found: ${resolvedCsv}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolvedCsv, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as CsvRow[];

  const db = await getDb();
  const schoolRows = await db.select({ id: schools.id }).from(schools);
  const validSchoolIds = new Set(schoolRows.map((s) => s.id));

  console.log(`📂 CSV: ${resolvedCsv}`);
  console.log(`🏫 Schools in DB: ${[...validSchoolIds].sort((a, b) => a - b).join(', ') || '(none)'}`);
  console.log(`📋 Auth rows in CSV: ${rows.length}`);
  console.log(apply ? '⚠️  APPLY mode — writing to database' : '🔍 Dry-run only (pass --apply to write)');

  const placeholderPassword = await bcrypt.hash(
    `supabase-import-placeholder-${Date.now()}`,
    10,
  );

  const usedUsernames = new Set<string>();
  const existingUsers = await db.select({ id: users.id, email: users.email, username: users.username }).from(users);
  for (const u of existingUsers) {
    if (u.username) usedUsernames.add(u.username.toLowerCase());
  }

  let skipped = 0;
  let wouldInsert = 0;
  let wouldUpdate = 0;
  let roleRows = 0;

  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    const supabaseId = (row.id || '').trim();
    if (!email || !supabaseId) {
      skipped++;
      continue;
    }
    if (!csvEmpty(row.deleted_at) || row.is_anonymous?.trim().toLowerCase() === 'true') {
      skipped++;
      continue;
    }

    const appMeta = parseJsonField(row.raw_app_meta_data);
    const userMeta = parseJsonField(row.raw_user_meta_data);
    const { primaryRole, roleLabel } = resolveRoles(appMeta, userMeta);
    const schoolId = resolveSchoolId(appMeta, userMeta, validSchoolIds);
    const { name, firstName, lastName } = resolveName(email, userMeta);

    const [existing] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, email), eq(users.supabaseId, supabaseId)))
      .limit(1);

    if (existing) {
      wouldUpdate++;
      if (apply) {
        await db
          .update(users)
          .set({
            supabaseId,
            role: primaryRole,
            name: existing.name || name,
            firstName: existing.firstName ?? firstName,
            lastName: existing.lastName ?? lastName,
            schoolId: schoolId ?? existing.schoolId,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id));

        const roles = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.userId, existing.id));

        if (roles.length === 0) {
          const [newRole] = await db
            .insert(userRoles)
            .values({
              userId: existing.id,
              role: roleLabel,
              schoolId,
              isPrimary: true,
            })
            .returning();
          await db
            .update(users)
            .set({ activeRole: roleLabel, activeRoleId: newRole.id })
            .where(eq(users.id, existing.id));
          roleRows++;
        }
      }
      continue;
    }

    let username = baseUsername(email);
    let suffix = 0;
    while (usedUsernames.has(username.toLowerCase())) {
      suffix++;
      username = `${baseUsername(email)}_${suffix}`;
    }
    usedUsernames.add(username.toLowerCase());
    wouldInsert++;

    if (!apply) continue;

    const [inserted] = await db
      .insert(users)
      .values({
        supabaseId,
        username,
        email,
        password: placeholderPassword,
        role: primaryRole,
        name,
        firstName,
        lastName,
        schoolId,
        isActive: true,
        subscription: 'free',
        permissions: {},
      })
      .returning();

    const [newRole] = await db
      .insert(userRoles)
      .values({
        userId: inserted.id,
        role: roleLabel,
        schoolId,
        isPrimary: true,
      })
      .returning();

    await db
      .update(users)
      .set({
        activeRole: roleLabel,
        activeRoleId: newRole.id,
      })
      .where(eq(users.id, inserted.id));

    roleRows++;
  }

  console.log('\n📊 Summary');
  console.log(`   Skipped (no email / deleted / anonymous): ${skipped}`);
  console.log(`   Would insert users: ${wouldInsert}`);
  console.log(`   Would update users: ${wouldUpdate}`);
  if (apply) {
    console.log(`   user_roles rows created: ${roleRows}`);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    console.log(`   users table count now: ${count}`);
  } else {
    console.log('\n   Re-run with:');
    console.log(
      '   CONFIRM_SUPABASE_USER_IMPORT=1 DATABASE_URL="..." npx tsx scripts/import-supabase-auth-users-from-csv.ts --csv "<path>" --apply',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
