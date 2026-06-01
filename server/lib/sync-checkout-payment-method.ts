import type Stripe from 'stripe';
import { getStripeClient } from '../config/stripe';
import { storage } from '../storage';

export type SyncCheckoutPaymentMethodResult =
  | {
      ok: true;
      customerId: string;
      paymentMethodId: string;
      autoPayEnabled: boolean;
    }
  | {
      ok: false;
      reason: 'user_not_found' | 'payment_intent_not_found' | 'payment_not_succeeded' | 'no_payment_method';
      message: string;
    };

/**
 * After first checkout, attach the card used on the PaymentIntent to the parent
 * (users.stripe_customer_id + stripe_default_payment_method_id) so auto-pay works.
 * Checkout PIs historically did not persist PMs — E2E used /api/test/sync-parent-stripe-for-e2e.
 */
export async function syncParentPaymentMethodFromPaymentIntent(
  parentEmail: string,
  paymentIntentId: string,
  options?: { enableAutoPay?: boolean },
): Promise<SyncCheckoutPaymentMethodResult> {
  const email = parentEmail.trim();
  if (!email) {
    return { ok: false, reason: 'user_not_found', message: 'Parent email required' };
  }

  const user = await storage.getUserByEmail(email);
  if (!user) {
    return { ok: false, reason: 'user_not_found', message: `User not found: ${email}` };
  }

  const stripe = await getStripeClient();
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return {
      ok: false,
      reason: 'payment_intent_not_found',
      message: `PaymentIntent not found: ${paymentIntentId}`,
    };
  }

  if (paymentIntent.status !== 'succeeded') {
    return {
      ok: false,
      reason: 'payment_not_succeeded',
      message: `PaymentIntent status is ${paymentIntent.status}`,
    };
  }

  const metaEmail = paymentIntent.metadata?.parentEmail?.trim();
  if (metaEmail && metaEmail.toLowerCase() !== email.toLowerCase()) {
    return {
      ok: false,
      reason: 'payment_intent_not_found',
      message: 'PaymentIntent does not belong to this parent',
    };
  }

  let customerId = user.stripeCustomerId ?? null;
  if (!customerId) {
    const piCustomer = paymentIntent.customer;
    if (typeof piCustomer === 'string') {
      customerId = piCustomer;
    } else if (piCustomer && typeof piCustomer === 'object' && 'id' in piCustomer) {
      customerId = String((piCustomer as { id: string }).id);
    }
  }
  if (!customerId) {
    const search = await stripe.customers.search({
      query: `email:'${email.replace(/'/g, "\\'")}'`,
    });
    customerId = search.data[0]?.id ?? null;
  }
  if (!customerId) {
    const created = await stripe.customers.create({
      email,
      name: user.name || undefined,
      metadata: { userId: String(user.id) },
    });
    customerId = created.id;
  }

  let paymentMethodId: string | null = null;
  const pmFromIntent = paymentIntent.payment_method;
  if (typeof pmFromIntent === 'string') {
    paymentMethodId = pmFromIntent;
  } else if (pmFromIntent && typeof pmFromIntent === 'object' && 'id' in pmFromIntent) {
    paymentMethodId = String((pmFromIntent as { id: string }).id);
  }

  if (!paymentMethodId) {
    const attached = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    paymentMethodId = attached.data[0]?.id ?? null;
  }

  if (!paymentMethodId) {
    const intents = await stripe.paymentIntents.list({ customer: customerId, limit: 10 });
    const succeeded = intents.data.find((pi) => pi.status === 'succeeded');
    const pm = succeeded?.payment_method;
    if (typeof pm === 'string') {
      paymentMethodId = pm;
    } else if (pm && typeof pm === 'object' && 'id' in pm) {
      paymentMethodId = String((pm as { id: string }).id);
    }
  }

  if (!paymentMethodId) {
    return {
      ok: false,
      reason: 'no_payment_method',
      message: 'No card found on this payment',
    };
  }

  // Prefer the customer already owning this payment method (if any).
  // This avoids updating defaults on a different customer and failing with:
  // "customer does not have a payment method with the ID ...".
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomer = typeof pm.customer === 'string' ? pm.customer : null;
    if (pmCustomer) {
      customerId = pmCustomer;
    }
  } catch (pmErr) {
    console.warn('[sync-checkout-payment-method] retrieve payment method:', pmErr);
  }

  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (attachErr: unknown) {
    const msg = attachErr instanceof Error ? attachErr.message : String(attachErr);
    if (!msg.includes('already been attached')) {
      console.warn('[sync-checkout-payment-method] attach:', msg);
    }
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const enableAutoPay = options?.enableAutoPay === true;
  await storage.updateUser(user.id, {
    stripeCustomerId: customerId,
    stripeDefaultPaymentMethodId: paymentMethodId,
    ...(enableAutoPay ? { autoPayEnabled: true } : {}),
  });

  if (enableAutoPay) {
    try {
      const { recheckLocationsForParent } = await import('../services/location-activation-service.js');
      await recheckLocationsForParent(user.id);
    } catch (hookErr) {
      console.warn('[sync-checkout-payment-method] location recheck:', hookErr);
    }
  }

  return {
    ok: true,
    customerId,
    paymentMethodId,
    autoPayEnabled: enableAutoPay,
  };
}
