/**
 * Production Fix: Apply available aide credits to Kari Wing's class enrollments.
 *
 * Parent: sleary212@yahoo.com (user id 90, school_id 2)
 * Enrollments: 272 (Winter Seekers), 415 (Spring Seekers)
 *
 * Credits are consumed FIFO via unified ledger + usage logs, then applied to
 * enrollment total_paid oldest-enrollment-first (matches balance-payment allocation).
 *
 * Run (prod):
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-kari-wing-credits-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-kari-wing-credits-production.ts
 */

import crypto from 'crypto';
import { and, asc, eq, or, isNull, gt } from 'drizzle-orm';
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

const PARENT_ID = 90;
const PARENT_EMAIL = 'sleary212@yahoo.com';
const SCHOOL_ID = 2;
const ENROLLMENT_IDS = [272, 415] as const;

const DRY_RUN = process.argv.includes('--dry-run');

function buildSyntheticPaymentIntentId(): string {
  const key = [PARENT_ID, [...ENROLLMENT_IDS].join(','), 'apply_aide_credits'].join('|');
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `credit_correction_${hash}`;
}

type EnrollmentSnapshot = {
  id: number;
  childName: string | null;
  className: string | null;
  totalCost: number;
  totalPaid: number;
  compAmountCents: number;
  effectiveBalance: number;
  remainingBalance: number | null;
  paymentStatus: string | null;
};

type CreditAllocation = {
  enrollmentId: number;
  creditCents: number;
  before: EnrollmentSnapshot;
  afterTotalPaid: number;
  afterRemainingBalance: number;
  afterPaymentStatus: string;
};

async function loadEnrollments(db: Awaited<ReturnType<typeof getDb>>): Promise<EnrollmentSnapshot[]> {
  const rows = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.parentId, PARENT_ID));

  const filtered = rows
    .filter((e) => ENROLLMENT_IDS.includes(e.id as (typeof ENROLLMENT_IDS)[number]))
    .sort((a, b) => a.id - b.id);

  if (filtered.length !== ENROLLMENT_IDS.length) {
    throw new Error(`Expected enrollments ${ENROLLMENT_IDS.join(', ')}; found ${filtered.map((e) => e.id).join(', ')}`);
  }

  return filtered.map((e) => {
    const totalCost = e.totalCost ?? 0;
    const totalPaid = e.totalPaid ?? 0;
    const compAmountCents = e.compAmountCents ?? 0;
    return {
      id: e.id,
      childName: e.childName,
      className: e.className,
      totalCost,
      totalPaid,
      compAmountCents,
      effectiveBalance: computeEffectiveBalance(totalCost, totalPaid, compAmountCents),
      remainingBalance: e.remainingBalance,
      paymentStatus: e.paymentStatus,
    };
  });
}

async function loadAvailableCredits(db: Awaited<ReturnType<typeof getDb>>) {
  const now = new Date();
  return db
    .select()
    .from(credits)
    .where(
      and(
        eq(credits.userId, PARENT_ID),
        eq(credits.schoolId, SCHOOL_ID),
        or(eq(credits.status, 'approved'), eq(credits.status, 'partially_used')),
        or(isNull(credits.expiresAt), gt(credits.expiresAt, now)),
      ),
    )
    .orderBy(asc(credits.createdAt));
}

function allocateCreditsToEnrollments(
  enrollments: EnrollmentSnapshot[],
  totalCreditCents: number,
): CreditAllocation[] {
  let remaining = totalCreditCents;
  const allocations: CreditAllocation[] = [];

  for (const enrollment of enrollments) {
    if (remaining <= 0) break;
    const owed = enrollment.effectiveBalance;
    if (owed <= 0) continue;

    const creditCents = Math.min(owed, remaining);
    const afterTotalPaid = enrollment.totalPaid + creditCents;
    const afterRemainingBalance = computeEffectiveBalance(
      enrollment.totalCost,
      afterTotalPaid,
      enrollment.compAmountCents,
    );

    allocations.push({
      enrollmentId: enrollment.id,
      creditCents,
      before: enrollment,
      afterTotalPaid,
      afterRemainingBalance,
      afterPaymentStatus: afterRemainingBalance <= 0 ? 'completed' : 'partial_payment',
    });
    remaining -= creditCents;
  }

  return allocations;
}

