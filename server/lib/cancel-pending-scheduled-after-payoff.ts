import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';

/**
 * After a balance payment zeros an enrollment, drop remaining installment rows
 * so parents are not prompted to pay again on the payment plan.
 */
export async function cancelPendingScheduledAfterEnrollmentPayoff(
  enrollmentIds: number[],
): Promise<number> {
  let cancelled = 0;
  for (const enrollmentId of enrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;
    const owed = computeEffectiveBalance(
      enrollment.totalCost ?? 0,
      enrollment.totalPaid ?? 0,
      enrollment.compAmountCents ?? 0,
    );
    if (owed > 0) continue;
    const removed =
      await storage.deletePendingScheduledPaymentsByEnrollmentId(enrollmentId);
    cancelled += removed;
  }
  return cancelled;
}
