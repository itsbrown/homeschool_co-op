/**
 * Close Fall 2026 online enrollment and set parent-facing closed message.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/close-fall-2026-enrollment-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/close-fall-2026-enrollment-production.ts
 */

import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { sessions } from '../../shared/schema';

const FALL_SESSION_ID = 2;
const EXPECTED_NAME = 'Fall 2026';
const CLOSED_MESSAGE =
  'Online Fall 2026 registration is now closed. We are still accepting a limited number of students on a case-by-case basis as space allows. Please contact the school office if you are interested in enrolling at Brighton.';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.execute(sql`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS enrollment_closed_message TEXT
  `);

  const [row] = await db.select().from(sessions).where(eq(sessions.id, FALL_SESSION_ID)).limit(1);
  if (!row) throw new Error(`Session ${FALL_SESSION_ID} not found`);
  if (row.name !== EXPECTED_NAME) {
    throw new Error(`Expected session name "${EXPECTED_NAME}", got "${row.name}"`);
  }

  console.log('Current:', {
    id: row.id,
    name: row.name,
    enrollmentOpen: row.enrollmentOpen,
    enrollmentClosedMessage: row.enrollmentClosedMessage,
  });

  if (DRY_RUN) {
    console.log('\n[dry-run] Would set enrollment_open=false and enrollment_closed_message.');
    return;
  }

  const [updated] = await db
    .update(sessions)
    .set({
      enrollmentOpen: false,
      enrollmentClosedMessage: CLOSED_MESSAGE,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, FALL_SESSION_ID))
    .returning();

  console.log('\nUpdated:', {
    id: updated.id,
    name: updated.name,
    enrollmentOpen: updated.enrollmentOpen,
    enrollmentClosedMessage: updated.enrollmentClosedMessage,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
