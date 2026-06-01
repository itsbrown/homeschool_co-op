/**
 * Async scheduling + persistence for Phase A post-payment verification.
 */

import type Stripe from 'stripe';
import { getDb } from '../db';
import { paymentVerificationLogs } from '@shared/schema';
import { storage } from '../storage';
import {
  verifyPaymentIntent,
  type VerificationResult,
} from './post-payment-verification';

function envTruthy(name: string): boolean {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

export function isPostPaymentVerifyEnabled(): boolean {
  return envTruthy('POST_PAYMENT_VERIFY_ENABLED');
}

function scheduleDelayMs(): number {
  const raw = parseInt(process.env.POST_PAYMENT_VERIFY_DELAY_MS ?? '2000', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2000;
}

async function persistVerificationResult(result: VerificationResult): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(paymentVerificationLogs).values({
      stripePaymentIntentId: result.stripePaymentIntentId,
      stripeEventId: result.stripeEventId ?? null,
      schoolId: result.schoolId,
      parentId: result.parentId,
      enrollmentIds: result.enrollmentIds,
      amountCents: result.amountCents,
      overallStatus: result.overallStatus,
      checks: result.checks,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('[post-payment-verify] failed to persist payment_verification_logs:', err);
  }

  const logCritical =
    process.env.POST_PAYMENT_VERIFY_LOG_CRITICAL !== '0' &&
    process.env.POST_PAYMENT_VERIFY_LOG_CRITICAL !== 'false';
  if (result.overallStatus === 'critical' && logCritical) {
    try {
      await storage.createErrorLog({
        errorType: 'payment_verification',
        severity: 'high',
        message: `Post-payment verify CRITICAL for ${result.stripePaymentIntentId}: ${result.checks
          .filter((c) => c.severity === 'critical')
          .map((c) => c.message)
          .join('; ')}`,
        route: '/webhook/stripe/payment_intent.succeeded',
        method: 'WEBHOOK',
        schoolId: result.schoolId,
        userId: result.parentId ?? undefined,
        metadata: {
          piId: result.stripePaymentIntentId,
          enrollmentIds: result.enrollmentIds,
          checks: result.checks,
          durationMs: result.durationMs,
        },
        notificationSent: false,
      } as any);
    } catch (logErr) {
      console.error('[post-payment-verify] failed to write error_log:', logErr);
    }
  }
}

async function runVerification(pi: Stripe.PaymentIntent, stripeEventId?: string): Promise<void> {
  const result = await verifyPaymentIntent(pi, {
    stripeEventId,
    dbLookupAttempts: 4,
    dbLookupDelayMs: 500,
  });
  await persistVerificationResult(result);
  console.log(
    `[post-payment-verify] ${result.overallStatus} pi=${result.stripePaymentIntentId} ` +
      `checks=${result.checks.length} (${result.durationMs}ms)`,
  );
}

/**
 * Fire-and-forget verification after webhook handler returns (Phase A: read-only).
 */
export function schedulePostPaymentVerificationIfEnabled(
  pi: Stripe.PaymentIntent,
  stripeEventId?: string,
): void {
  if (!isPostPaymentVerifyEnabled()) return;
  if (pi.status !== 'succeeded') return;

  const delayMs = scheduleDelayMs();
  setTimeout(() => {
    void runVerification(pi, stripeEventId).catch((err) => {
      console.error('[post-payment-verify] unhandled error:', err);
    });
  }, delayMs);
}
