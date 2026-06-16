/**
 * Async scheduling + persistence for Phase A post-payment verification.
 */

import type Stripe from 'stripe';
import { getDb } from '../db';
import { paymentVerificationLogs } from '@shared/schema';
import { storage } from '../storage';
import { errorNotificationService } from './error-notification';
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

export function isPostPaymentVerifyAutoFixEnabled(): boolean {
  return envTruthy('POST_PAYMENT_VERIFY_AUTO_FIX');
}

const AUTO_FIXABLE_CRITICAL_KEYS = new Set(['stripe_db_parity', 'enrollment_ledger']);

async function tryAutoFixPaymentIntent(
  pi: Stripe.PaymentIntent,
  result: VerificationResult,
): Promise<void> {
  if (!isPostPaymentVerifyAutoFixEnabled()) return;
  if (result.overallStatus !== 'critical') return;

  const fixable = result.checks.some(
    (c) => c.severity === 'critical' && AUTO_FIXABLE_CRITICAL_KEYS.has(c.key),
  );
  if (!fixable) return;

  const paymentType = pi.metadata?.paymentType || pi.metadata?.type || '';
  try {
    if (paymentType === 'scheduled_payment') {
      const { finalizeSucceededScheduledPaymentIntent } = await import(
        '../lib/finalize-succeeded-scheduled-payment-intent'
      );
      await finalizeSucceededScheduledPaymentIntent(pi, {
        skipReceiptEmail: true,
        skipRealtimeRefresh: true,
      });
    } else {
      const { finalizeSucceededPaymentIntent } = await import(
        '../lib/finalize-succeeded-payment-intent'
      );
      await finalizeSucceededPaymentIntent(pi, undefined, {
        skipConfirmationEmail: true,
        skipRealtimeRefresh: true,
      });
    }
    console.log(`[post-payment-verify] AUTO_FIX replayed finalize for ${pi.id}`);
  } catch (err) {
    console.error(`[post-payment-verify] AUTO_FIX failed for ${pi.id}:`, err);
  }
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
      const errorLog = await storage.createErrorLog({
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
      await errorNotificationService.sendImmediateNotification(errorLog);
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
  await tryAutoFixPaymentIntent(pi, result);
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
