/**
 * Shared helpers for auto-pay webhook handling.
 *
 * Extracted so that integration tests can invoke the exact same code path
 * as the production webhook handler — not a parallel reimplementation.
 */

import { storage } from '../storage';
import { AUTOPAY_MAX_RETRIES } from './auto-pay-scheduler';

export interface SinglePaymentFailedMetadata {
  scheduledPaymentId: string;
  parentEmail: string;
  creditHoldSessionId?: string;
  last_payment_error_message?: string;
}

export interface ScheduledPaymentFailureResult {
  released: boolean;
  releasedCount: number;
  totalReleased: number;
  creditHoldSessionId: string | null;
  newStatus: 'failed' | 'pending';
  newRetryCount: number;
  exhausted: boolean;
}

/**
 * Handles a single-scheduled-payment async failure from payment_intent.payment_failed.
 *
 * Shared between:
 *  - webhook-handler.ts (production path)
 *  - /api/test/simulate-async-payment-failed (integration test path)
 *
 * Releases any credit hold that was created during the partial-credit auto-pay path,
 * then applies the retry cap and resets the scheduled payment status.
 */
export async function handleScheduledPaymentFailed(
  scheduledPaymentId: number,
  metadata: {
    parentEmail: string;
    creditHoldSessionId?: string;
    lastPaymentErrorMessage?: string;
  }
): Promise<ScheduledPaymentFailureResult> {
  const existingPayments = await storage.getScheduledPaymentsByParentEmail(metadata.parentEmail);
  const existingPayment = existingPayments.find(p => p.id === scheduledPaymentId);
  const existingMetadata = (existingPayment?.metadata as Record<string, any>) || {};

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
    } catch (holdReleaseErr: any) {
      console.error(`❌ Could not release credit hold ${creditHoldSessionId}:`, holdReleaseErr.message);
    }
  }

  const newStatus: 'failed' | 'pending' = exhausted ? 'failed' : 'pending';

  await storage.updateScheduledPayment(scheduledPaymentId, {
    status: newStatus,
    retryCount: newRetryCount,
    failureReason: exhausted
      ? `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`
      : (metadata.lastPaymentErrorMessage || 'Payment failed'),
    metadata: {
      ...existingMetadata,
      pendingCreditsReservation: 0,
      lastFailedAt: new Date().toISOString(),
    },
  });

  if (exhausted) {
    console.log(`🚫 Scheduled payment ${scheduledPaymentId} permanently failed after ${newRetryCount} attempts`);
  } else {
    console.log(`🔄 Reset scheduled payment ${scheduledPaymentId} to pending (attempt ${newRetryCount}/${AUTOPAY_MAX_RETRIES})`);
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
