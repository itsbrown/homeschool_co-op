import type { PaymentAllocationBreakdown } from './persist-payment-allocation-breakdown';

export type MembershipFulfillmentLedgerRow = {
  notes?: string | null;
  amountPaid?: number | null;
  remainingBalance?: number | null;
  status?: string | null;
};

/**
 * True when this PaymentIntent's membership share is already reflected on the ledger.
 * Notes mentioning the PI alone are NOT sufficient (poison-pill: note stamped, amount_paid still 0).
 */
export function shouldSkipMembershipFulfillmentForPaymentIntent(args: {
  paymentIntentId: string;
  existingEnrollment?: MembershipFulfillmentLedgerRow | null;
  persistedBreakdown?: PaymentAllocationBreakdown | null;
  cartMembershipTotalCents: number;
  membershipPortionThisPaymentCents: number;
}): boolean {
  const {
    paymentIntentId,
    existingEnrollment,
    persistedBreakdown,
    cartMembershipTotalCents,
    membershipPortionThisPaymentCents,
  } = args;

  if (persistedBreakdown?.paymentIntentId === paymentIntentId) {
    return true;
  }

  const notes = existingEnrollment?.notes ?? '';
  if (!notes.includes(paymentIntentId)) {
    return false;
  }

  const paid = existingEnrollment?.amountPaid ?? 0;
  const remaining = existingEnrollment?.remainingBalance ?? 0;
  const cartTotal = cartMembershipTotalCents;
  const portion = membershipPortionThisPaymentCents;

  // Note references PI but ledger never credited — retry fulfillment (Zoryana-class bug).
  if (cartTotal > 0 && paid <= 0 && remaining >= cartTotal) {
    return false;
  }

  if (cartTotal > 0 && remaining <= 0 && paid >= cartTotal) {
    return true;
  }

  if (portion > 0 && paid >= portion) {
    return true;
  }

  return false;
}
