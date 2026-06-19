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

function envFalsy(name: string): boolean {
  const v = process.env[name];
  return v === '0' || v === 'false' || v === 'no';
}

/** On by default in production unless explicitly disabled. */
export function isPostPaymentVerifyEnabled(): boolean {
  if (process.env.POST_PAYMENT_VERIFY_ENABLED !== undefined) {
    return envTruthy('POST_PAYMENT_VERIFY_ENABLED');
  }
  return process.env.NODE_ENV === 'production' && !envFalsy('POST_PAYMENT_VERIFY_ENABLED');
}

/** On by default in production unless explicitly disabled. */
export function isPostPaymentVerifyAutoFixEnabled(): boolean {
  if (process.env.POST_PAYMENT_VERIFY_AUTO_FIX !== undefined) {
    return envTruthy('POST_PAYMENT_VERIFY_AUTO_FIX');
  }
  return process.env.NODE_ENV === 'production' && !envFalsy('POST_PAYMENT_VERIFY_AUTO_FIX');
}

const AUTO_FIX_FINALIZE_KEYS = new Set(['stripe_db_parity', 'enrollment_ledger']);
const AUTO_FIX_MEMBERSHIP_KEYS = new Set(['membership_waterfall']);

async function tryAutoFixPaymentIntent(
  pi: Stripe.PaymentIntent,
  result: VerificationResult,
): Promise<void> {
  if (!isPostPaymentVerifyAutoFixEnabled()) return;
  if (result.overallStatus !== 'critical') return;

  const fixable = result.checks.some(
    (c) => c.severity === 'critical' && AUTO_FIX_FINALIZE_KEYS.has(c.key),
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
    const { reconcileMembershipAfterPaymentIntent } = await import(
      '../lib/reconcile-membership-ledger'
    );
    await reconcileMembershipAfterPaymentIntent(pi);
  } catch (err) {
    console.error(`[post-payment-verify] AUTO_FIX failed for ${pi.id}:`, err);
  }
}

async function tryMembershipReconcileAutoFix(
  pi: Stripe.PaymentIntent,
  result: VerificationResult,
): Promise<void> {
  if (!isPostPaymentVerifyAutoFixEnabled()) return;
  if (result.overallStatus !== 'critical') return;

  const membershipCritical = result.checks.some(
    (c) => c.severity === 'critical' && AUTO_FIX_MEMBERSHIP_KEYS.has(c.key),
  );
  if (!membershipCritical) return;

  try {
    const { reconcileMembershipAfterPaymentIntent } = await import(
      '../lib/reconcile-membership-ledger'
    );
    await reconcileMembershipAfterPaymentIntent(pi);
    console.log(`[post-payment-verify] AUTO_FIX membership reconcile for ${pi.id}`);
  } catch (err) {
    console.error(`[post-payment-verify] membership AUTO_FIX failed for ${pi.id}:`, err);
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
  await tryMembershipReconcileAutoFix(pi, result);
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
