import type Stripe from 'stripe';
import { storage } from '../storage';
import {
  allocationGrossCentsFromPaymentIntent,
  membershipCentsForThisPaymentIntent,
  parseMetadataMembershipAmountCents,
  type MembershipPaymentIntentAllocation,
} from './balance-payment-metadata';

export type ResolvedMembershipReserve = MembershipPaymentIntentAllocation & {
  membershipAlreadyPaidCents: number;
  parentUserId: number | null;
  membershipSchoolId: number | null;
  membershipYear: number;
};

/**
 * Load membership row and compute waterfall reserve for a PaymentIntent.
 * Prefers existing membership_enrollments.amount over stale PI metadata.
 */
export async function resolveMembershipReserveForPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'amount' | 'metadata'>,
): Promise<ResolvedMembershipReserve | null> {
  const md = (paymentIntent.metadata ?? {}) as Record<string, string | undefined>;
  if (md.hasMembership !== 'true') {
    return null;
  }

  const parentUserId = md.membershipParentUserId
    ? parseInt(md.membershipParentUserId, 10)
    : null;
  const membershipSchoolId = md.membershipSchoolId
    ? parseInt(md.membershipSchoolId, 10)
    : null;
  const membershipYear = md.membershipYear
    ? parseInt(md.membershipYear, 10)
    : new Date().getFullYear();

  if (!parentUserId || !membershipSchoolId) {
    return null;
  }

  const metadataCartTotal = parseMetadataMembershipAmountCents(md);
  const existingEnrollment = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
    parentUserId,
    membershipSchoolId,
    membershipYear,
  );

  let cartMembershipTotalCents = metadataCartTotal;
  if (existingEnrollment?.amount != null && existingEnrollment.amount > 0) {
    cartMembershipTotalCents = existingEnrollment.amount;
  } else if (metadataCartTotal <= 0) {
    const school = await storage.getSchool(membershipSchoolId);
    if (school?.membershipFeeAmount && school.membershipFeeAmount > 0) {
      cartMembershipTotalCents = school.membershipFeeAmount;
    }
  }

  if (cartMembershipTotalCents <= 0) {
    return null;
  }

  const membershipAlreadyPaidCents = existingEnrollment?.amountPaid ?? 0;
  const piAmount =
    typeof paymentIntent.amount === 'number' && Number.isInteger(paymentIntent.amount)
      ? paymentIntent.amount
      : 0;
  const allocationGrossCents = allocationGrossCentsFromPaymentIntent(paymentIntent);

  const allocation = membershipCentsForThisPaymentIntent(piAmount, md, {
    membershipAlreadyPaidCents,
    allocationGrossCents,
    cartMembershipTotalCents,
  });

  return {
    ...allocation,
    membershipAlreadyPaidCents,
    parentUserId,
    membershipSchoolId,
    membershipYear,
  };
}
