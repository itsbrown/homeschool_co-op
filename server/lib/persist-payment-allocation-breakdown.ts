import { storage } from '../storage';
import type { Payment } from '@shared/schema';

export type PaymentAllocationBreakdown = {
  membershipCents: number;
  classPoolCents: number;
  grossCents: number;
  /** Stripe PI id — written once so webhook replays skip duplicate membership application. */
  paymentIntentId?: string;
};

/** Merge allocation breakdown into payments.metadata for post-payment verification. */
export async function persistPaymentAllocationBreakdown(
  stripePaymentIntentId: string,
  breakdown: PaymentAllocationBreakdown,
): Promise<void> {
  if (!stripePaymentIntentId || breakdown.grossCents <= 0) {
    return;
  }
  const payment = await storage.getPaymentByStripeId(stripePaymentIntentId);
  if (!payment?.id) {
    return;
  }
  const existingMeta =
    payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};
  if (existingMeta.allocationBreakdown) {
    return;
  }
  await storage.updatePayment(payment.id, {
    metadata: {
      ...existingMeta,
      allocationBreakdown: {
        ...breakdown,
        paymentIntentId: breakdown.paymentIntentId ?? stripePaymentIntentId,
      },
    },
  });
}

export function readAllocationBreakdownFromPayment(
  payment?: Payment | null,
): PaymentAllocationBreakdown | null {
  if (!payment?.metadata || typeof payment.metadata !== 'object' || Array.isArray(payment.metadata)) {
    return null;
  }
  const raw = (payment.metadata as Record<string, unknown>).allocationBreakdown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const membershipCents = Number(o.membershipCents);
  const classPoolCents = Number(o.classPoolCents);
  const grossCents = Number(o.grossCents);
  if (
    !Number.isInteger(membershipCents) ||
    !Number.isInteger(classPoolCents) ||
    !Number.isInteger(grossCents)
  ) {
    return null;
  }
  return { membershipCents, classPoolCents, grossCents };
}
