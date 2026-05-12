/**
 * Match a cart line item to a program enrollment for webhook fulfillment.
 * Prefer enrollmentId when present; otherwise childId + any class id column
 * (marketplaceClassId / programId / classId) matching the item's class references.
 */
export interface CartCheckoutItemLike {
  childId?: number;
  enrollmentId?: number;
  classId?: number;
  marketplaceClassId?: number;
  programId?: number;
}

export type ProgramEnrollmentRowLike = {
  id: number;
  childId?: number | null;
  programId?: number | null;
  classId?: number | null;
  marketplaceClassId?: number | null;
  /** Present on full program enrollment rows; used by webhook balance updates. */
  totalPaid?: number | null;
  totalCost?: number | null;
  schoolId?: number | null;
};

export function findProgramEnrollmentForCartItem<T extends ProgramEnrollmentRowLike>(
  allEnrollments: T[],
  item: CartCheckoutItemLike
): T | undefined {
  const candidateClassIds = [item.classId, item.marketplaceClassId, item.programId].filter(
    (id): id is number => typeof id === 'number' && id > 0
  );

  return allEnrollments.find((e) => {
    if (item.enrollmentId != null && item.enrollmentId > 0 && e.id === item.enrollmentId) {
      return true;
    }
    if (item.childId == null || e.childId !== item.childId) {
      return false;
    }
    return candidateClassIds.some(
      (cid) => e.programId === cid || e.classId === cid || e.marketplaceClassId === cid
    );
  });
}
