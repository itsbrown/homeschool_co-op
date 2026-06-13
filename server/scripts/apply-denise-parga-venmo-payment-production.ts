/**
 * Production: record Venmo pay-in-full for Denise Parga — Andrea Spring (#315).
 *
 *   $691.00 via Venmo (pay in full)
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-denise-parga-venmo-payment-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-denise-parga-venmo-payment-production.ts
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { auditLogs, payments, programEnrollments, scheduledPayments } from '../../shared/schema';
import { storage } from '../storage';
import { computeEffectiveBalance } from '../../shared/schema';

const PARENT_ID = 12;
const PARENT_EMAIL = 'denisedotres@gmail.com';
const ENROLLMENT_ID = 315;
const SCHEDULED_PAYMENT_ID = 516;
const SCHOOL_ID = 2;
const AMOUNT_CENTS = 69100;
const SYNTHETIC_PI = 'MANUAL-VENMO-denise-parga-andrea-2026-06-11';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = await getDb();

  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);

  if (!enrollment || enrollment.parentId !== PARENT_ID) {
    throw new Error(`Enrollment #${ENROLLMENT_ID} not found for parent ${PARENT_ID}`);
  }

  const [sp] = await db
    .select()
    .from(scheduledPayments)
    .where(eq(scheduledPayments.id, SCHEDULED_PAYMENT_ID))
    .limit(1);

  if (!sp || sp.enrollmentId !== ENROLLMENT_ID) {
    throw new Error(`Scheduled payment #${SCHEDULED_PAYMENT_ID} not found for enrollment ${ENROLLMENT_ID}`);
  }

  const owedBefore = computeEffectiveBalance(
    enrollment.totalCost ?? 0,
    enrollment.totalPaid ?? 0,
    enrollment.compAmountCents ?? 0,
  );

  console.log('Before:', {
    enrollmentId: enrollment.id,
    totalCost: enrollment.totalCost,
    totalPaid: enrollment.totalPaid,
    remainingBalance: enrollment.remainingBalance,
    effectiveBalance: owedBefore,
    paymentStatus: enrollment.paymentStatus,
    scheduledPayment: { id: sp.id, status: sp.status, amount: sp.amount },
  });

  if (owedBefore <= 0) {
    console.log('Enrollment already paid in full — nothing to apply.');
    return;
  }

  if (owedBefore !== AMOUNT_CENTS) {
    console.warn(
      `Warning: owed ${owedBefore}c but recording ${AMOUNT_CENTS}c — verify with parent before applying.`,
    );
  }

  const existing = await storage.getPaymentByStripeId(SYNTHETIC_PI);
  if (existing) {
    console.log(`Skip (exists): ${SYNTHETIC_PI} → payment #${existing.id}`);
    return;
  }

  const paymentDate = new Date();
  const totalCost = enrollment.totalCost ?? 0;
  const comp = enrollment.compAmountCents ?? 0;
  const totalPaid = (enrollment.totalPaid ?? 0) + AMOUNT_CENTS;
  const remainingBalance = computeEffectiveBalance(totalCost, totalPaid, comp);
  const paymentStatus = remainingBalance <= 0 ? 'completed' : 'partial_payment';

  if (DRY_RUN) {
    console.log('DRY RUN would insert Venmo payment:', {
      amountCents: AMOUNT_CENTS,
      syntheticPi: SYNTHETIC_PI,
      notes: 'Venmo',
      totalPaidAfter: totalPaid,
      remainingBalanceAfter: Math.max(0, remainingBalance),
      paymentStatusAfter: paymentStatus,
      scheduledPaymentAfter: 'completed',
    });
    console.log('DRY RUN complete.');
    return;
  }

  await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(payments)
      .values({
        schoolId: enrollment.schoolId ?? SCHOOL_ID,
        parentId: PARENT_ID,
        parentEmail: PARENT_EMAIL,
        amount: AMOUNT_CENTS,
        currency: 'usd',
        childName: enrollment.childName ?? 'Andrea Parga',
        className: enrollment.className ?? 'Yankee Doodle | Brighton',
        description: 'Manual Venmo payment — pay in full (Andrea Spring 2026)',
        status: 'completed',
        stripePaymentIntentId: SYNTHETIC_PI,
        stripeChargeId: null,
        stripeRefundId: null,
        paymentMethod: 'other',
        enrollmentIds: [ENROLLMENT_ID],
        originalPaymentId: null,
        paymentDate,
        metadata: {
          paymentMethod: 'venmo',
          isManualPayment: true,
          createdByRole: 'admin',
          notes: 'Venmo',
          enrollmentIds: [ENROLLMENT_ID],
          paymentDate: paymentDate.toISOString(),
        },
      })
      .returning();

    await tx
      .update(programEnrollments)
      .set({
        totalPaid,
        remainingBalance: Math.max(0, remainingBalance),
        paymentStatus,
        status: 'enrolled',
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, ENROLLMENT_ID));

    await tx
      .update(scheduledPayments)
      .set({
        status: 'completed',
        chargedBy: null,
        stripePaymentIntentId: null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPayments.id, SCHEDULED_PAYMENT_ID));

    await tx.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity: 'info',
      actorId: null,
      actorEmail: 'system-script',
      targetType: 'program_enrollment',
      targetId: String(ENROLLMENT_ID),
      metadata: {
        script: 'apply-denise-parga-venmo-payment-production.ts',
        parentId: PARENT_ID,
        paymentId: payment.id,
        venmo: 'Venmo pay in full',
        amountCents: AMOUNT_CENTS,
        scheduledPaymentId: SCHEDULED_PAYMENT_ID,
      },
    });

    console.log(`Recorded Venmo payment #${payment.id} ($${(AMOUNT_CENTS / 100).toFixed(2)})`);
    console.log(`Marked scheduled payment #${SCHEDULED_PAYMENT_ID} completed`);
  });

  const [after] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);

  console.log('After:', {
    totalCost: after?.totalCost,
    totalPaid: after?.totalPaid,
    remainingBalance: after?.remainingBalance,
    effectiveBalance: computeEffectiveBalance(
      after?.totalCost ?? 0,
      after?.totalPaid ?? 0,
      after?.compAmountCents ?? 0,
    ),
    paymentStatus: after?.paymentStatus,
  });

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
