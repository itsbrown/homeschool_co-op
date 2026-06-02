/**
 * Phase A — read-only post-payment verification (no ledger mutations).
 * See docs/plans/post-payment-verification-pipeline.md
 */

import type Stripe from 'stripe';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { parseBalanceIntentCredits } from '../lib/balance-payment-metadata';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';
import {
  checkoutPlanUsesInstallmentPhases,
  type CheckoutPaymentFrequency,
  type CheckoutPaymentPlanId,
} from '@shared/checkout-payment-plan';
import { programEnrollments, scheduledPayments } from '@shared/schema';
import type { Payment } from '@shared/schema';
import { buildMembershipWaterfallChecks } from '../lib/verify-membership-waterfall';

export type VerificationSeverity = 'info' | 'warning' | 'critical';

export type VerificationCheck = {
  key: string;
  severity: VerificationSeverity;
  message: string;
  detail?: Record<string, unknown>;
};

export type VerificationOverallStatus = 'pass' | 'warning' | 'critical';

export type VerificationResult = {
  stripePaymentIntentId: string;
  stripeEventId?: string;
  amountCents: number;
  enrollmentIds: number[];
  schoolId: number | null;
  parentId: number | null;
  checks: VerificationCheck[];
  overallStatus: VerificationOverallStatus;
  durationMs: number;
};

const SEVERITY_RANK: Record<VerificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function computeOverallStatus(checks: VerificationCheck[]): VerificationOverallStatus {
  let max = 0;
  for (const c of checks) {
    max = Math.max(max, SEVERITY_RANK[c.severity]);
  }
  if (max >= SEVERITY_RANK.critical) return 'critical';
  if (max >= SEVERITY_RANK.warning) return 'warning';
  return 'pass';
}

export function parseEnrollmentIdsFromPaymentIntent(
  pi: Pick<Stripe.PaymentIntent, 'metadata'>,
  payment?: Payment,
): number[] {
  const ids = new Set<number>();
  const fromPayment = payment?.enrollmentIds;
  if (Array.isArray(fromPayment)) {
    for (const id of fromPayment) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
  }
  try {
    const parsed = JSON.parse(String(pi.metadata?.enrollmentIds ?? '[]'));
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) ids.add(n);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const items = JSON.parse(String(pi.metadata?.itemsJson ?? '[]'));
    if (Array.isArray(items)) {
      for (const item of items) {
        const n = Number(item?.enrollmentId ?? item?.enrollment_id);
        if (Number.isFinite(n) && n > 0) ids.add(n);
      }
    }
  } catch {
    /* ignore */
  }
  return [...ids].sort((a, b) => a - b);
}

