/**
 * Set Jennifer Pastorella (135) + Luca (169) campus to Greece (location 4).
 *
 * Updates: users.location_id, user_locations, children.location_id, school_students.location_id
 *
 * Usage:
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/set-pastorella-campus-greece-production.ts
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/set-pastorella-campus-greece-production.ts --dry-run
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { persistParentLocationAssociation } from '../lib/persist-parent-location';

const PARENT_ID = 135;
const CHILD_ID = 169;
const GREECE_LOCATION_ID = 4;
const SCHOOL_ID = 2;

async function snapshot(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = await db.execute(sql`
    SELECT
      u.id AS parent_id,
      u.location_id AS users_location_id,
      (
        SELECT ul.location_id
        FROM user_locations ul
        WHERE ul.user_id = u.id AND ul.is_active = true
        ORDER BY ul.id
        LIMIT 1
      ) AS user_locations_loc,
      c.id AS child_id,
      c.location_id AS child_location_id,
      ss.location_id AS school_student_location_id,
      pl.name AS parent_location_name,
      cl.name AS child_location_name
    FROM users u
    LEFT JOIN locations pl ON pl.id = u.location_id
    LEFT JOIN children c ON c.parent_id = u.id AND c.id = ${CHILD_ID}
    LEFT JOIN school_students ss ON ss.child_id = c.id AND ss.school_id = ${SCHOOL_ID}
    LEFT JOIN locations cl ON cl.id = c.location_id
    WHERE u.id = ${PARENT_ID}
  `);
  return rows;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = await getDb();

  const greece = await db.execute(sql`
    SELECT id, name, school_id, is_active
    FROM locations
    WHERE id = ${GREECE_LOCATION_ID}
  `);
  const greeceRow = Array.isArray(greece) ? greece[0] : (greece as { rows?: unknown[] }).rows?.[0];
  if (!greeceRow || (greeceRow as { name?: string }).name !== 'Greece') {
    throw new Error(`Expected location ${GREECE_LOCATION_ID} to be Greece; got ${JSON.stringify(greeceRow)}`);
  }

  console.log('Before:', JSON.stringify(await snapshot(db), null, 2));

  if (dryRun) {
    console.log(`\n[dry-run] Would set parent ${PARENT_ID} + child ${CHILD_ID} → Greece (${GREECE_LOCATION_ID})`);
    return;
  }

  await persistParentLocationAssociation(storage, PARENT_ID, GREECE_LOCATION_ID);

  await db.execute(sql`
    UPDATE children
    SET location_id = ${GREECE_LOCATION_ID}, updated_at = NOW()
    WHERE id = ${CHILD_ID} AND parent_id = ${PARENT_ID}
  `);

  await db.execute(sql`
    UPDATE school_students
    SET location_id = ${GREECE_LOCATION_ID}, updated_at = NOW()
    WHERE child_id = ${CHILD_ID} AND school_id = ${SCHOOL_ID}
  `);

  // Deactivate any other active user_locations for this parent (keep Greece only)
  await db.execute(sql`
    UPDATE user_locations
    SET is_active = false, updated_at = NOW()
    WHERE user_id = ${PARENT_ID}
      AND location_id <> ${GREECE_LOCATION_ID}
      AND is_active = true
  `);

  console.log('After:', JSON.stringify(await snapshot(db), null, 2));
  console.log(`\n✅ Pastorella family set to Greece (location ${GREECE_LOCATION_ID})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
