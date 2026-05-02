/** Shared Stripe TEST client. Refuses any non-sk_test_ key. */
import type Stripe from 'stripe';
import { getStripeClient, getStripeSecretKey } from '../../../../config/stripe';

let cached: Stripe | null = null;

function bridgeStripeTestEnv(): void {
  if (process.env.STRIPE_TEST_SECRET_KEY && !process.env.TESTING_STRIPE_SECRET_KEY) {
    process.env.TESTING_STRIPE_SECRET_KEY = process.env.STRIPE_TEST_SECRET_KEY;
  }
}

export async function getStripeTestClient(): Promise<Stripe> {
  if (cached) return cached;
  bridgeStripeTestEnv();
  const secretKey = await getStripeSecretKey();
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error(
      'stripeTestClient: STRIPE_TEST_SECRET_KEY (or TESTING_STRIPE_SECRET_KEY) must be sk_test_*.',
    );
  }
  cached = await getStripeClient();
  return cached;
}

export function resetStripeTestClient(): void {
  cached = null;
}
