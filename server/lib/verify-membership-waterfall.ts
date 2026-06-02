import type Stripe from 'stripe';
import { storage } from '../storage';
import {
  allocationGrossCentsFromPaymentIntent,
  computeMembershipWaterfallPortion,
  parseBalanceIntentCredits,
  proportionalMembershipPortionCents,
} from './balance-payment-metadata';
import { readAllocationBreakdownFromPayment } from './persist-payment-allocation-breakdown';
import { resolveMembershipReserveForPaymentIntent } from './resolve-membership-reserve-for-payment';
import type { Payment } from '@shared/schema';
import type { VerificationCheck } from '../services/post-payment-verification';

function parseCreditAllocation(
  meta: Record<string, string | undefined>,
): { membershipCredits: number; enrollmentCredits: number } | null {
  const raw = meta.creditAllocation;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const membershipCredits = Number(parsed?.membershipCredits);
    const enrollmentCredits = Number(parsed?.enrollmentCredits);
    if (!Number.isInteger(membershipCredits) || !Number.isInteger(enrollmentCredits)) {
      return null;
    }
    return { membershipCredits, enrollmentCredits };
  } catch {
    return null;
  }
}

/**
 * Read-only checks that membership was allocated before class (waterfall policy).
 */
export async function buildMembershipWaterfallChecks(
  pi: Pick<Stripe.PaymentIntent, 'id' | 'amount' | 'metadata' | 'status'>,
  payment?: Payment,
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>;
  const paymentType = meta.paymentType || meta.type || '';

  if (meta.hasMembership !== 'true') {
    return checks;
  }

  if (paymentType === 'scheduled_payment') {
    const parentUserId = meta.membershipParentUserId
      ? parseInt(meta.membershipParentUserId, 10)
      : null;
    const schoolId = meta.membershipSchoolId ? parseInt(meta.membershipSchoolId, 10) : null;
    const year = meta.membershipYear ? parseInt(meta.membershipYear, 10) : new Date().getFullYear();
    if (parentUserId && schoolId) {
      const me = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
        parentUserId,
        schoolId,
        year,
      );
      const remaining = me?.remainingBalance ?? me?.balanceDue ?? 0;
      if (remaining > 0) {
        checks.push({
          key: 'membership_scheduled_while_owed',
          severity: 'warning',
          message:
            'Scheduled installment applied while annual membership still has a balance (autopay does not allocate membership yet)',
          detail: { membershipRemainingCents: remaining, piId: pi.id },
        });
      }
    }
    return checks;
  }

  const resolved = await resolveMembershipReserveForPaymentIntent(pi);
  if (!resolved || resolved.cartMembershipTotalCents <= 0) {
    return checks;
  }

  const gross = resolved.allocationGrossCents;
  const expectedMembership = resolved.membershipPortionThisPaymentCents;
  const expectedClass = resolved.classPoolCents;

  const persisted = readAllocationBreakdownFromPayment(payment);
  if (persisted) {
    if (persisted.membershipCents !== expectedMembership) {
      checks.push({
        key: 'membership_waterfall',
        severity: 'critical',
        message: 'Persisted membership allocation does not match waterfall expectation',
        detail: {
          expectedMembershipCents: expectedMembership,
          persistedMembershipCents: persisted.membershipCents,
          piId: pi.id,
        },
      });
    }
    if (persisted.classPoolCents !== expectedClass) {
      checks.push({
        key: 'membership_waterfall',
        severity: 'critical',
        message: 'Persisted class pool does not match waterfall expectation',
        detail: {
          expectedClassPoolCents: expectedClass,
          persistedClassPoolCents: persisted.classPoolCents,
          piId: pi.id,
        },
      });
    }
  }

  const parentUserId = resolved.parentUserId;
  const schoolId = resolved.membershipSchoolId;
  const year = resolved.membershipYear;
  if (!parentUserId || !schoolId) {
    return checks;
  }

  const me = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
    parentUserId,
    schoolId,
    year,
  );
  const cartTotal = resolved.cartMembershipTotalCents;
  const amountPaid = me?.amountPaid ?? 0;
  const priorPaid = resolved.membershipAlreadyPaidCents;
  const minimumAfter = priorPaid + expectedMembership;

  if (expectedMembership > 0 && amountPaid < minimumAfter) {
    checks.push({
      key: 'membership_waterfall',
      severity: 'critical',
      message: 'Membership amount_paid is below waterfall expectation for this payment',
      detail: {
        amountPaidCents: amountPaid,
        expectedMinimumCents: minimumAfter,
        expectedIncrementCents: expectedMembership,
        priorPaidCents: priorPaid,
        grossCents: gross,
        cartMembershipTotalCents: cartTotal,
        piId: pi.id,
      },
    });
  }

  if (priorPaid === 0 && gross >= cartTotal && amountPaid < cartTotal) {
    checks.push({
      key: 'membership_waterfall',
      severity: 'critical',
      message:
        'First membership checkout payment should have satisfied annual fee (membership-first)',
      detail: {
        amountPaidCents: amountPaid,
        cartMembershipTotalCents: cartTotal,
        grossCents: gross,
        piId: pi.id,
      },
    });
  }

  if (amountPaid > cartTotal) {
    checks.push({
      key: 'membership_waterfall',
      severity: 'warning',
      message: 'Membership amount_paid exceeds configured annual fee',
      detail: { amountPaidCents: amountPaid, cartMembershipTotalCents: cartTotal },
    });
  }

  const piAmount =
    typeof pi.amount === 'number' && Number.isInteger(pi.amount) ? pi.amount : 0;
  const proportional = proportionalMembershipPortionCents(piAmount, meta);
  if (
    proportional != null &&
    expectedMembership !== proportional &&
    expectedMembership > 0 &&
    amountPaid >= priorPaid + proportional &&
    amountPaid < minimumAfter
  ) {
    checks.push({
      key: 'membership_waterfall',
      severity: 'critical',
      message: 'Proportional membership allocation detected; expected membership-first waterfall',
      detail: {
        allocationMode: 'proportional_detected',
        proportionalCents: proportional,
        expectedWaterfallCents: expectedMembership,
        amountPaidCents: amountPaid,
      },
    });
  }

  const { creditsAppliedCents } = parseBalanceIntentCredits(meta);
  if (creditsAppliedCents > 0) {
    const alloc = parseCreditAllocation(meta);
    if (!alloc) {
      checks.push({
        key: 'membership_waterfall_credits',
        severity: 'critical',
        message: 'Credits applied at checkout but creditAllocation metadata is missing',
        detail: { creditsAppliedCents, piId: pi.id },
      });
    } else if (alloc.membershipCredits + alloc.enrollmentCredits !== creditsAppliedCents) {
      checks.push({
        key: 'membership_waterfall_credits',
        severity: 'critical',
        message: 'creditAllocation split does not sum to creditsAppliedCents',
        detail: {
          creditsAppliedCents,
          membershipCredits: alloc.membershipCredits,
          enrollmentCredits: alloc.enrollmentCredits,
        },
      });
    } else {
      const membershipOwedBefore = Math.max(0, cartTotal - priorPaid);
      const expectedCreditMembership = Math.min(creditsAppliedCents, membershipOwedBefore);
      if (alloc.membershipCredits < expectedCreditMembership && membershipOwedBefore > 0) {
        checks.push({
          key: 'membership_waterfall_credits',
          severity: 'warning',
          message: 'Volunteer credits may not have been applied to membership first',
          detail: {
            membershipCredits: alloc.membershipCredits,
            expectedMembershipCreditsFirst: expectedCreditMembership,
          },
        });
      }
    }
  }

  return checks;
}

/** Exported for unit tests. */
export function expectedWaterfallMembershipForGross(args: {
  grossCents: number;
  cartMembershipTotalCents: number;
  membershipAlreadyPaidCents: number;
}): number {
  return computeMembershipWaterfallPortion({
    allocationGrossCents: args.grossCents,
    cartMembershipTotalCents: args.cartMembershipTotalCents,
    membershipAlreadyPaidCents: args.membershipAlreadyPaidCents,
  });
}

export { allocationGrossCentsFromPaymentIntent };
