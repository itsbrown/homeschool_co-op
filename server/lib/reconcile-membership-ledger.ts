import type Stripe from 'stripe';
import type { Payment } from '@shared/schema';
import { storage } from '../storage';
import { generateMemberId } from '../utils/membership';
import {
  computeUnpaidMembershipRemainingCents,
  isMembershipFullyPaidForCheckout,
  parentHasMemberIdForCheckout,
} from '../utils/cart-pricing';
import {
  persistPaymentAllocationBreakdown,
  readAllocationBreakdownFromPayment,
} from './persist-payment-allocation-breakdown';

type MembershipRow = Awaited<
  ReturnType<typeof storage.getMembershipEnrollmentByParentAndSchoolAndYear>
>;

/**
 * Align membership_enrollments with satisfied membership signals (member ID, completed
 * cart payment with a membership slice). Safe to call on dashboard load — idempotent.
 */
export async function reconcileMembershipLedgerForParent(
  parentUserId: number,
  schoolId: number,
): Promise<{ updated: boolean; memberIdGenerated: boolean }> {
  const currentYear = new Date().getFullYear();
  const membership =
    (await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentUserId,
      schoolId,
      currentYear,
    )) ??
    (await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentUserId,
      schoolId,
      currentYear + 1,
    ));

  if (!membership) {
    return { updated: false, memberIdGenerated: false };
  }

  if (isMembershipFullyPaidForCheckout(membership, schoolId, currentYear)) {
    return { updated: false, memberIdGenerated: false };
  }

  const owed = computeUnpaidMembershipRemainingCents(membership);
  if (owed <= 0 && membership.status === 'enrolled') {
    return { updated: false, memberIdGenerated: false };
  }

  const user = await storage.getUser(parentUserId);

  // Admin-assigned member ID means membership is satisfied even if the ledger row lagged.
  if (parentHasMemberIdForCheckout(user?.memberId)) {
    const targetAmount = membership.amount ?? 0;
    if (targetAmount > 0) {
      await storage.updateMembershipEnrollment(membership.id, {
        status: 'enrolled',
        amountPaid: targetAmount,
        remainingBalance: 0,
        balanceDue: 0,
        totalAmount: targetAmount,
      });
      return { updated: true, memberIdGenerated: false };
    }
  }

  let memberIdGenerated = false;

  const cartPaymentSignal = await findMembershipCartPaymentSignal(parentUserId, membership);

  if (user && !parentHasMemberIdForCheckout(user.memberId) && cartPaymentSignal.satisfied) {
    const newMemberId = generateMemberId();
    await storage.updateUser(parentUserId, { memberId: newMemberId });
    memberIdGenerated = true;
    if (cartPaymentSignal.payment) {
      await persistInferredAllocationIfMissing(cartPaymentSignal.payment, membership, parentUserId);
    }
  }

  const userAfter = memberIdGenerated ? await storage.getUser(parentUserId) : user;
  const hasMemberId = parentHasMemberIdForCheckout(userAfter?.memberId);
  const paidViaCart = hasMemberId || cartPaymentSignal.satisfied;

  if (!paidViaCart) {
    return { updated: false, memberIdGenerated };
  }

  if (cartPaymentSignal.payment) {
    await persistInferredAllocationIfMissing(cartPaymentSignal.payment, membership, parentUserId);
  }

  const targetAmount = membership.amount ?? 0;
  if (targetAmount <= 0) {
    return { updated: false, memberIdGenerated };
  }

  await storage.updateMembershipEnrollment(membership.id, {
    status: 'enrolled',
    amountPaid: targetAmount,
    remainingBalance: 0,
    balanceDue: 0,
    totalAmount: targetAmount,
  });

  return { updated: true, memberIdGenerated };
}

type CartPaymentSignal = { satisfied: boolean; payment?: Payment };

async function findMembershipCartPaymentSignal(
  parentUserId: number,
  membership: NonNullable<MembershipRow>,
): Promise<CartPaymentSignal> {
  const user = await storage.getUser(parentUserId);
  if (!user?.email) return { satisfied: false };

  const payments = await storage.getPaymentsByParentEmail(user.email);
  const membershipAmount = membership.amount ?? 0;
  if (membershipAmount <= 0) return { satisfied: false };

  for (const payment of payments) {
    if (payment.status !== 'completed') continue;

    const breakdown = readAllocationBreakdownFromPayment(payment);
    if (breakdown && breakdown.membershipCents >= membershipAmount) {
      return { satisfied: true, payment };
    }

    if (!payment.stripePaymentIntentId) continue;

    const note = `${payment.stripePaymentIntentId}`;
    if (membership.notes?.includes(note)) {
      return { satisfied: true, payment };
    }

    // Combined checkout: payment total covers tuition + membership even when webhook/backfill
    // only wrote the tuition row (e.g. "Backfill: webhook disabled").
    if (payment.amount >= membershipAmount) {
      const enrollments = await storage.getProgramEnrollmentsByParent(parentUserId);
      const tuitionPaidNearPayment = enrollments
        .filter((e) => e.paymentStatus === 'completed' || (e.totalPaid ?? 0) > 0)
        .reduce((sum, e) => sum + (e.totalPaid ?? 0), 0);
      if (payment.amount >= tuitionPaidNearPayment + membershipAmount) {
        return { satisfied: true, payment };
      }
    }
  }

  return { satisfied: false };
}

