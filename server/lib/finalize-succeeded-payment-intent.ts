import type Stripe from 'stripe';
import { and, eq, gte } from 'drizzle-orm';
import type { InsertPayment, Payment } from '@shared/schema';
import { emailLog } from '@shared/schema';
import { getStripeClient } from '../config/stripe';
import { getDb } from '../db';
import { storage } from '../storage';
import { dataLayer } from '../services/dataLayer';
import {
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
} from './balance-payment-metadata';
import { cancelPendingScheduledAfterEnrollmentPayoff } from './cancel-pending-scheduled-after-payoff';
import { fulfillBalancePaymentIntent } from './fulfill-balance-payment-intent';
import { sendPaymentConfirmationEmail } from './email-service';
import { resolveMembershipReserveForPaymentIntent } from './resolve-membership-reserve-for-payment';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';

export type FinalizeSucceededPaymentIntentResult = {
  appliedCents: number;
  creditsConsumedCents: number;
  paymentId: number | null;
  scheduledRowsCreated: number;
  confirmationEmailSent: boolean;
  /** Webhook compat until receipt path is consolidated. */
  fulfillment: Awaited<ReturnType<typeof fulfillBalancePaymentIntent>>;
  paymentHistoryId: number | null;
  createdPaymentRecord: boolean;
};

export type FinalizeSucceededPaymentIntentOptions = {
  /** When true, skip parent confirmation email (caller sends its own). */
  skipConfirmationEmail?: boolean;
  /** When true, skip dataLayer.refreshUserData after fulfillment. */
  skipRealtimeRefresh?: boolean;
  /** When false, skip Stripe installment schedule persistence. */
  persistScheduledPayments?: boolean;
};

function parseIntegerCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    return parsed;
  }
  return null;
}

function parseEnrollmentIdsFromMetadata(
  metadata: Record<string, string | undefined>,
): number[] {
  try {
    const parsed = JSON.parse(metadata.enrollmentIds || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === 'number' && Number.isInteger(id));
  } catch {
    return [];
  }
}

async function resolvePaymentIntent(
  paymentIntentOrId: string | Stripe.PaymentIntent,
): Promise<Stripe.PaymentIntent> {
  if (typeof paymentIntentOrId !== 'string') {
    // Webhook event payloads may omit status; caller is payment_intent.succeeded.
    if (paymentIntentOrId.status && paymentIntentOrId.status !== 'succeeded') {
      throw new Error(`PaymentIntent status is ${paymentIntentOrId.status}, not succeeded`);
    }
    return paymentIntentOrId;
  }
  if (!paymentIntentOrId.startsWith('pi_')) {
    throw new Error('paymentIntentId must be a Stripe PaymentIntent id');
  }
  const stripe = await getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentOrId);
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`PaymentIntent status is ${paymentIntent.status}, not succeeded`);
  }
  return paymentIntent;
}

