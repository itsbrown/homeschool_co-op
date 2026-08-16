/**
 * Daily missed PaymentIntent sweep (Layer 3).
 * Detect + alert by default. Optional auto-fix reuses finalizeSucceeded* only.
 */

import type Stripe from 'stripe';
import { getDb } from '../db';
import { paymentVerificationLogs } from '@shared/schema';
import { storage } from '../storage';
import { errorNotificationService } from './error-notification';
import { verifyPaymentIntent } from './post-payment-verification';
import {
  MISSED_PI_SWEEP_LOG_PREFIX,
  classifyMissedPaymentIntent,
  collectSweepFindings,
  createSweepStripeClient,
  formatCents,
  isPaymentIntentFullyRefunded,
  listSucceededAsaPaymentIntents,
  lookupDbPresence,
  redactFindingForLog,
  resolveMissedPiSweepConfig,
  type MissedPiFinding,
  type MissedPiSweepConfig,
  type StripePaymentIntentLister,
} from '../lib/missed-payment-intent-sweep';

export type MissedPiSweepResult = {
  lookbackDays: number;
  pagesFetched: number;
  truncated: boolean;
  scanned: number;
  missed: MissedPiFinding[];
  historyOnly: MissedPiFinding[];
  autoFixed: string[];
  autoFixSkipped: string[];
  autoFixFailed: string[];
  notified: number;
  durationMs: number;
};

export type RunMissedPiSweepOptions = {
  lookbackDays?: number;
  dryRun?: boolean;
  notify?: boolean;
  autoFix?: boolean;
  stripe?: StripePaymentIntentLister;
  nowMs?: number;
  config?: MissedPiSweepConfig;
};

async function persistVerificationForFinding(
  pi: Stripe.PaymentIntent,
  finding: MissedPiFinding,
): Promise<void> {
  try {
    const result = await verifyPaymentIntent(pi, { dbLookupAttempts: 1, dbLookupDelayMs: 0 });
    const db = await getDb();
    await db.insert(paymentVerificationLogs).values({
      stripePaymentIntentId: result.stripePaymentIntentId,
      stripeEventId: null,
      schoolId: result.schoolId,
      parentId: result.parentId,
      enrollmentIds: result.enrollmentIds.length > 0 ? result.enrollmentIds : finding.enrollmentIds,
      amountCents: result.amountCents || finding.amountCents,
      overallStatus: result.overallStatus,
      checks: result.checks,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error(`${MISSED_PI_SWEEP_LOG_PREFIX} failed to persist payment_verification_logs:`, err);
  }
}

async function alertFinding(finding: MissedPiFinding): Promise<boolean> {
  try {
    const errorLog = await storage.createErrorLog({
      errorType: 'missed_payment_intent',
      errorCode: 'stripe_db_parity',
      severity: finding.severity === 'critical' ? 'high' : 'medium',
      message:
        finding.classification === 'missed'
          ? `Succeeded Stripe PI ${finding.paymentIntentId} (${formatCents(finding.amountCents)}) missing from payments`
          : `Succeeded Stripe PI ${finding.paymentIntentId} in stripe_payment_history but not payments`,
      route: '/scheduled-job/missed-payment-intent-sweep',
      method: 'CRON',
      userEmail: finding.parentEmail,
      schoolId: null,
      stackTrace: null,
      metadata: redactFindingForLog(finding),
      notificationSent: false,
    } as any);
    await errorNotificationService.sendImmediateNotification(errorLog);
    return true;
  } catch (err) {
    console.error(`${MISSED_PI_SWEEP_LOG_PREFIX} failed to write error_log:`, err);
    return false;
  }
}

async function autoFixFinding(
  pi: Stripe.PaymentIntent,
  finding: MissedPiFinding,
): Promise<'fixed' | 'skipped' | 'failed'> {
  if (!finding.autoFixEligible) return 'skipped';
  if (pi.status !== 'succeeded') return 'skipped';
  if (isPaymentIntentFullyRefunded(pi)) return 'skipped';

  try {
    if (finding.paymentType === 'scheduled_payment') {
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
    console.log(`${MISSED_PI_SWEEP_LOG_PREFIX} AUTO_FIX replayed finalize for ${pi.id}`);
    return 'fixed';
  } catch (err) {
    console.error(`${MISSED_PI_SWEEP_LOG_PREFIX} AUTO_FIX failed for ${pi.id}:`, err);
    return 'failed';
  }
}

export async function runMissedPaymentIntentSweep(
  options: RunMissedPiSweepOptions = {},
): Promise<MissedPiSweepResult> {
  const started = Date.now();
  const config = options.config ?? resolveMissedPiSweepConfig();
  const lookbackDays = options.lookbackDays ?? config.lookbackDays;
  const dryRun = options.dryRun === true;
  const notify = options.notify === true && !dryRun;
  const autoFix = options.autoFix === true && !dryRun;

  const stripe = options.stripe ?? createSweepStripeClient();
  const listed = await listSucceededAsaPaymentIntents(stripe, {
    lookbackDays,
    maxPages: config.maxPages,
    maxPaymentIntents: config.maxPaymentIntents,
    pageSize: config.pageSize,
    nowMs: options.nowMs,
  });

  const presence = await lookupDbPresence(listed.paymentIntents.map((pi) => pi.id));
  const findings = collectSweepFindings(listed.paymentIntents, presence);
  const missed = findings.filter((f) => f.classification === 'missed');
  const historyOnly = findings.filter((f) => f.classification === 'history_only');

  const byId = new Map(listed.paymentIntents.map((pi) => [pi.id, pi]));
  const autoFixed: string[] = [];
  const autoFixSkipped: string[] = [];
  const autoFixFailed: string[] = [];
  let notified = 0;

  for (const finding of [...missed, ...historyOnly]) {
    console.log(
      `${MISSED_PI_SWEEP_LOG_PREFIX} ${finding.classification} pi=${finding.paymentIntentId} ` +
        `amount=${formatCents(finding.amountCents)} parent=${finding.parentEmail ?? 'unknown'}`,
    );

    const pi = byId.get(finding.paymentIntentId);
    if (notify && pi) {
      await persistVerificationForFinding(pi, finding);
      if (await alertFinding(finding)) notified += 1;
    }

    if (finding.classification !== 'missed') continue;
    if (!autoFix) continue;
    if (!pi) {
      autoFixSkipped.push(finding.paymentIntentId);
      continue;
    }
    const outcome = await autoFixFinding(pi, finding);
    if (outcome === 'fixed') autoFixed.push(finding.paymentIntentId);
    else if (outcome === 'failed') autoFixFailed.push(finding.paymentIntentId);
    else autoFixSkipped.push(finding.paymentIntentId);
  }

  const durationMs = Date.now() - started;
  console.log(
    `${MISSED_PI_SWEEP_LOG_PREFIX} scanned=${listed.paymentIntents.length} missed=${missed.length} ` +
      `historyOnly=${historyOnly.length} notified=${notified} autoFixed=${autoFixed.length} ` +
      `pages=${listed.pagesFetched} truncated=${listed.truncated} (${durationMs}ms)`,
  );

  return {
    lookbackDays,
    pagesFetched: listed.pagesFetched,
    truncated: listed.truncated,
    scanned: listed.paymentIntents.length,
    missed,
    historyOnly,
    autoFixed,
    autoFixSkipped,
    autoFixFailed,
    notified,
    durationMs,
  };
}

/** Re-export classify for callers that already have a PI + presence. */
export { classifyMissedPaymentIntent };
