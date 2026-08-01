import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';

/**
 * Settle a pay-balance request entirely with volunteer credits (no Stripe PI).
 * Prefer completing pending scheduled payments (same path as Upcoming Pay Now);
 * otherwise apply credits directly to enrollment ledgers and clear matching schedules.
 */
export async function settlePayBalanceCreditsOnly(params: {
  parentId: number;
  parentEmail: string;
  enrollmentIds: number[];
  creditsToApply: number;
  originalAmountCents: number;
}): Promise<{ mode: 'credits_only'; creditsApplied: number; settledEnrollmentIds: number[] }> {
  const { parentId, parentEmail, enrollmentIds, creditsToApply, originalAmountCents } = params;
  if (creditsToApply <= 0 || creditsToApply !== originalAmountCents) {
    throw new Error('CREDITS_ONLY_INVARIANT');
  }

  let remainingCredits = creditsToApply;
  const settledEnrollmentIds: number[] = [];

  for (const enrollmentId of enrollmentIds) {
    if (remainingCredits <= 0) break;
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;

    const owed = computeEffectiveBalance(
      enrollment.totalCost ?? 0,
      enrollment.totalPaid ?? 0,
      enrollment.compAmountCents ?? 0,
    );
    if (owed <= 0) continue;

    const applyCents = Math.min(owed, remainingCredits);
    const pendingSchedules = (
      await storage.getScheduledPaymentsByEnrollmentId(enrollmentId)
    ).filter((sp) => ['pending', 'failed', 'overdue'].includes(String(sp.status)));

    const matchingSchedule =
      pendingSchedules.find((sp) => sp.amount === applyCents) ??
      pendingSchedules.find((sp) => sp.amount === owed) ??
      null;

    const holdSessionId = `pay_balance_credits_${enrollmentId}_${Date.now()}`;
    const { totalHeld } = await storage.createCreditHolds(
      parentId,
      applyCents,
      holdSessionId,
      `Pay balance in full — credits-only enrollment ${enrollmentId}`,
      60,
    );
    if (totalHeld < applyCents) {
      await storage.releaseCreditHolds(holdSessionId).catch(() => {});
      throw new Error(
        `INSUFFICIENT_CREDIT_HOLD: need ${applyCents}, held ${totalHeld}`,
      );
    }

    try {
      if (matchingSchedule && matchingSchedule.amount === applyCents) {
        await storage.completeCreditsOnlyPayment({
          holdSessionId,
          scheduledPaymentId: matchingSchedule.id,
          parentId,
          enrollmentId,
          schoolId: enrollment.schoolId ?? matchingSchedule.schoolId ?? null,
          creditsApplied: applyCents,
          originalAmount: applyCents,
          installmentNumber: matchingSchedule.installmentNumber || 1,
          totalInstallments: matchingSchedule.totalInstallments || 1,
          parentEmail,
          childName: enrollment.childName ?? null,
          className: enrollment.className ?? null,
          chargedBy: 'parent_manual',
          completionSource: 'parent_manual_pay_balance_credits_only',
          description: `Pay in full — ${enrollment.className ?? 'class'} covered by credits`,
        });
      } else {
        const newPaid = (enrollment.totalPaid ?? 0) + applyCents;
        const newBalance = Math.max(
          0,
          (enrollment.totalCost ?? 0) - newPaid - (enrollment.compAmountCents ?? 0),
        );
        await storage.updateProgramEnrollment(enrollmentId, {
          totalPaid: newPaid,
          remainingBalance: newBalance,
          paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
          status: enrollment.status === 'pending_payment' ? 'enrolled' : enrollment.status,
        });

        for (const sp of pendingSchedules) {
          await storage.updateScheduledPayment(sp.id, {
            status: newBalance <= 0 ? 'completed' : 'cancelled',
            processedAt: new Date(),
            completionSource: 'parent_manual_pay_balance_credits_only',
          });
        }

        await storage.createPayment({
          schoolId: enrollment.schoolId ?? 1,
          parentId,
          parentEmail,
          amount: 0,
          currency: 'usd',
          childName: enrollment.childName ?? null,
          className: enrollment.className ?? null,
          description: `Pay in full — ${enrollment.className ?? 'class'} covered by credits`,
          status: 'completed',
          stripePaymentIntentId: `credit_only_balance_${enrollmentId}_${Date.now()}`,
          stripeChargeId: null,
          stripeRefundId: null,
          paymentMethod: 'other',
          enrollmentIds: [enrollmentId],
          originalPaymentId: null,
          paymentDate: new Date(),
          metadata: {
            source: 'parent_manual_pay_balance_credits_only',
            creditsAppliedCents: applyCents,
            originalAmountCents: applyCents,
          },
        });

        await storage.finalizeCreditHolds(holdSessionId, null);
      }

      remainingCredits -= applyCents;
      settledEnrollmentIds.push(enrollmentId);
    } catch (err) {
      await storage.releaseCreditHolds(holdSessionId).catch(() => {});
      throw err;
    }
  }

  if (settledEnrollmentIds.length === 0) {
    throw new Error('No enrollments could be settled with credits');
  }

  return {
    mode: 'credits_only',
    creditsApplied: creditsToApply - remainingCredits,
    settledEnrollmentIds,
  };
}