/** Infer allocation breakdown on legacy backfill rows so verifiers/jobs agree on membership slice. */
async function persistInferredAllocationIfMissing(
  payment: Payment,
  membership: NonNullable<MembershipRow>,
  parentUserId: number,
): Promise<void> {
  if (!payment.stripePaymentIntentId || readAllocationBreakdownFromPayment(payment)) {
    return;
  }
  const membershipAmount = membership.amount ?? 0;
  if (membershipAmount <= 0 || !payment.amount) return;

  const enrollments = await storage.getProgramEnrollmentsByParent(parentUserId);
  const tuitionPaid = enrollments
    .filter((e) => e.paymentStatus === 'completed' || (e.totalPaid ?? 0) > 0)
    .reduce((sum, e) => sum + (e.totalPaid ?? 0), 0);
  const classPoolCents = Math.max(0, Math.min(payment.amount - membershipAmount, tuitionPaid));

  await persistPaymentAllocationBreakdown(payment.stripePaymentIntentId, {
    membershipCents: membershipAmount,
    classPoolCents,
    grossCents: payment.amount,
    paymentIntentId: payment.stripePaymentIntentId,
  });
}

/**
 * Reconcile membership for every school tied to this parent (profile school + enrollment rows).
 */
export async function reconcileMembershipLedgerForParentUser(
  parentUserId: number,
  options?: { schoolId?: number | null },
): Promise<{ schoolsReconciled: number; anyUpdated: boolean }> {
  const schoolIds = new Set<number>();
  if (options?.schoolId) {
    schoolIds.add(options.schoolId);
  }
  const user = await storage.getUser(parentUserId);
  if (user?.schoolId) {
    schoolIds.add(user.schoolId);
  }
  const memberships = await storage.getMembershipEnrollmentsByParentId(parentUserId);
  for (const membership of memberships) {
    if (membership.schoolId) {
      schoolIds.add(membership.schoolId);
    }
  }

  let anyUpdated = false;
  for (const schoolId of schoolIds) {
    const result = await reconcileMembershipLedgerForParent(parentUserId, schoolId);
    if (result.updated || result.memberIdGenerated) {
      anyUpdated = true;
    }
  }

  return { schoolsReconciled: schoolIds.size, anyUpdated };
}

/** Safe wrapper for request paths — logs failures, never throws. */
export async function runMembershipReconcileForParentUser(
  parentUserId: number,
  schoolId?: number | null,
): Promise<void> {
  try {
    await reconcileMembershipLedgerForParentUser(parentUserId, { schoolId });
  } catch (err) {
    console.error(`[membership-reconcile] failed for parent ${parentUserId}:`, err);
  }
}

/** Run after checkout finalize/webhook when PI metadata identifies the parent. */
export async function reconcileMembershipAfterPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'metadata'>,
): Promise<void> {
  const meta = (paymentIntent.metadata ?? {}) as Record<string, string | undefined>;
  let parentUserId = meta.membershipParentUserId
    ? parseInt(meta.membershipParentUserId, 10)
    : NaN;
  if (!Number.isFinite(parentUserId) && meta.userId) {
    parentUserId = parseInt(meta.userId, 10);
  }
  let schoolId = meta.membershipSchoolId ? parseInt(meta.membershipSchoolId, 10) : null;

  if (!Number.isFinite(parentUserId) && meta.parentEmail) {
    const user = await storage.getUserByEmail(meta.parentEmail.trim());
    parentUserId = user?.id ?? NaN;
  }

  if (!Number.isFinite(parentUserId)) {
    return;
  }

  if (!schoolId) {
    const user = await storage.getUser(parentUserId);
    schoolId = user?.schoolId ?? null;
  }

  await reconcileMembershipLedgerForParentUser(parentUserId, { schoolId });
}

export function parentHasSatisfiedMembership(
  memberId: string | null | undefined,
  membership: MembershipRow,
  schoolId: number,
  currentYear: number = new Date().getFullYear(),
): boolean {
  if (parentHasMemberIdForCheckout(memberId)) return true;
  if (!membership) return false;
  return isMembershipFullyPaidForCheckout(membership, schoolId, currentYear);
}
