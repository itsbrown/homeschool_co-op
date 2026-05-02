/**
 * Confirm a Stripe test PaymentIntent with one of the supported test PMs.
 *
 * Standard Stripe test cards exposed as named presets so regression tests
 * can opt into the failure mode they want without re-typing tokens:
 *   - visa            → pm_card_visa                       (succeeds)
 *   - chargeDeclined  → pm_card_chargeDeclined             (generic decline)
 *   - expiredCard     → pm_card_chargeDeclinedExpiredCard  (expired-card decline)
 *   - threeDSecure    → pm_card_threeDSecure2Required      (requires_action)
 *
 * Pass `paymentMethod` as the preset name OR a literal `pm_…` token.
 * Pass `expectStatus` to opt into a non-succeeded final status (e.g.
 * 'requires_action' for the 3DS preset). Without it, the helper throws
 * unless the PI ends up succeeded — declined cards throw via Stripe.
 */
import type Stripe from 'stripe';
import { getStripeTestClient } from './stripeTestClient';

export const TEST_PAYMENT_METHODS = {
  visa: 'pm_card_visa',
  chargeDeclined: 'pm_card_chargeDeclined',
  expiredCard: 'pm_card_chargeDeclinedExpiredCard',
  threeDSecure: 'pm_card_threeDSecure2Required',
} as const;

export type TestPaymentMethodPreset = keyof typeof TEST_PAYMENT_METHODS;

export interface ConfirmPaymentIntentInput {
  paymentIntentId: string;
  paymentMethod?: TestPaymentMethodPreset | string;
  returnUrl?: string;
  /** Final PI status the caller expects (default 'succeeded'). */
  expectStatus?: Stripe.PaymentIntent.Status;
}

function resolvePaymentMethod(
  value: TestPaymentMethodPreset | string | undefined,
): string {
  if (!value) return TEST_PAYMENT_METHODS.visa;
  if (value in TEST_PAYMENT_METHODS) {
    return TEST_PAYMENT_METHODS[value as TestPaymentMethodPreset];
  }
  return value;
}

export async function confirmTestPaymentIntent(
  input: ConfirmPaymentIntentInput,
): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripeTestClient();
  const expected = input.expectStatus ?? 'succeeded';

  const existing = await stripe.paymentIntents.retrieve(input.paymentIntentId);
  if (existing.status === 'succeeded') return existing;

  const pi = await stripe.paymentIntents.confirm(input.paymentIntentId, {
    payment_method: resolvePaymentMethod(input.paymentMethod),
    return_url: input.returnUrl ?? 'http://localhost:5000/cart/checkout/success',
  });
  if (pi.status !== expected) {
    throw new Error(
      `confirmTestPaymentIntent: expected status='${expected}', got '${pi.status}' (id=${pi.id})`,
    );
  }
  return pi;
}
