/**
 * Shared helpers for auto-pay webhook handling (credit hold release + retry cap).
 * AUTOPAY_MAX_RETRIES is defined here until the full auto-pay scheduler is ported.
 */

import { storage } from '../storage';

export const AUTOPAY_MAX_RETRIES = 3;

export interface ScheduledPaymentFailureResult {
  released: boolean;
  releasedCount: number;
  totalReleased: number;
  creditHoldSessionId: string | null;
  newStatus: 'failed' | 'pending';
  newRetryCount: number;
  exhausted: boolean;
}

export async function handleScheduledPaymentFailed(
  scheduledPaymentId: number,
  metadata: {
    parentEmail: string;
    creditHoldSessionId?: string;
    lastPaymentErrorMessage?: string;
  }
): Promise<ScheduledPaymentFailureResult> {
  const existingPayments = await storage.getScheduledPaymentsByParentEmail(metadata.parentEmail);
  const existingPayment = existingPayments.find((p) => p.id === scheduledPaymentId);
  const existingMetadata = (existingPayment?.metadata as Record<string, unknown>) || {};

  const newRetryCount = (existingPayment?.retryCount ?? 0) + 1;
  const exhausted = newRetryCount >= AUTOPAY_MAX_RETRIES;

  let releasedCount = 0;
  let totalReleased = 0;
  const creditHoldSessionId = metadata.creditHoldSessionId ?? null;

  if (creditHoldSessionId) {
    try {
      const result = await storage.releaseCreditHolds(creditHoldSessionId);
      releasedCount = result.releasedCount;
      totalReleased = result.totalReleased;
      console.log(`🔓 Released credit hold ${creditHoldSessionId} after async payment failure`);
    } catch (holdReleaseErr: unknown) {
      const msg = holdReleaseErr instanceof Error ? holdReleaseErr.message : String(holdReleaseErr);
      console.error(`❌ Could not release credit hold ${creditHoldSessionId}:`, msg);
    }
  }

  const newStatus: 'failed' | 'pending' = exhausted ? 'failed' : 'pending';

  await storage.updateScheduledPayment(scheduledPaymentId, {
    status: newStatus,
    retryCount: newRetryCount,
    failureReason: exhausted
      ? `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`
      : metadata.lastPaymentErrorMessage || 'Payment failed',
    metadata: {
      ...existingMetadata,
      pendingCreditsReservation: 0,
      lastFailedAt: new Date().toISOString(),
    },
  });

  if (exhausted) {
    console.log(`🚫 Scheduled payment ${scheduledPaymentId} permanently failed after ${newRetryCount} attempts`);
  } else {
    console.log(
      `🔄 Reset scheduled payment ${scheduledPaymentId} to pending (attempt ${newRetryCount}/${AUTOPAY_MAX_RETRIES})`
    );
  }

  return {
    released: releasedCount > 0,
    releasedCount,
    totalReleased,
    creditHoldSessionId,
    newStatus,
    newRetryCount,
    exhausted,
  };
}
