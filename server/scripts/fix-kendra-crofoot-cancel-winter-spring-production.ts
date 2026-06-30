/**
 * Production fix: Kendra Crofoot — remove Winter/Spring 2027 from cart (both children).
 *
 * Targets session enrollments #528–531 (Winter/Spring 2027 half-day for Amelia & Olivia).
 * Does NOT touch Fall 2026 (#522, #523) or legacy Greece rows.
 *
 * Actions:
 * - status → cancelled (if still pending_payment)
 * - remaining_balance → 0
 * - delete pending scheduled_payments for these enrollments
 *
 * Dry run:  node scripts/with-prod-env.mjs npx tsx server/scripts/fix-kendra-crofoot-cancel-winter-spring-production.ts --dry-run
 * Live:     node scripts/with-prod-env.mjs npx tsx server/scripts/fix-kendra-crofoot-cancel-winter-spring-production.ts
 */

import { getDb } from '../db';
import { programEnrollments } from '../../shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { storage } from '../storage';

const DRY_RUN = process.argv.includes('--dry-run');

const PARENT_ID = 21;
const PARENT_EMAIL = 'kcrofoot92@gmail.com';
/** Winter/Spring 2027 — NOT Fall (#522, #523). */
const ENROLLMENT_IDS = [528, 529, 530, 531] as const;

const SESSION_NAME_HINTS = ['Winter 2027', 'Spring 2027'];

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL required');

  console.log('='.repeat(72));
  console.log('KENDRA CROFOOT — CANCEL WINTER/SPRING 2027 (CART REMOVAL)');
  console.log('='.repeat(72));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const rows = await db
    .select()
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [...ENROLLMENT_IDS]));

  if (rows.length !== ENROLLMENT_IDS.length) {
    console.error(`Expected ${ENROLLMENT_IDS.length} enrollments, found ${rows.length}`);
    process.exit(1);
  }

  for (const row of rows) {
    if (row.parentId !== PARENT_ID) {
      console.error(`Enrollment ${row.id} parent_id=${row.parentId}, expected ${PARENT_ID}`);
      process.exit(1);
    }
    const className = String(row.className ?? '');
    if (!SESSION_NAME_HINTS.some((hint) => className.includes(hint))) {
      console.error(
        `Enrollment ${row.id} class_name="${className}" — expected Winter/Spring 2027. Aborting.`,
      );
      process.exit(1);
    }
    if ((row.totalPaid ?? 0) > 0) {
      console.error(
        `Enrollment ${row.id} has total_paid=${row.totalPaid}. Refund/reallocate first. Aborting.`,
      );
      process.exit(1);
    }
  }

  console.log('Current state:');
  for (const row of rows.sort((a, b) => a.id - b.id)) {
    console.log(
      `  #${row.id} ${String(row.childName).trim()} | ${row.className} | status=${row.status} | rem=$${((row.remainingBalance ?? 0) / 100).toFixed(2)}`,
    );
  }
  console.log('');
  console.log('Proposed: status=cancelled, remaining_balance=0, clear pending scheduled payments');
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete — no changes.');
    process.exit(0);
  }

  const correctedAt = new Date().toISOString();

  for (const row of rows) {
    const deletedSchedules = await storage.deletePendingScheduledPaymentsByEnrollmentId(row.id);
    if (deletedSchedules > 0) {
      console.log(`  #${row.id}: removed ${deletedSchedules} pending scheduled payment(s)`);
    }

    const priorMeta = (row.metadata as Record<string, unknown> | null) ?? {};
    await db
      .update(programEnrollments)
      .set({
        status: 'cancelled',
        remainingBalance: 0,
        compAmountCents: row.totalCost ?? 0,
        compPercentage: 100,
        paymentStatus: 'pending',
        metadata: {
          ...priorMeta,
          cartRemovalCorrection: {
            correctedAt,
            script: 'fix-kendra-crofoot-cancel-winter-spring-production.ts',
            reason: 'Parent requested Fall 2026 only — remove Winter/Spring from cart',
            previousStatus: row.status,
            previousRemainingBalanceCents: row.remainingBalance,
            previousCompAmountCents: row.compAmountCents ?? 0,
            parentEmail: PARENT_EMAIL,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, row.id));

    console.log(`✅ #${row.id} cancelled, remaining_balance=0, comp=100% (effective_balance=0)`);
  }

  const verify = await db
    .select({
      id: programEnrollments.id,
      className: programEnrollments.className,
      childName: programEnrollments.childName,
      status: programEnrollments.status,
      remainingBalance: programEnrollments.remainingBalance,
    })
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [...ENROLLMENT_IDS]))
    .orderBy(programEnrollments.id);

  console.log('');
  console.log('Post-correction:');
  for (const v of verify) {
    console.log(
      `  #${v.id} ${String(v.childName).trim()} | ${v.className} | status=${v.status} | rem=$${((v.remainingBalance ?? 0) / 100).toFixed(2)}`,
    );
  }

  const fallRows = await db.execute(sql`
    SELECT id, class_name, status, remaining_balance
    FROM program_enrollments
    WHERE id IN (522, 523)
    ORDER BY id
  `);
  console.log('');
  console.log('Fall 2026 (unchanged):');
  for (const f of fallRows as Array<{
    id: number;
    class_name: string;
    status: string;
    remaining_balance: number;
  }>) {
    console.log(
      `  #${f.id} ${f.class_name} | status=${f.status} | rem=$${(Number(f.remaining_balance) / 100).toFixed(2)}`,
    );
  }

  console.log('');
  console.log('='.repeat(72));
  console.log('✅ CORRECTION COMPLETE');
  console.log('='.repeat(72));
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