async function applyKariWingCredits() {
  const db = await getDb();
  const syntheticPaymentIntentId = buildSyntheticPaymentIntentId();

  console.log('='.repeat(70));
  console.log('KARI WING — APPLY AIDE CREDITS TO CLASS BALANCES');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Parent: ${PARENT_EMAIL} (id ${PARENT_ID})`);
  console.log(`Synthetic payment id: ${syntheticPaymentIntentId}`);
  console.log('');

  const existingPayment = await storage.getPaymentByStripeId(syntheticPaymentIntentId);
  if (existingPayment) {
    console.log(`Idempotency: correction payment #${existingPayment.id} already exists — nothing to do.`);
    process.exit(0);
  }

  const enrollments = await loadEnrollments(db);
  const availableCreditRows = await loadAvailableCredits(db);
  const totalAvailableCents = availableCreditRows.reduce(
    (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents ?? 0)),
    0,
  );
  const totalOwedCents = enrollments.reduce((sum, e) => sum + e.effectiveBalance, 0);
  const creditsToApply = Math.min(totalAvailableCents, totalOwedCents);

  console.log('Credits on file:');
  for (const c of availableCreditRows) {
    const available = c.creditAmountCents - (c.usedAmountCents ?? 0);
    console.log(
      `  #${c.id} ${c.title ?? c.creditType}: $${(available / 100).toFixed(2)} available (${c.status})`,
    );
  }
  console.log(`  Total available: $${(totalAvailableCents / 100).toFixed(2)}`);
  console.log('');

  console.log('Enrollments (before):');
  for (const e of enrollments) {
    console.log(
      `  #${e.id} ${e.childName} — ${e.className}: owed $${(e.effectiveBalance / 100).toFixed(2)} (paid $${(e.totalPaid / 100).toFixed(2)} / $${(e.totalCost / 100).toFixed(2)})`,
    );
  }
  console.log(`  Total class balance owed: $${(totalOwedCents / 100).toFixed(2)}`);
  console.log('');

  if (creditsToApply <= 0) {
    console.log('No credits to apply (none available or nothing owed).');
    process.exit(0);
  }

  const allocations = allocateCreditsToEnrollments(enrollments, creditsToApply);

  console.log(`Applying $${(creditsToApply / 100).toFixed(2)} in credits:`);
  for (const a of allocations) {
    console.log(
      `  Enrollment #${a.enrollmentId}: +$${(a.creditCents / 100).toFixed(2)} → paid $${(a.afterTotalPaid / 100).toFixed(2)}, owed $${(a.afterRemainingBalance / 100).toFixed(2)} (${a.afterPaymentStatus})`,
    );
  }
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete — no changes made.');
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
        childName: 'Jaxton Wing',
        className: allocations.length > 1 ? `${allocations.length} classes` : allocations[0]?.before.className ?? 'Class',
        description: 'Admin correction — aide credits applied to class balances',
        status: 'completed',
        stripePaymentIntentId: syntheticPaymentIntentId,
        stripeChargeId: null,
        stripeRefundId: null,
        paymentMethod: 'other',
        enrollmentIds: allocations.map((a) => a.enrollmentId),
        originalPaymentId: null,
        paymentDate: new Date(),
        metadata: {
          source: 'admin_credit_correction',
          creditsAppliedCents: creditsToApply,
          script: 'apply-kari-wing-credits-production.ts',
        },
      })
      .returning();

    let remainingToConsume = creditsToApply;
    const creditUsage: Array<{ creditId: number; amountCents: number; title: string | null }> = [];

    for (const credit of availableCreditRows) {
      if (remainingToConsume <= 0) break;
      const availableFromCredit = credit.creditAmountCents - (credit.usedAmountCents ?? 0);
      if (availableFromCredit <= 0) continue;

      const amountToUse = Math.min(availableFromCredit, remainingToConsume);
      await tx.insert(unifiedCreditUsageLogs).values({
        creditId: credit.id,
        paymentHistoryId: null,
        amountCents: amountToUse,
        description: `Admin correction — aide credits applied to class balances (payment #${createdPayment.id})`,
      });

      const newUsedAmount = (credit.usedAmountCents ?? 0) + amountToUse;
      const newStatus: CreditStatus =
        newUsedAmount >= credit.creditAmountCents ? 'used' : 'partially_used';

      await tx
        .update(credits)
        .set({ usedAmountCents: newUsedAmount, status: newStatus, updatedAt: new Date() })
        .where(eq(credits.id, credit.id));

      creditUsage.push({ creditId: credit.id, amountCents: amountToUse, title: credit.title });
      remainingToConsume -= amountToUse;
    }

    if (remainingToConsume > 0) {
      throw new Error(`Credit consumption shortfall: ${remainingToConsume} cents remaining`);
    }

    for (const allocation of allocations) {
      await tx
        .update(programEnrollments)
        .set({
          totalPaid: allocation.afterTotalPaid,
          remainingBalance: allocation.afterRemainingBalance,
          paymentStatus: allocation.afterPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(programEnrollments.id, allocation.enrollmentId));
    }

    await tx.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity: 'info',
      actorId: null,
      actorEmail: 'system-script',
      targetType: 'user',
      targetId: String(PARENT_ID),
      metadata: {
        script: 'apply-kari-wing-credits-production.ts',
        parentEmail: PARENT_EMAIL,
        syntheticPaymentIntentId,
        paymentId: createdPayment.id,
        creditsAppliedCents: creditsToApply,
        creditUsage,
        allocations: allocations.map((a) => ({
          enrollmentId: a.enrollmentId,
          creditCents: a.creditCents,
          before: {
            totalPaid: a.before.totalPaid,
            effectiveBalance: a.before.effectiveBalance,
            paymentStatus: a.before.paymentStatus,
          },
          after: {
            totalPaid: a.afterTotalPaid,
            effectiveBalance: a.afterRemainingBalance,
            paymentStatus: a.afterPaymentStatus,
          },
        })),
      },
    });
  });

  const afterEnrollments = await loadEnrollments(db);
  const afterCredits = await loadAvailableCredits(db);
  const afterAvailable = afterCredits.reduce(
    (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents ?? 0)),
    0,
  );

  console.log('After correction:');
  for (const e of afterEnrollments) {
    console.log(
      `  #${e.id}: owed $${(e.effectiveBalance / 100).toFixed(2)} (paid $${(e.totalPaid / 100).toFixed(2)}) — ${e.paymentStatus}`,
    );
  }
  console.log(`  Remaining credits available: $${(afterAvailable / 100).toFixed(2)}`);
  console.log('');
  console.log('Correction complete.');
}

applyKariWingCredits().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
