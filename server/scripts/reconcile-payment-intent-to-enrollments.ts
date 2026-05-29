/**
 * One-off: apply a succeeded Stripe PaymentIntent class pool to program_enrollments
 * when payment history shows succeeded but enrollments still owe money.
 *
 * Usage:
 *   npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts pi_3TX0QiGhVuN0nUs71FpbivFk
 *
 * Requires DATABASE_URL and STRIPE_SECRET_KEY (or TESTING_STRIPE_SECRET_KEY).
 */
import { getStripeClient } from '../config/stripe';
import { parseBalanceIntentCredits } from '../lib/balance-payment-metadata';
import { fulfillBalancePaymentIntent } from '../lib/fulfill-balance-payment-intent';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';
import { storage } from '../storage';

async function main() {
  const piId = process.argv[2];
  if (!piId?.startsWith('pi_')) {
    console.error('Usage: npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts <payment_intent_id>');
    process.exit(1);
  }

  const stripe = await getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.status !== 'succeeded') {
    console.error(`PaymentIntent ${piId} status is ${pi.status}, not succeeded`);
    process.exit(1);
  }

  let enrollmentIds: number[] = [];
  try {
    enrollmentIds = JSON.parse(pi.metadata?.enrollmentIds || '[]');
  } catch {
    console.error('Could not parse metadata.enrollmentIds');
    process.exit(1);
  }

  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    console.error('No enrollmentIds on PaymentIntent metadata');
    process.exit(1);
  }

  console.log('PaymentIntent:', piId, 'amount:', pi.amount, 'parent:', pi.metadata?.parentEmail);
  console.log('Enrollment IDs from metadata:', enrollmentIds);

  for (const id of enrollmentIds) {
    const before = await storage.getProgramEnrollmentById(id);
    if (before) {
      console.log(
        `  Before #${id}: totalPaid=${before.totalPaid} totalCost=${before.totalCost} remaining=${before.remainingBalance} status=${before.status}`,
      );
    } else {
      console.log(`  Before #${id}: NOT FOUND`);
    }
  }

  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(
    pi.metadata as Record<string, string | undefined>,
  );
  console.log('Credits in PI metadata:', { creditsAppliedCents, originalAmountCents, cardCents: pi.amount });

  const existingPay = await storage.getPaymentByStripeId(piId);
  const result = await fulfillBalancePaymentIntent(pi, enrollmentIds, {
    paymentHistoryId: existingPay?.id,
  });
  console.log('Fulfillment result:', result);

  const planService = new StripePaymentPlanService(storage as any);
  const scheduled = await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(pi);
  console.log('Scheduled payments created/existing:', scheduled.length);

  for (const id of enrollmentIds) {
    const after = await storage.getProgramEnrollmentById(id);
    if (after) {
      console.log(
        `  After #${id}: totalPaid=${after.totalPaid} totalCost=${after.totalCost} remaining=${after.remainingBalance} status=${after.status}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
