#!/usr/bin/env npx tsx
/**
 * Backfill user_locations for staff who have a primary locationId but no grant row.
 * School admins / directors do not need rows (role bypass).
 *
 * Usage (dry-run default):
 *   npx tsx server/scripts/backfill-staff-user-locations.ts
 *   npx tsx server/scripts/backfill-staff-user-locations.ts --apply
 */
import { getDb } from '../db';
import { users, userLocations, userRoles } from '@shared/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

const APPLY = process.argv.includes('--apply');

const STAFF_ROLES = new Set([
  'educator',
  'teacher',
  'mentor',
  'director',
]);

async function main() {
  const db = await getDb();
  console.log(APPLY ? 'APPLY mode' : 'DRY-RUN mode (pass --apply to write)');

  const staffUsers = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      schoolId: users.schoolId,
      locationId: users.locationId,
    })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.locationId)));

  let created = 0;
  let skipped = 0;

  for (const user of staffUsers) {
    if (user.role === 'schoolAdmin' || user.role === 'admin' || user.role === 'superAdmin') {
      skipped++;
      continue;
    }

    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, user.id), eq(userRoles.isActive, true)));

    const roleNames = new Set([user.role, ...roles.map((r) => r.role)]);
    const isStaff = [...roleNames].some((r) => STAFF_ROLES.has(r ?? ''));
    if (!isStaff) {
      skipped++;
      continue;
    }

    if (!user.locationId) {
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: userLocations.id })
      .from(userLocations)
      .where(
        and(
          eq(userLocations.userId, user.id),
          eq(userLocations.locationId, user.locationId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    console.log(
      `Would create user_locations for user=${user.id} email=${user.email} location=${user.locationId}`,
    );

    if (APPLY) {
      await db.insert(userLocations).values({
        userId: user.id,
        locationId: user.locationId,
        accessLevel: 'view',
        canViewReports: false,
        canManageStaff: false,
        canManageClasses: false,
        canManageStudents: false,
        canSendNotifications: false,
        canViewParentContacts: false,
        isActive: true,
      });
      created++;
    } else {
      created++;
    }
  }

  console.log(`Done. ${APPLY ? 'Created' : 'Would create'}: ${created}; skipped: ${skipped}`);
  console.log(`Checked users with locationId: ${staffUsers.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
