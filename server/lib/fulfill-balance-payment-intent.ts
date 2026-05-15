import type Stripe from 'stripe';
import { storage } from '../storage';
import { applyClassPoolToEnrollments } from './apply-class-pool-to-enrollments';
import { parseBalanceIntentCredits } from './balance-payment-metadata';
import { fulfillMembershipFromCartPaymentIntent } from '../services/fulfill-membership-payment-intent';

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
  await fulfillMembershipFromCartPaymentIntent(paymentIntent);

  const enrollmentApply = await applyClassPoolToEnrollments(paymentIntent, enrollmentIds);

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

  let payId = paymentHistoryId ?? undefined;
  if (!payId) {
    const row = await storage.getPaymentByStripeId(paymentIntent.id);
    payId = row?.id;
  }

  if (payId) {
    const existingLogs = await storage.getUnifiedCreditUsageLogsByPaymentHistoryId(payId);
    const alreadyUsed = existingLogs.reduce((sum, log) => sum + (log.amountCents || 0), 0);
    if (alreadyUsed >= creditsAppliedCents) {
      return { creditsConsumedCents: alreadyUsed, creditsSkippedAlreadyApplied: true };
    }
    const remainder = creditsAppliedCents - alreadyUsed;
    const { totalUsed } = await storage.useCredits(
      userId,
      remainder,
      payId,
      `Checkout ${paymentIntent.id}`,
    );
    return {
      creditsConsumedCents: alreadyUsed + totalUsed,
      creditsSkippedAlreadyApplied: false,
    };
  }

  const { totalUsed } = await storage.useCredits(
    userId,
    creditsAppliedCents,
    undefined,
    `Checkout ${paymentIntent.id}`,
  );
  return { creditsConsumedCents: totalUsed, creditsSkippedAlreadyApplied: false };
}
