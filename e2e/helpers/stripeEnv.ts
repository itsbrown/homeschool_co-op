/** Stripe's documented sample secret — accepted by client init, rejected by the API. */
const STRIPE_DOCS_SAMPLE_SECRET = "sk_test_4eC39HqLyjWDarjtT1ColDPY";

/**
 * True when CI/local has a real Stripe *test* secret (not empty, not the docs sample).
 * Payment E2E that create PaymentIntents / Checkout Sessions should skip otherwise.
 */
export function isRealStripeTestSecretConfigured(): boolean {
  const key = (
    process.env.TESTING_STRIPE_SECRET_KEY ||
    process.env.STRIPE_TEST_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    ""
  ).trim();
  if (!key || key === STRIPE_DOCS_SAMPLE_SECRET) return false;
  return key.startsWith("sk_test_");
}