function parseCheckoutPlan(meta: Stripe.Metadata): {
  paymentPlan: CheckoutPaymentPlanId;
  paymentFrequency: CheckoutPaymentFrequency;
} {
  const planRaw = String(meta.paymentPlan ?? 'full').toLowerCase();
  const paymentPlan: CheckoutPaymentPlanId =
    planRaw === 'biweekly' || planRaw === 'deposit' || planRaw === 'split'
      ? (planRaw as CheckoutPaymentPlanId)
      : 'full';
  const freqRaw = String(meta.paymentFrequency ?? 'one_time').toLowerCase();
  const paymentFrequency: CheckoutPaymentFrequency =
    freqRaw === 'weekly' || freqRaw === 'biweekly' || freqRaw === 'monthly'
      ? (freqRaw as CheckoutPaymentFrequency)
      : 'one_time';
  return { paymentPlan, paymentFrequency };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function loadPaymentWithRetry(
  piId: string,
  attempts: number,
  delayMs: number,
): Promise<Payment | undefined> {
  for (let i = 0; i < attempts; i++) {
    const row = await storage.getPaymentByStripeId(piId);
    if (row) return row;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return undefined;
}

/**
 * Run read-only verification for a succeeded PaymentIntent.
 * Pass `payment` when already loaded to skip DB lookup for parity check.
 */
export async function verifyPaymentIntent(
  pi: Stripe.PaymentIntent,
  options?: {
    stripeEventId?: string;
    payment?: Payment;
    dbLookupAttempts?: number;
    dbLookupDelayMs?: number;
  },
): Promise<VerificationResult> {
  const started = Date.now();
  const checks: VerificationCheck[] = [];
  const meta = (pi.metadata ?? {}) as Stripe.Metadata;
  const paymentType = meta.paymentType || meta.type || '';

  const dbAttempts = options?.dbLookupAttempts ?? 3;
  const dbDelayMs = options?.dbLookupDelayMs ?? 400;

  const payment =
    options?.payment ?? (await loadPaymentWithRetry(pi.id, dbAttempts, dbDelayMs));
  const enrollmentIds = parseEnrollmentIdsFromPaymentIntent(pi, payment);

  let schoolId: number | null = payment?.schoolId ?? null;
  let parentId: number | null = payment?.parentId ?? null;

  if (pi.status !== 'succeeded') {
    checks.push({
      key: 'stripe_status',
      severity: 'critical',
      message: `PaymentIntent status is ${pi.status}, expected succeeded`,
    });
  }

  if (!payment) {
    checks.push({
      key: 'stripe_db_parity',
      severity: 'critical',
      message: 'No payments row found for succeeded PaymentIntent',
      detail: { piId: pi.id, attempts: dbAttempts },
    });
  } else {
    const okStatus =
      payment.status === 'completed' ||
      payment.status === 'succeeded' ||
      payment.status === 'pending';
    if (!okStatus) {
      checks.push({
        key: 'stripe_db_parity',
        severity: 'warning',
        message: `payments row status is ${payment.status}`,
        detail: { paymentId: payment.id },
      });
    }
    if (payment.amount !== pi.amount) {
      checks.push({
        key: 'stripe_db_parity',
        severity: 'critical',
        message: 'payments.amount does not match PaymentIntent amount',
        detail: { paymentAmount: payment.amount, piAmount: pi.amount },
      });
    }
    if (payment.status === 'pending') {
      checks.push({
        key: 'stripe_db_parity',
        severity: 'warning',
        message: 'payments row still pending after webhook (may settle shortly)',
      });
    }
  }

  for (const id of enrollmentIds) {
    const enr = await storage.getProgramEnrollmentById(id);
    if (!enr) {
      checks.push({
        key: 'enrollment_refs',
        severity: 'critical',
        message: `Enrollment #${id} referenced on PI but not found`,
      });
      continue;
    }
    if (schoolId == null && enr.schoolId) schoolId = enr.schoolId;
    if (parentId == null && enr.parentId) parentId = enr.parentId;
  }

  const { paymentPlan, paymentFrequency } = parseCheckoutPlan(meta);
  const usesInstallments = checkoutPlanUsesInstallmentPhases(paymentPlan, paymentFrequency);
  const installmentNum = parseInt(String(meta.installmentNumber ?? '1'), 10) || 1;
  const totalInstallments = parseInt(String(meta.totalInstallments ?? '1'), 10) || 1;

  if (
    enrollmentIds.length > 0 &&
    paymentType !== 'scheduled_payment' &&
    !usesInstallments &&
    pi.amount > 0
  ) {
    let sumOutstanding = 0;
    for (const id of enrollmentIds) {
      const enr = await storage.getProgramEnrollmentById(id);
      if (enr) sumOutstanding += resolveEnrollmentEffectiveBalance(enr);
    }
    if (sumOutstanding > 0) {
      checks.push({
        key: 'enrollment_ledger',
        severity: 'critical',
        message: 'Pay-in-full checkout succeeded but enrollments still show balance owed',
        detail: { sumOutstandingCents: sumOutstanding, enrollmentIds },
      });
    }
  }

  if (usesInstallments && installmentNum === 1 && totalInstallments > 1 && enrollmentIds.length > 0) {
    const anchorId = enrollmentIds[0];
    const db = await getDb();
    const futureRows = await db
      .select({ id: scheduledPayments.id })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.enrollmentId, anchorId),
          sql`${scheduledPayments.status} IN ('pending', 'scheduled', 'overdue')`,
          sql`${scheduledPayments.installmentNumber} > 1`,
        ),
      )
      .limit(1);
    if (futureRows.length === 0) {
      checks.push({
        key: 'scheduled_payments',
        severity: 'critical',
        message: 'Installment plan first payment succeeded but no future scheduled installments on anchor enrollment',
        detail: { anchorEnrollmentId: anchorId, totalInstallments },
      });
    }
  }

  const membershipChecks = await buildMembershipWaterfallChecks(pi, payment);
  checks.push(...membershipChecks);

  const { creditsAppliedCents } = parseBalanceIntentCredits(meta as Record<string, string | undefined>);
  if (creditsAppliedCents > 0) {
    const logs = await storage.getUnifiedCreditUsageLogsByCheckoutPaymentIntentId(pi.id);
    const logged = logs.reduce((s, l) => s + (l.amountCents ?? 0), 0);
    if (logged < creditsAppliedCents) {
      checks.push({
        key: 'credits',
        severity: 'critical',
        message: 'Checkout applied credits in metadata but unified_credit_usage_logs is incomplete',
        detail: { creditsAppliedCents, loggedCents: logged },
      });
    }
  }

  const parentEmail = meta.parentEmail || payment?.parentEmail;
  if (parentEmail && usesInstallments) {
    const user = await storage.getUserByEmail(parentEmail);
    if (user?.autoPayEnabled && !user.stripeDefaultPaymentMethodId) {
      checks.push({
        key: 'autopay_readiness',
        severity: 'warning',
        message: 'Parent has auto-pay enabled but no default payment method on file',
        detail: { userId: user.id },
      });
    }
  }

  const overallStatus = computeOverallStatus(checks);
  return {
    stripePaymentIntentId: pi.id,
    stripeEventId: options?.stripeEventId,
    amountCents: pi.amount,
    enrollmentIds,
    schoolId,
    parentId,
    checks,
    overallStatus,
    durationMs: Date.now() - started,
  };
}
