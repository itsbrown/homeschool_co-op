/**
 * Production: Grant Lauren Daggs a $90 manual credit and apply it to her
 * Spring 2026 enrollment balance (Jack Hamilton, enrollment #387).
 *
 * Run:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-lauren-daggs-spring-credit-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-lauren-daggs-spring-credit-production.ts
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  auditLogs,
  credits,
  payments,
  programEnrollments,
  unifiedCreditUsageLogs,
  type CreditStatus,
} from '../../shared/schema';
import { storage } from '../storage';
import { computeEffectiveBalance } from '../../shared/schema';

const PARENT_ID = 130;
const PARENT_EMAIL = 'hamiltonhomescleaningco@gmail.com';
const SCHOOL_ID = 2;
const ENROLLMENT_ID = 387;
const CREDIT_AMOUNT_CENTS = 9000;

const DRY_RUN = process.argv.includes('--dry-run');

function buildSyntheticPaymentIntentId(creditId: number): string {
  const key = [PARENT_ID, ENROLLMENT_ID, creditId, 'lauren_spring_final_credit'].join('|');
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `credit_correction_${hash}`;
}

async function main() {
  const db = await getDb();

  console.log('='.repeat(70));
  console.log('LAUREN DAGGS — GRANT + APPLY $90 SPRING FINAL CREDIT');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Parent: ${PARENT_EMAIL} (id ${PARENT_ID})`);
  console.log('');

  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);

  if (!enrollment || enrollment.parentId !== PARENT_ID) {
    throw new Error(`Enrollment #${ENROLLMENT_ID} not found for parent ${PARENT_ID}`);
  }

  const totalCost = enrollment.totalCost ?? 0;
  const totalPaid = enrollment.totalPaid ?? 0;
  const compAmountCents = enrollment.compAmountCents ?? 0;
  const owedBefore = computeEffectiveBalance(totalCost, totalPaid, compAmountCents);

  console.log(
    `Enrollment #${ENROLLMENT_ID} (${enrollment.childName}): owed $${(owedBefore / 100).toFixed(2)} before correction`,
  );

  if (owedBefore <= 0) {
    console.log('Nothing owed — no credit application needed.');
    process.exit(0);
  }

  const creditToApply = Math.min(CREDIT_AMOUNT_CENTS, owedBefore);
  const afterTotalPaid = totalPaid + creditToApply;
  const afterRemainingBalance = computeEffectiveBalance(totalCost, afterTotalPaid, compAmountCents);
  const afterPaymentStatus = afterRemainingBalance <= 0 ? 'completed' : 'partial_payment';

  if (DRY_RUN) {
    console.log(`Would create $${(CREDIT_AMOUNT_CENTS / 100).toFixed(2)} approved manual credit`);
    console.log(
      `Would apply $${(creditToApply / 100).toFixed(2)} → paid $${(afterTotalPaid / 100).toFixed(2)}, owed $${(afterRemainingBalance / 100).toFixed(2)}`,
    );
    process.exit(0);
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const credit = await storage.createCredit({
    userId: PARENT_ID,
    schoolId: SCHOOL_ID,
    creditType: 'manual',
    sourceType: 'spring_final_balance',
    creditAmountCents: CREDIT_AMOUNT_CENTS,
    status: 'approved',
    title: 'Spring 2026 final balance credit',
    description: 'Covers remaining Spring 2026 tuition balance for Jack Hamilton',
    notes: 'Admin grant — final Spring session balance covered via credit',
    expiresAt,
    approvedBy: null,
    approvedAt: new Date(),
  });

  const syntheticPaymentIntentId = buildSyntheticPaymentIntentId(credit.id);
  const existingPayment = await storage.getPaymentByStripeId(syntheticPaymentIntentId);
  if (existingPayment) {
    console.log(`Idempotency: correction payment #${existingPayment.id} already exists — nothing to do.`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const [createdPayment] = await tx
      .insert(payments)
      .values({
        schoolId: SCHOOL_ID,
        parentId: PARENT_ID,
        parentEmail: PARENT_EMAIL,
        amount: 0,
        currency: 'usd',
        childName: enrollment.childName ?? 'Jack Hamilton',
        className: enrollment.className ?? 'Spring 2026',
        description: 'Admin correction — Spring final balance credit applied',
        status: 'completed',
        stripePaymentIntentId: syntheticPaymentIntentId,
        stripeChargeId: null,
        stripeRefundId: null,
        paymentMethod: 'other',
        enrollmentIds: [ENROLLMENT_ID],
        originalPaymentId: null,
        paymentDate: new Date(),
        metadata: {
          source: 'admin_credit_correction',
          creditsAppliedCents: creditToApply,
          creditId: credit.id,
          script: 'apply-lauren-daggs-spring-credit-production.ts',
        },
      })
      .returning();

    await tx.insert(unifiedCreditUsageLogs).values({
      creditId: credit.id,
      paymentHistoryId: null,
      amountCents: creditToApply,
      description: `Spring final balance credit applied (payment #${createdPayment.id})`,
    });

    const newStatus: CreditStatus =
      creditToApply >= credit.creditAmountCents ? 'used' : 'partially_used';

    await tx
      .update(credits)
      .set({ usedAmountCents: creditToApply, status: newStatus, updatedAt: new Date() })
      .where(eq(credits.id, credit.id));

    await tx
      .update(programEnrollments)
      .set({
        totalPaid: afterTotalPaid,
        remainingBalance: afterRemainingBalance,
        paymentStatus: afterPaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, ENROLLMENT_ID));

    await tx.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity: 'info',
      actorId: null,
      actorEmail: 'system-script',
      targetType: 'user',
      targetId: String(PARENT_ID),
      metadata: {
        script: 'apply-lauren-daggs-spring-credit-production.ts',
        parentEmail: PARENT_EMAIL,
        creditId: credit.id,
        enrollmentId: ENROLLMENT_ID,
        creditsAppliedCents: creditToApply,
        syntheticPaymentIntentId,
        paymentId: createdPayment.id,
      },
    });
  });

  const [after] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);

  const owedAfter = computeEffectiveBalance(
    after?.totalCost ?? 0,
    after?.totalPaid ?? 0,
    after?.compAmountCents ?? 0,
  );

  console.log(`Credit #${credit.id} created and applied.`);
  console.log(
    `After: owed $${(owedAfter / 100).toFixed(2)} (paid $${((after?.totalPaid ?? 0) / 100).toFixed(2)}) — ${after?.paymentStatus}`,
  );
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
