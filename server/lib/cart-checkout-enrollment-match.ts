/**
 * Match a cart line item to a program enrollment for webhook fulfillment.
 * Prefer enrollmentId when present; otherwise childId + any class id column
 * (marketplaceClassId / programId / classId) matching the item's class references.
 */
import { enrollmentOutstandingCentsForCheckout } from './checkout-enrollment-balance';

export interface CartCheckoutItemLike {
  childId?: number;
  enrollmentId?: number;
  sessionId?: number;
  classId?: number;
  marketplaceClassId?: number;
  programId?: number;
  classType?: string;
}

export type ProgramEnrollmentRowLike = {
  id: number;
  childId?: number | null;
  sessionId?: number | null;
  programId?: number | null;
  classId?: number | null;
  marketplaceClassId?: number | null;
  parentId?: number | null;
  parentEmail?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  /** Present on full program enrollment rows; used by webhook balance updates. */
  totalPaid?: number | null;
  totalCost?: number | null;
  compAmountCents?: number | null;
  effectiveBalance?: number | null;
  remainingBalance?: number | null;
};

function classIdsMatch(
  enrollment: ProgramEnrollmentRowLike,
  item: CartCheckoutItemLike,
): boolean {
  const candidateClassIds = [item.classId, item.marketplaceClassId, item.programId].filter(
    (id): id is number => typeof id === 'number' && id > 0,
  );
  return candidateClassIds.some(
    (cid) =>
      enrollment.programId === cid ||
      enrollment.classId === cid ||
      enrollment.marketplaceClassId === cid,
  );
}

function parentMatches(
  enrollment: ProgramEnrollmentRowLike,
  parentEmail: string,
  parentId: number,
): boolean {
  return enrollment.parentEmail === parentEmail || enrollment.parentId === parentId;
}

/**
 * Find enrollment for cart checkout / create-payment-intent.
 * Reuses an existing row when the child already has a balance due (not only `pending_payment`).
 */
export function findProgramEnrollmentForCartItem<T extends ProgramEnrollmentRowLike>(
  allEnrollments: T[],
  item: CartCheckoutItemLike,
  parentEmail?: string,
  parentId?: number,
): T | undefined {
  const enrollmentId = Number(item.enrollmentId);
  if (Number.isFinite(enrollmentId) && enrollmentId > 0) {
    const byId = allEnrollments.find((e) => Number(e.id) === enrollmentId);
    if (byId) return byId;
  }

  if (item.childId == null) return undefined;

  const itemSessionId =
    item.sessionId != null && item.sessionId > 0 ? Number(item.sessionId) : null;

  const candidates = allEnrollments.filter((e) => {
    if (e.childId !== item.childId) return false;
    if (parentEmail != null && parentId != null && !parentMatches(e, parentEmail, parentId)) {
      return false;
    }
    if (itemSessionId != null) {
      return Number(e.sessionId) === itemSessionId;
    }
    if (item.classType === 'marketplace') {
      if (item.marketplaceClassId != null && e.marketplaceClassId !== item.marketplaceClassId) {
        return false;
      }
      // F001 session rows use classType marketplace with no class id — require session_id
      if (
        item.marketplaceClassId == null &&
        item.classId == null &&
        item.programId == null
      ) {
        return e.sessionId != null && e.sessionId > 0;
      }
    } else if (!classIdsMatch(e, item)) {
      return false;
    }
    return true;
  });

  const pending = candidates.find((e) => String(e.status) === 'pending_payment');
  if (pending) return pending;

  const withBalance = candidates.find(
    (e) =>
      (String(e.status) === 'enrolled' ||
        e.paymentStatus === 'partial_payment' ||
        e.paymentStatus === 'pending' ||
        e.paymentStatus === 'deposit_paid') &&
      enrollmentOutstandingCentsForCheckout(e) > 0,
  );
  if (withBalance) return withBalance;

  return undefined;
}
