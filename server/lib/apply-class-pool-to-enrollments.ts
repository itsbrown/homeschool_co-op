import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';
import { splitCentsEvenly } from '../api/billing';
import {
  enrollmentPoolCentsForBalanceIntent,
  parseBalanceIntentCredits,
  parseMetadataMembershipAmountCents,
  totalCentsForBalanceAllocation,
} from './balance-payment-metadata';
import type Stripe from 'stripe';

export type ApplyClassPoolResult = {
  enrollmentIds: number[];
  appliedCents: number;
  skippedCents: number;
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
    return { enrollmentIds: [], appliedCents: 0, skippedCents: 0 };
  }

  const amountCents = typeof paymentIntent.amount === 'number' ? paymentIntent.amount : 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Payment intent amount must be a positive integer in cents');
  }

  const meta = paymentIntent.metadata as Record<string, string | undefined>;
  const membershipCents = parseMetadataMembershipAmountCents(meta);
  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(meta);
  const totalCharged = totalCentsForBalanceAllocation({
    paymentIntentAmountCents: amountCents,
    creditsAppliedCents,
    originalAmountCents,
  });
  const classPoolCents = enrollmentPoolCentsForBalanceIntent(totalCharged, membershipCents);
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

  return { enrollmentIds: updatedIds, appliedCents, skippedCents };
}
