import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';
import { splitCentsEvenly } from '../api/billing';
import {
  enrollmentPoolCentsForBalanceIntent,
  membershipCentsReservedForPaymentIntent,
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
} from './balance-payment-metadata';
import { resolveMembershipReserveForPaymentIntent } from './resolve-membership-reserve-for-payment';
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
 */
export async function applyClassPoolToEnrollments(
  paymentIntent: Pick<Stripe.PaymentIntent, 'amount' | 'metadata'>,
  enrollmentIds: number[],
): Promise<ApplyClassPoolResult> {
  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    return { enrollmentIds: [], appliedCents: 0, skippedCents: 0, classPoolCents: 0 };
  }

  const amountCents = typeof paymentIntent.amount === 'number' ? paymentIntent.amount : 0;
  const meta = paymentIntent.metadata as Record<string, string | undefined>;
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
    return { enrollmentIds: [], appliedCents: 0, skippedCents: 0, classPoolCents: 0 };
  }

  const allocation = splitCentsEvenly(classPoolCents, enrollmentIds.length);

  let appliedCents = 0;
  let skippedCents = 0;
  const updatedIds: number[] = [];

  for (let i = 0; i < enrollmentIds.length; i++) {
    const enrollmentId = enrollmentIds[i];
    const shareCents = allocation[i] ?? 0;
    if (shareCents <= 0) continue;

    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      skippedCents += shareCents;
      continue;
    }

    const totalCost = enrollment.totalCost ?? 0;
    const compAmount = enrollment.compAmountCents ?? 0;
    const owedBefore = computeEffectiveBalance(totalCost, enrollment.totalPaid ?? 0, compAmount);
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