async function wasConfirmationEmailAlreadySent(
  parentEmail: string,
  payment: Payment,
): Promise<boolean> {
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.confirmationEmailSentAt === 'string' && meta.confirmationEmailSentAt.length > 0) {
    return true;
  }

  try {
    const db = await getDb();
    const since = payment.createdAt ?? payment.paymentDate ?? new Date(0);
    const rows = await db
      .select({ id: emailLog.id })
      .from(emailLog)
      .where(
        and(
          eq(emailLog.recipientEmail, parentEmail),
          eq(emailLog.type, 'payment_confirmation'),
          eq(emailLog.status, 'sent'),
          gte(emailLog.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function ensurePaymentRecord(
  paymentIntent: Stripe.PaymentIntent,
  enrollmentIds: number[],
  existingPayment: Payment | undefined,
): Promise<{ payment: Payment | null; created: boolean }> {
  if (
    existingPayment?.id &&
    (existingPayment.status === 'completed' ||
      existingPayment.status === 'succeeded' ||
      existingPayment.status === 'processing')
  ) {
    return { payment: existingPayment, created: false };
  }

  const meta = paymentIntent.metadata as Record<string, string | undefined>;
  const { paymentPlan = 'full' } = meta;
  const parentEmail = (meta.parentEmail || '').trim();
  if (!parentEmail) {
    throw new Error(`Cannot create payment record: missing parentEmail on PI ${paymentIntent.id}`);
  }

  const currentPaymentAmount = parseIntegerCents(paymentIntent.amount);
  if (currentPaymentAmount === null || currentPaymentAmount <= 0) {
    throw new Error('Payment intent amount must be a positive integer in cents');
  }

  const resolved = await resolveMembershipReserveForPaymentIntent(paymentIntent);
  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(meta);
  const totalChargedCents =
    resolved?.allocationGrossCents ??
    totalCentsForBalanceAllocation({
      paymentIntentAmountCents: currentPaymentAmount,
      creditsAppliedCents,
      originalAmountCents,
    });

  const enrollments = [];
  for (const enrollmentId of enrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (enrollment) {
      enrollments.push(enrollment);
    }
  }

  if (enrollments.length === 0) {
    if (existingPayment?.id) {
      return { payment: existingPayment, created: false };
    }
    console.log('⚠️ No enrollments found for payment record on PI', paymentIntent.id);
    return { payment: null, created: false };
  }

  const parentUser = await storage.getUserByEmail(parentEmail);
  const schoolId = enrollments[0]?.schoolId || parentUser?.schoolId;
  if (!schoolId) {
    throw new Error(`Cannot create payment record: no valid school ID for parent ${parentEmail}`);
  }

  const paymentRecord: InsertPayment = {
    schoolId,
    parentId: parentUser?.id || null,
    stripePaymentIntentId: paymentIntent.id,
    parentEmail,
    childName: enrollments[0].childName || 'Multiple Children',
    className: enrollments.length > 1 ? 'Multiple Classes' : enrollments[0].className || 'Class',
    description: `Payment for ${enrollments.length} enrollment(s) - ${paymentPlan} plan`,
    amount: totalChargedCents,
    currency: paymentIntent.currency || 'usd',
    status: 'completed' as const,
    stripeChargeId: null,
    stripeRefundId: null,
    originalPaymentId: null,
    paymentMethod: 'stripe' as const,
    enrollmentIds,
    metadata: {
      enrollmentIds,
      paymentDate: new Date().toISOString(),
      paymentPlan,
      installmentNumber: 1,
      totalInstallments: 1,
      isFirstInstallment: true,
      ...(creditsAppliedCents > 0
        ? {
            creditsAppliedCents,
            stripeChargedCents: currentPaymentAmount,
            originalAmountCents: originalAmountCents || currentPaymentAmount + creditsAppliedCents,
          }
        : {}),
    },
    paymentDate: new Date(),
  };

  if (existingPayment?.id) {
    const updated = await storage.updatePayment(existingPayment.id, paymentRecord);
    return { payment: updated ?? existingPayment, created: false };
  }

  const created = await storage.createPayment(paymentRecord);
  return { payment: created, created: true };
}

async function sendIdempotentConfirmationEmail(
  paymentIntent: Stripe.PaymentIntent,
  payment: Payment,
  enrollmentIds: number[],
): Promise<boolean> {
  const parentEmail = (paymentIntent.metadata?.parentEmail as string | undefined)?.trim();
  if (!parentEmail) {
    return false;
  }

  if (await wasConfirmationEmailAlreadySent(parentEmail, payment)) {
    return false;
  }

  const parentUser = await storage.getUserByEmail(parentEmail);
  const enrollmentDetails = await Promise.all(
    enrollmentIds.map(async (enrollmentId) => {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (!enrollment) {
        return {
          childName: 'Unknown Child',
          className: 'Unknown Class',
          price: 0,
          amountPaid: 0,
        };
      }
      const child = enrollment.childId ? await storage.getChildById(enrollment.childId) : null;
      const classDetails = enrollment.classId ? await storage.getClassById(enrollment.classId) : null;
      return {
        childName: child ? `${child.firstName} ${child.lastName}` : enrollment.childName || 'Unknown Child',
        className: classDetails?.title || classDetails?.description || enrollment.className || 'Unknown Class',
        price: enrollment.totalCost || classDetails?.price || 0,
        amountPaid: enrollment.totalPaid ?? 0,
      };
    }),
  );

  const emailSent = await sendPaymentConfirmationEmail({
    parentEmail,
    parentName: parentUser?.name || parentEmail.split('@')[0] || 'Parent',
    payment,
    enrollmentDetails,
    paymentPlan: paymentIntent.metadata?.paymentPlan,
  });

  if (emailSent) {
    const priorMeta = (payment.metadata ?? {}) as Record<string, unknown>;
    await storage.updatePayment(payment.id, {
      metadata: {
        ...priorMeta,
        confirmationEmailSentAt: new Date().toISOString(),
        confirmationEmailPaymentIntentId: paymentIntent.id,
      },
    });
    return true;
  }

  return false;
}

/**
 * Single idempotent path for succeeded balance/cart/pay-in-full PaymentIntents.
 * Accepts a PI id (API) or retrieved PI object (webhook). enrollmentIds come from PI metadata
 * unless an override is supplied (webhook compat).
 */
export async function finalizeSucceededPaymentIntent(
  paymentIntentOrId: string | Stripe.PaymentIntent,
  enrollmentIdsOverride?: number[],
  options?: FinalizeSucceededPaymentIntentOptions,
): Promise<FinalizeSucceededPaymentIntentResult> {
  const paymentIntent = await resolvePaymentIntent(paymentIntentOrId);
  const meta = paymentIntent.metadata as Record<string, string | undefined>;
  const enrollmentIds =
    enrollmentIdsOverride && enrollmentIdsOverride.length > 0
      ? enrollmentIdsOverride
      : parseEnrollmentIdsFromMetadata(meta);

  if (enrollmentIds.length === 0) {
    throw new Error(`No enrollmentIds on PaymentIntent metadata for ${paymentIntent.id}`);
  }

  const existingPayment = await storage.getPaymentByStripeId(paymentIntent.id);

  const { payment, created } = await ensurePaymentRecord(
    paymentIntent,
    enrollmentIds,
    existingPayment,
  );

  const fulfillment = await fulfillBalancePaymentIntent(paymentIntent, enrollmentIds, {
    paymentHistoryId: payment?.id ?? existingPayment?.id,
  });

  let scheduledRowsCreated = 0;
  if (options?.persistScheduledPayments !== false) {
    const planService = new StripePaymentPlanService(storage as any);
    const scheduled = await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(
      paymentIntent,
    );
    scheduledRowsCreated = scheduled?.length ?? 0;
  }

  await cancelPendingScheduledAfterEnrollmentPayoff(fulfillment.enrollmentApply.enrollmentIds);

  let confirmationEmailSent = false;
  if (!options?.skipConfirmationEmail && payment?.id) {
    confirmationEmailSent = await sendIdempotentConfirmationEmail(
      paymentIntent,
      payment,
      enrollmentIds,
    );
  }

  const parentEmail = (meta.parentEmail || '').trim();
  if (!options?.skipRealtimeRefresh && parentEmail) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await dataLayer.refreshUserData(parentEmail);
  }

  const paymentId = payment?.id ?? existingPayment?.id ?? null;

  return {
    appliedCents: fulfillment.enrollmentApply.appliedCents,
    creditsConsumedCents: fulfillment.creditsConsumedCents,
    paymentId,
    scheduledRowsCreated,
    confirmationEmailSent,
    fulfillment,
    paymentHistoryId: paymentId,
    createdPaymentRecord: created,
  };
}
