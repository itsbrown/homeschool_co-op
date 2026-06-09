/**
 * Prod fix: Nina Resser (30) — equal Spring sibling rebalance + payment page schedule cleanup.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/rebalance-nina-resser-spring.ts
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/rebalance-nina-resser-spring.ts --dry-run
 */

import { getDb } from '../db';
import { programEnrollments, scheduledPayments } from '../../shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';

const PARENT_ID = 30;
const MALIA_ID = 391;
const JETT_ID = 392;
const MALIA_PAID = 57084;
const JETT_PAID = 57085;
const MALIA_REMAINING = 32916;
const JETT_REMAINING = 32915;
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('Database unavailable');
    process.exit(1);
  }

  const before = await db
    .select({
      id: programEnrollments.id,
      totalPaid: programEnrollments.totalPaid,
      remainingBalance: programEnrollments.remainingBalance,
      paymentStatus: programEnrollments.paymentStatus,
    })
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [MALIA_ID, JETT_ID]))
    .orderBy(programEnrollments.id);

  console.log('=== BEFORE ===');
  console.log(before);

  if (DRY_RUN) {
    console.log('Dry run — no changes applied.');
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(programEnrollments)
      .set({
        totalPaid: MALIA_PAID,
        remainingBalance: MALIA_REMAINING,
        paymentStatus: 'partial_payment',
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, MALIA_ID));

    await tx
      .update(programEnrollments)
      .set({
        totalPaid: JETT_PAID,
        remainingBalance: JETT_REMAINING,
        paymentStatus: 'partial_payment',
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, JETT_ID));

    await tx
      .update(scheduledPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(inArray(scheduledPayments.id, [496, 498]));

    const rebalanceMeta = {
      rebalancedAt: new Date().toISOString(),
      note: 'Single remaining installment after sibling rebalance',
    };

    await tx
      .update(scheduledPayments)
      .set({
        status: 'pending',
        amount: MALIA_REMAINING,
        stripePaymentIntentId: null,
        processedAt: null,
        failureReason: null,
        scheduledDate: new Date(),
        updatedAt: new Date(),
        metadata: sql`COALESCE(${scheduledPayments.metadata}, '{}'::jsonb) || ${JSON.stringify(rebalanceMeta)}::jsonb`,
      })
      .where(eq(scheduledPayments.id, 497));

    await tx
      .update(scheduledPayments)
      .set({
        status: 'pending',
        amount: JETT_REMAINING,
        stripePaymentIntentId: null,
        processedAt: null,
        failureReason: null,
        scheduledDate: new Date(),
        updatedAt: new Date(),
        metadata: sql`COALESCE(${scheduledPayments.metadata}, '{}'::jsonb) || ${JSON.stringify(rebalanceMeta)}::jsonb`,
      })
      .where(eq(scheduledPayments.id, 499));
  });

  const after = await db
    .select({
      id: programEnrollments.id,
      totalPaid: programEnrollments.totalPaid,
      remainingBalance: programEnrollments.remainingBalance,
      paymentStatus: programEnrollments.paymentStatus,
    })
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [MALIA_ID, JETT_ID]))
    .orderBy(programEnrollments.id);

  console.log('=== AFTER ===');
  console.log(after);

  const actionable = await db
    .select({
      id: scheduledPayments.id,
      enrollmentId: scheduledPayments.enrollmentId,
      status: scheduledPayments.status,
      amount: scheduledPayments.amount,
    })
    .from(scheduledPayments)
    .where(inArray(scheduledPayments.enrollmentId, [MALIA_ID, JETT_ID]));

  console.log('=== SCHEDULES ===');
  console.log(actionable);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
