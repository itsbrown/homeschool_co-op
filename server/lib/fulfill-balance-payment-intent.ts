import type Stripe from 'stripe';
import { storage } from '../storage';
import { applyClassPoolToEnrollments } from './apply-class-pool-to-enrollments';
import { parseBalanceIntentCredits } from './balance-payment-metadata';
import { applyMembershipFulfillmentFromCartPaymentIntent } from '../services/membership-fulfill-from-cart-intent';
import { persistPaymentAllocationBreakdown } from './persist-payment-allocation-breakdown';
import { resolveMembershipReserveForPaymentIntent } from './resolve-membership-reserve-for-payment';

export type FulfillBalancePaymentIntentResult = {
  enrollmentApply: Awaited<ReturnType<typeof applyClassPoolToEnrollments>>;
  creditsConsumedCents: number;
  creditsSkippedAlreadyApplied: boolean;
};

/**
 * Apply membership + class pool + credit consumption for a succeeded balance/cart PI.
 * Safe to replay: enrollment shares are capped at owed; credits skip if already logged on payment row.
 */
export async function fulfillBalancePaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'amount' | 'metadata'>,
  enrollmentIds: number[],
  options?: { paymentHistoryId?: number | null },
): Promise<FulfillBalancePaymentIntentResult> {
  const membershipBreakdown = await applyMembershipFulfillmentFromCartPaymentIntent(paymentIntent);

  const enrollmentApply = await applyClassPoolToEnrollments(paymentIntent, enrollmentIds);

  const resolved = await resolveMembershipReserveForPaymentIntent(paymentIntent);
  const breakdown =
    membershipBreakdown ??
    (resolved
      ? {
          membershipCents: resolved.membershipPortionThisPaymentCents,
          classPoolCents: resolved.classPoolCents,
          grossCents: resolved.allocationGrossCents,
          paymentIntentId: paymentIntent.id,
        }
      : null);

  if (breakdown && breakdown.grossCents > 0) {
    await persistPaymentAllocationBreakdown(paymentIntent.id, breakdown);
  }

  const { creditsConsumedCents, creditsSkippedAlreadyApplied } =
    await consumeCreditsFromPaymentIntentMetadata(paymentIntent, options?.paymentHistoryId);

  return { enrollmentApply, creditsConsumedCents, creditsSkippedAlreadyApplied };
}

export async function consumeCreditsFromPaymentIntentMetadata(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'metadata'>,
  paymentHistoryId?: number | null,
): Promise<{ creditsConsumedCents: number; creditsSkippedAlreadyApplied: boolean }> {
  const meta = paymentIntent.metadata as Record<string, string | undefined>;
  const { creditsAppliedCents } = parseBalanceIntentCredits(meta);
  const userId = parseInt(String(meta.userId || '0'), 10) || 0;

  if (creditsAppliedCents <= 0 || userId <= 0) {
    return { creditsConsumedCents: 0, creditsSkippedAlreadyApplied: true };
  }

  const checkoutDescription = `Checkout ${paymentIntent.id}`;
  const checkoutLogs = await storage.getUnifiedCreditUsageLogsByCheckoutPaymentIntentId(paymentIntent.id);
  const alreadyFromCheckout = checkoutLogs.reduce((sum, log) => sum + (log.amountCents || 0), 0);
  if (alreadyFromCheckout >= creditsAppliedCents) {
    return { creditsConsumedCents: alreadyFromCheckout, creditsSkippedAlreadyApplied: true };
  }

  let stripeHistoryId = paymentHistoryId ?? undefined;
  if (!stripeHistoryId) {
    const stripeHist = await storage.getStripePaymentByIntentId(paymentIntent.id);
    stripeHistoryId = stripeHist?.id;
  }

  if (stripeHistoryId) {
    const existingLogs = await storage.getUnifiedCreditUsageLogsByPaymentHistoryId(stripeHistoryId);
    const alreadyUsed = existingLogs.reduce((sum, log) => sum + (log.amountCents || 0), 0);
    if (alreadyUsed >= creditsAppliedCents) {
      return { creditsConsumedCents: alreadyUsed, creditsSkippedAlreadyApplied: true };
    }
    const remainder = creditsAppliedCents - Math.max(alreadyFromCheckout, alreadyUsed);
    if (remainder <= 0) {
      return {
        creditsConsumedCents: Math.max(alreadyFromCheckout, alreadyUsed),
        creditsSkippedAlreadyApplied: true,
      };
    }
    const { totalUsed } = await storage.useCredits(
      userId,
      remainder,
      stripeHistoryId,
      checkoutDescription,
    );
    return {
      creditsConsumedCents: Math.max(alreadyFromCheckout, alreadyUsed) + totalUsed,
      creditsSkippedAlreadyApplied: false,
    };
  }

  const remainder = creditsAppliedCents - alreadyFromCheckout;
  const { totalUsed } = await storage.useCredits(userId, remainder, undefined, checkoutDescription);
  return {
    creditsConsumedCents: alreadyFromCheckout + totalUsed,
    creditsSkippedAlreadyApplied: false,
  };
}
