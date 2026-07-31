import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';
import {
  enrollmentPoolCentsForBalanceIntent,
  membershipCentsReservedForPaymentIntent,
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
} from './balance-payment-metadata';
import { resolveMembershipReserveForPaymentIntent } from './resolve-membership-reserve-for-payment';
import { allocatePaymentByBalance } from './splitIntegerEvenly';
import {
  applyFreeAfterCompsFromSnapshot,
  parseDiscountSnapshotFromPaymentIntentMetadata,
} from './checkout-discount-snapshot';
import type Stripe from 'stripe';

export type ApplyClassPoolResult = {
  enrollmentIds: number[];
  appliedCents: number;
  skippedCents: number;
  classPoolCents: number;
};

/**
 * Apply the class portion of a balance/cart PaymentIntent to program enrollments.
 * Caps each share at remaining owed so webhook replays do not over-credit.
 *
 * Free-after-threshold comps are applied from PI metadata before allocation so
 * free lines have $0 effective balance; cash is then split by balance (not evenly).
 */
export async function applyClassPoolToEnrollments(
  paymentIntent: Pick<Stripe.PaymentIntent, 'amount' | 'metadata'>,
  enrollmentIds: number[],
): Promise<ApplyClassPoolResult> {
  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    return { enrollmentIds: [], appliedCents: 0, skippedCents: 0, classPoolCents: 0 };
  }

  const meta = paymentIntent.metadata as Record<string, string | undefined>;
  const discountSnapshot = parseDiscountSnapshotFromPaymentIntentMetadata(meta);
  if (discountSnapshot) {
    await applyFreeAfterCompsFromSnapshot(discountSnapshot);
  }

  const amountCents = typeof paymentIntent.amount === 'number' ? paymentIntent.amount : 0;
  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(meta);

  const resolved = await resolveMembershipReserveForPaymentIntent(paymentIntent);
  const totalCharged =
    resolved?.allocationGrossCents ??
    totalCentsForBalanceAllocation({
      paymentIntentAmountCents: amountCents,
      creditsAppliedCents,
      originalAmountCents,
    });

  if (!Number.isInteger(totalCharged) || totalCharged <= 0) {
    throw new Error('Payment allocation gross must be a positive integer in cents');
  }

  const membershipCents =
    resolved?.membershipPortionThisPaymentCents ??
    membershipCentsReservedForPaymentIntent(amountCents, meta, {
      allocationGrossCents: totalCharged,
    });
  const classPoolCents =
    resolved?.classPoolCents ?? enrollmentPoolCentsForBalanceIntent(totalCharged, membershipCents);

  if (classPoolCents <= 0) {
    // Still mark free-after enrollments enrolled if comps zeroed them.
    if (discountSnapshot?.freeEnrollmentIds?.length) {
      for (const enrollmentId of discountSnapshot.freeEnrollmentIds) {
        const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
        if (!enrollment) continue;
        const owed = computeEffectiveBalance(
          enrollment.totalCost ?? 0,
          enrollment.totalPaid ?? 0,
          enrollment.compAmountCents ?? 0,
        );
        if (owed <= 0 && enrollment.status !== 'enrolled') {
          await storage.updateProgramEnrollment(enrollment.id, {
            remainingBalance: 0,
            paymentStatus: 'completed',
            paymentSystemVersion: 'v2_stripe',
            status: 'enrolled',
          });
        }
      }
    }
    return { enrollmentIds: [], appliedCents: 0, skippedCents: 0, classPoolCents: 0 };
  }

  const balanceInputs: { enrollmentId: number; effectiveBalanceCents: number }[] = [];
  for (const enrollmentId of enrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      balanceInputs.push({ enrollmentId, effectiveBalanceCents: 0 });
      continue;
    }
    const owed = computeEffectiveBalance(
      enrollment.totalCost ?? 0,
      enrollment.totalPaid ?? 0,
      enrollment.compAmountCents ?? 0,
    );
    balanceInputs.push({ enrollmentId, effectiveBalanceCents: owed });
  }

  const allocation = allocatePaymentByBalance(classPoolCents, balanceInputs);
  const shareByEnrollmentId = new Map(
    allocation.map((row) => [row.enrollmentId, row.amountCents]),
  );

  let appliedCents = 0;
  let skippedCents = 0;
  const updatedIds: number[] = [];

  for (const enrollmentId of enrollmentIds) {
    const shareCents = shareByEnrollmentId.get(enrollmentId) ?? 0;

    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      skippedCents += shareCents;
      continue;
    }

    const totalCost = enrollment.totalCost ?? 0;
    const compAmount = enrollment.compAmountCents ?? 0;
    const owedBefore = computeEffectiveBalance(totalCost, enrollment.totalPaid ?? 0, compAmount);

    // Free-after (or already paid) lines: ensure enrolled status even with $0 cash.
    if (owedBefore <= 0) {
      if (shareCents > 0) {
        skippedCents += shareCents;
      }
      if (enrollment.status !== 'enrolled' || (enrollment.remainingBalance ?? 0) > 0) {
        await storage.updateProgramEnrollment(enrollment.id, {
          remainingBalance: 0,
          paymentStatus: 'completed',
          paymentSystemVersion: 'v2_stripe',
          status: 'enrolled',
        });
        updatedIds.push(enrollment.id);
      }
      continue;
    }

    if (shareCents <= 0) continue;

    const toApply = Math.min(shareCents, owedBefore);
    if (toApply <= 0) {
      skippedCents += shareCents;
      continue;
    }

    const newAmountPaid = (enrollment.totalPaid ?? 0) + toApply;
    const remainingBalance = Math.max(0, totalCost - newAmountPaid - compAmount);
    const paymentStatus = remainingBalance <= 0 ? 'completed' : 'partial_payment';

    await storage.updateProgramEnrollment(enrollment.id, {
      totalPaid: newAmountPaid,
      remainingBalance,
      paymentStatus,
      paymentSystemVersion: 'v2_stripe',
      status: 'enrolled',
    });

    appliedCents += toApply;
    skippedCents += shareCents - toApply;
    updatedIds.push(enrollment.id);
  }

  // Grade Placement: after session tuition receives payment, refresh auto-place rosters
  try {
    const sessionKeys = new Set<string>();
    for (const enrollmentId of updatedIds) {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (!enrollment?.sessionId || !enrollment.schoolId) continue;
      if (enrollment.placementSource === 'grade') continue;
      sessionKeys.add(`${enrollment.schoolId}:${enrollment.sessionId}`);
    }
    if (sessionKeys.size > 0) {
      const { syncGradePlacementsForSession } = await import(
        '../services/grade-placement-sync'
      );
      for (const key of sessionKeys) {
        const [schoolIdStr, sessionIdStr] = key.split(':');
        await syncGradePlacementsForSession(
          Number(schoolIdStr),
          Number(sessionIdStr),
        );
      }
    }
  } catch (err) {
    console.warn('[grade-placement] post-payment sync failed:', err);
  }

  return { enrollmentIds: updatedIds, appliedCents, skippedCents, classPoolCents };
}
