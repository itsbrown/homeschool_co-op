/**
 * Production fix: Kendra Crofoot — phantom total_paid on v2 session enrollments (#522–531).
 *
 * Problem:
 * - Six half-day session enrollments show total_paid=$441 each with no succeeded Stripe PI
 *   and no payments row (checkout PI pi_3ThDZRGhVuNOnUs71KzilfhU remains requires_payment_method).
 * - payment_status stayed "pending" while total_paid > 0 — invalid orphan ledger state.
 *
 * Fix:
 * - Reset total_paid → 0, remaining_balance → total_cost, payment_status → pending.
 * - Annotate metadata with correction audit; remove stale initialPaymentIntentId.
 *
 * Does NOT touch legacy Greece enrollments #389/#390 or Winter #104/#105.
 *
 * Dry run:  node scripts/with-prod-env.mjs npx tsx server/scripts/fix-kendra-crofoot-session-phantom-paid-production.ts --dry-run
 * Live:     node scripts/with-prod-env.mjs npx tsx server/scripts/fix-kendra-crofoot-session-phantom-paid-production.ts
 */

import { getDb } from '../db';
import { programEnrollments } from '../../shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

const PARENT_ID = 21;
const PARENT_EMAIL = 'kcrofoot92@gmail.com';
const ENROLLMENT_IDS = [522, 523, 528, 529, 530, 531] as const;
const STALE_PI = 'pi_3ThDZRGhVuNOnUs71KzilfhU';
const PHANTOM_PAID_CENTS = 44100;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL required');

  console.log('='.repeat(72));
  console.log('KENDRA CROFOOT — SESSION PHANTOM total_paid RESET');
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
    if ((row.totalPaid ?? 0) !== PHANTOM_PAID_CENTS) {
      console.error(
        `Enrollment ${row.id} total_paid=${row.totalPaid} — expected ${PHANTOM_PAID_CENTS}. Aborting.`,
      );
      process.exit(1);
    }
    if (row.paymentStatus !== 'pending') {
      console.warn(`Enrollment ${row.id} payment_status=${row.paymentStatus} (expected pending)`);
    }
  }

  const payCheck = (await db.execute(sql`
    SELECT id, stripe_payment_intent_id, amount
    FROM payments
    WHERE stripe_payment_intent_id = ${STALE_PI}
  `)) as Array<{ id: number; stripe_payment_intent_id: string | null; amount: number }>;

  if (payCheck.length > 0) {
    console.error('Aborting: payments rows exist for these enrollments or stale PI:', payCheck);
    process.exit(1);
  }

  console.log('Current state:');
  for (const row of rows.sort((a, b) => a.id - b.id)) {
    console.log(
      `  #${row.id} ${String(row.childName).trim()} | ${row.className} | paid=$${((row.totalPaid ?? 0) / 100).toFixed(2)} | rem=$${((row.remainingBalance ?? 0) / 100).toFixed(2)} | status=${row.status}`,
    );
  }
  console.log('');
  console.log('Proposed: total_paid=$0, remaining_balance=total_cost ($1050), payment_status=pending');
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete — no changes.');
    process.exit(0);
  }

  const correctedAt = new Date().toISOString();
  for (const row of rows) {
    const priorMeta = (row.metadata as Record<string, unknown> | null) ?? {};
    const { initialPaymentIntentId: _removedPi, ...metaWithoutStalePi } = priorMeta;
    const totalCost = row.totalCost ?? 0;
    const comp = row.compAmountCents ?? 0;
    const newRemaining = Math.max(0, totalCost - comp);

    await db
      .update(programEnrollments)
      .set({
        totalPaid: 0,
        remainingBalance: newRemaining,
        paymentStatus: 'pending',
        metadata: {
          ...metaWithoutStalePi,
          ledgerCorrection: {
            correctedAt,
            script: 'fix-kendra-crofoot-session-phantom-paid-production.ts',
            reason:
              'Reset phantom total_paid ($441) with no succeeded Stripe PI or payments row',
            previousTotalPaidCents: row.totalPaid,
            stalePaymentIntentId: STALE_PI,
            parentEmail: PARENT_EMAIL,
          },
        },
      })
      .where(eq(programEnrollments.id, row.id));

    console.log(`✅ #${row.id} reset: total_paid=0, remaining_balance=${newRemaining}`);
  }

  const verify = await db
    .select({
      id: programEnrollments.id,
      totalPaid: programEnrollments.totalPaid,
      remainingBalance: programEnrollments.remainingBalance,
      paymentStatus: programEnrollments.paymentStatus,
    })
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [...ENROLLMENT_IDS]))
    .orderBy(programEnrollments.id);

  console.log('');
  console.log('Post-correction:');
  for (const v of verify) {
    console.log(
      `  #${v.id} paid=$${((v.totalPaid ?? 0) / 100).toFixed(2)} rem=$${((v.remainingBalance ?? 0) / 100).toFixed(2)} payment=${v.paymentStatus}`,
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
