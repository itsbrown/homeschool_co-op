/**
 * One-off: apply a succeeded Stripe PaymentIntent class pool to program_enrollments
 * when payment history shows succeeded but enrollments still owe money.
 *
 * Usage:
 *   npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts pi_3TX0QiGhVuN0nUs71FpbivFk
 *   npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts --from-json ./pi.json
 *
 * Live payments from the Replit *workspace* shell require a live key (dev connector is test mode):
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts pi_...
 *
 * Or use --from-json with Stripe Dashboard event export (no Stripe API call).
 */
import { readFileSync } from 'fs';
import type Stripe from 'stripe';
import { getStripeClient } from '../config/stripe';
import { parseBalanceIntentCredits } from '../lib/balance-payment-metadata';
import { fulfillBalancePaymentIntent } from '../lib/fulfill-balance-payment-intent';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';
import { storage } from '../storage';

function usage(): never {
  console.error(`Usage:
  npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts <payment_intent_id>
  npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts --from-json <path-to-pi.json>

  JSON file: full PaymentIntent object, or Stripe event wrapper { "object": { ...pi } }.

  Live PI from Replit workspace shell (test connector): set STRIPE_SECRET_KEY=sk_live_...`);
  process.exit(1);
}

function loadPaymentIntentFromJson(path: string): Stripe.PaymentIntent {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const pi = (raw.object && typeof raw.object === 'object' ? raw.object : raw) as Stripe.PaymentIntent;
  if (!pi.id?.startsWith('pi_')) {
    throw new Error('JSON must contain a PaymentIntent with id starting with pi_');
  }
  return pi;
}

async function loadPaymentIntent(args: string[]): Promise<Stripe.PaymentIntent> {
  if (args[0] === '--from-json') {
    const jsonPath = args[1];
    if (!jsonPath) usage();
    console.log('📄 Loading PaymentIntent from JSON (no Stripe API call):', jsonPath);
    return loadPaymentIntentFromJson(jsonPath);
  }

  const piId = args[0];
  if (!piId?.startsWith('pi_')) usage();

  try {
    const stripe = await getStripeClient();
    return await stripe.paymentIntents.retrieve(piId);
  } catch (err: unknown) {
    const stripeErr = err as { code?: string; raw?: { headers?: Record<string, string> } };
    if (stripeErr.code === 'resource_missing') {
      const tier = stripeErr.raw?.headers?.['x-stripe-routing-context-priority-tier'] ?? '';
      console.error(`
❌ Stripe returned "No such payment_intent" for ${piId}.

This usually means TEST vs LIVE mismatch:
  • The payment is LIVE (dashboard.stripe.com, livemode: true)
  • Replit workspace shell uses the DEVELOPMENT Stripe connector (test mode)

Fix options:
  1. Export the PI from Stripe Dashboard → run with --from-json (no API key needed)
  2. STRIPE_SECRET_KEY=sk_live_... npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts ${piId}
  3. Run on deployed production (REPLIT_DEPLOYMENT=1) or resend webhook from Stripe Dashboard

Stripe routing tier: ${tier || 'unknown'}`);
    }
    throw err;
  }
}

async function main() {
  const pi = await loadPaymentIntent(process.argv.slice(2));
  const piId = pi.id;

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
