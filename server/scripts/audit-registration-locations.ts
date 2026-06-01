/**
 * Report (and optionally fix) parents missing campus while their children have location_id.
 *
 * Usage:
 *   npx tsx server/scripts/audit-registration-locations.ts
 *   npx tsx server/scripts/audit-registration-locations.ts --days 30
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/audit-registration-locations.ts --fix
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { persistParentLocationAssociation } from '../lib/persist-parent-location';

function parseArgs(argv: string[]) {
  let days = 30;
  let fix = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') days = Number(argv[++i]) || 30;
    else if (argv[i] === '--fix') fix = true;
  }
  return { days, fix };
}

type GapRow = {
  parent_id: number;
  parent_email: string;
  parent_name: string;
  user_location_id: number | null;
  user_locations_loc: number | null;
  child_location_id: number | null;
  child_count: number;
  created_at: string;
};

async function main() {
  const { days, fix } = parseArgs(process.argv.slice(2));
  const db = await getDb();

  const rows = (await db.execute(sql`
    SELECT
      u.id AS parent_id,
      u.email AS parent_email,
      u.name AS parent_name,
      u.location_id AS user_location_id,
      (
        SELECT ul.location_id
        FROM user_locations ul
        WHERE ul.user_id = u.id AND ul.is_active = true
        ORDER BY ul.id
        LIMIT 1
      ) AS user_locations_loc,
      (
        SELECT c.location_id
        FROM children c
        WHERE c.parent_id = u.id AND c.location_id IS NOT NULL
        ORDER BY c.updated_at DESC NULLS LAST, c.id DESC
        LIMIT 1
      ) AS child_location_id,
      (SELECT COUNT(*)::int FROM children c WHERE c.parent_id = u.id) AS child_count,
      u.created_at::text AS created_at
    FROM users u
    WHERE u.role = 'parent'
      AND u.created_at > now() - (${days}::text || ' days')::interval
      AND u.location_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_locations ul
        WHERE ul.user_id = u.id AND ul.is_active = true
      )
    ORDER BY u.created_at DESC
  `)) as GapRow[];

  const withChildCampus = rows.filter((r) => r.child_location_id != null);
  const noCampusAnywhere = rows.filter((r) => r.child_location_id == null);

  console.log('='.repeat(72));
  console.log(`Registration location audit (last ${days} days)`);
  console.log('='.repeat(72));
  console.log(`Parents missing user_locations + users.location_id: ${rows.length}`);
  console.log(`  → children have location_id (can backfill from child): ${withChildCampus.length}`);
  console.log(`  → no child location either: ${noCampusAnywhere.length}`);
  console.log('');

  for (const r of withChildCampus) {
    console.log(
      `  parent #${r.parent_id} ${r.parent_email} | child campus=${r.child_location_id} | children=${r.child_count} | joined ${r.created_at.slice(0, 10)}`,
    );
  }

  if (noCampusAnywhere.length > 0) {
    console.log('\nNo campus on parent or children:');
    for (const r of noCampusAnywhere) {
      console.log(`  parent #${r.parent_id} ${r.parent_email} | joined ${r.created_at.slice(0, 10)}`);
    }
  }

  if (!fix) {
    if (withChildCampus.length > 0) {
      console.log('\nRe-run with --fix to copy child campus onto parent (user_locations + users.location_id).');
    }
    return;
  }

  console.log('\nApplying fixes...');
  let fixed = 0;
  for (const r of withChildCampus) {
    const loc = r.child_location_id!;
    try {
      await persistParentLocationAssociation(storage, r.parent_id, loc);
      console.log(`  ✅ parent #${r.parent_id} → location ${loc}`);
      fixed++;
    } catch (err) {
      console.error(`  ❌ parent #${r.parent_id}:`, err);
    }
  }
  console.log(`\nFixed ${fixed} of ${withChildCampus.length} parents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
