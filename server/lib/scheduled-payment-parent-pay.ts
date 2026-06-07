import type Stripe from 'stripe';
import { paymentIntentBelongsToParent } from './stripe-search-helpers';

export type ScheduledPaymentPayRow = {
  id: number;
  status?: string | null;
  chargedBy?: string | null;
  parentId?: number | null;
  stripePaymentIntentId?: string | null;
};

export type ParentPayStripeContext = {
  parentEmail: string;
  customerIds: string[];
};

const RESUMABLE_PI_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

export type ParentManualPayIntentResolution =
  | { action: 'resume'; clientSecret: string; paymentIntentId: string }
  | { action: 'release_and_retry' }
  | { action: 'not_applicable' };

function piOwnedByParent(pi: Stripe.PaymentIntent, ctx: ParentPayStripeContext): boolean {
  return paymentIntentBelongsToParent(pi, ctx.parentEmail, ctx.customerIds);
}

/**
 * When a parent re-opens Pay Now while their installment is still `processing`
 * with an in-flight parent_manual PI, return the existing client secret instead
 * of failing claim with INSTALLMENT_NOT_AVAILABLE.
 */
export async function resolveParentManualPayIntent(
  row: ScheduledPaymentPayRow,
  parentUserId: number,
  stripe: Stripe,
  ctx: ParentPayStripeContext,
): Promise<ParentManualPayIntentResolution> {
  const status = String(row.status ?? '');
  const chargedBy = row.chargedBy ?? null;

  if (status !== 'processing' || chargedBy !== 'parent_manual' || row.parentId !== parentUserId) {
    return { action: 'not_applicable' };
  }

  const piId = row.stripePaymentIntentId;
  if (!piId) {
    return { action: 'not_applicable' };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (!piOwnedByParent(pi, ctx)) {
      console.warn(
        `[scheduled-payment-parent-pay] PI ${piId} on scheduled ${row.id} does not match parent ${ctx.parentEmail} / customer ids — clearing`,
      );
      return { action: 'release_and_retry' };
    }
    if (pi.status === 'succeeded') {
      return { action: 'not_applicable' };
    }
    if (RESUMABLE_PI_STATUSES.has(pi.status) && pi.client_secret) {
      return {
        action: 'resume',
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
      };
    }
    if (pi.status === 'canceled') {
      return { action: 'release_and_retry' };
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return { action: 'release_and_retry' };
    }
    throw err;
  }

  return { action: 'not_applicable' };
}

/**
 * Pending/failed rows sometimes retain a dead PI after recovery. Cancel and clear
 * so a fresh Pay Now can claim the installment.
 */
export async function shouldClearStaleScheduledPaymentIntent(
  row: ScheduledPaymentPayRow,
  stripe: Stripe,
  ctx: ParentPayStripeContext,
): Promise<boolean> {
  const status = String(row.status ?? '');
  if (!['pending', 'failed', 'overdue'].includes(status)) {
    return false;
  }

  const piId = row.stripePaymentIntentId;
  if (!piId) {
    return false;
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (!piOwnedByParent(pi, ctx)) {
      console.warn(
        `[scheduled-payment-parent-pay] clearing unowned stale PI ${piId} on scheduled ${row.id}`,
      );
      return true;
    }
    if (pi.status === 'succeeded') {
      return false;
    }
    if (pi.status === 'canceled') {
      return true;
    }
    if (RESUMABLE_PI_STATUSES.has(pi.status)) {
      try {
        await stripe.paymentIntents.cancel(piId);
      } catch {
        // PI may already be canceling — still clear the row.
      }
      return true;
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return true;
    }
    throw err;
  }

  return false;
}

/** Prefer users.stripe_customer_id, else first resolved id from DB + Stripe email search. */
export function pickStripeCustomerIdForParentPay(
  userStripeCustomerId: string | null | undefined,
  resolvedCustomerIds: string[],
): string | undefined {
  if (userStripeCustomerId?.startsWith('cus_')) {
    return userStripeCustomerId;
  }
  return resolvedCustomerIds.find((id) => id.startsWith('cus_'));
}
