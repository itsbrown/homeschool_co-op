import type Stripe from 'stripe';
import { applyMembershipFulfillmentFromCartPaymentIntent } from './membership-fulfill-from-cart-intent';

/**
 * Creates or updates membership enrollment when PaymentIntent metadata includes
 * hasMembership (same rules as legacy /api/stripe-webhooks handler).
 * Safe to call on the verified /api/stripe/webhook path; errors are logged, not thrown.
 */
export async function fulfillMembershipFromCartPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'customer' | 'metadata'>,
): Promise<void> {
  await applyMembershipFulfillmentFromCartPaymentIntent(paymentIntent);
}
