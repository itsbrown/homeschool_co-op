import { storage } from '../storage';

export function scheduledPaymentCreditUsageDescription(
  scheduledPaymentId: number,
  installmentNumber?: string,
  totalInstallments?: string,
): string {
  const inst = installmentNumber ?? '?';
  const total = totalInstallments ?? '?';
  return `Scheduled payment ${scheduledPaymentId} — installment ${inst}/${total}`;
}

/**
 * Idempotently finalize holds or FIFO-consume credits for a scheduled installment.
 * Safe to call on webhook replay after the row is already `completed`.
 */
export async function ensureScheduledPaymentCreditsConsumed(options: {
  scheduledPaymentId: number;
  userId: number;
  creditsAppliedCents: number;
  creditHoldSessionId?: string;
  installmentNumber?: string;
  totalInstallments?: string;
}): Promise<{ consumedCents: number; skippedAlreadyApplied: boolean }> {
  const { scheduledPaymentId, userId, creditsAppliedCents, creditHoldSessionId } = options;

  if (creditsAppliedCents <= 0 || userId <= 0) {
    return { consumedCents: 0, skippedAlreadyApplied: true };
  }

  const description = scheduledPaymentCreditUsageDescription(
    scheduledPaymentId,
    options.installmentNumber,
    options.totalInstallments,
  );

  const existingLogs = await storage.getUnifiedCreditUsageLogsByScheduledPaymentId(scheduledPaymentId);
  const alreadyLogged = existingLogs.reduce((sum, log) => sum + (log.amountCents || 0), 0);
  if (alreadyLogged >= creditsAppliedCents) {
    return { consumedCents: alreadyLogged, skippedAlreadyApplied: true };
  }

  if (creditHoldSessionId) {
    const { totalFinalized } = await storage.finalizeCreditHolds(
      creditHoldSessionId,
      undefined,
      description,
    );
    const afterHoldLogs = await storage.getUnifiedCreditUsageLogsByScheduledPaymentId(scheduledPaymentId);
    const afterHoldTotal = afterHoldLogs.reduce((sum, log) => sum + (log.amountCents || 0), 0);
    if (afterHoldTotal >= creditsAppliedCents) {
      return { consumedCents: afterHoldTotal, skippedAlreadyApplied: totalFinalized === 0 };
    }
    const remainder = creditsAppliedCents - afterHoldTotal;
    const { totalUsed } = await storage.useCredits(userId, remainder, undefined, description);
    return { consumedCents: afterHoldTotal + totalUsed, skippedAlreadyApplied: false };
  }

  const remainder = creditsAppliedCents - alreadyLogged;
  const { totalUsed } = await storage.useCredits(userId, remainder, undefined, description);
  return { consumedCents: alreadyLogged + totalUsed, skippedAlreadyApplied: false };
}
