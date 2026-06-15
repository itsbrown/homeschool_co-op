import type Stripe from 'stripe';
import type { Payment } from '@shared/schema';
import { storage } from '../storage';
import { sendPaymentReceipt } from './email-service';
import { createReceiptFromPayment } from '../services/receiptService';
import { splitCentsEvenly } from '../api/billing';
import { resolveScheduledPaymentEnrollmentIds } from './scheduled-payment-intent-metadata';
import { ensureScheduledPaymentCreditsConsumed } from './ensure-scheduled-payment-credits-consumed';
import { dataLayer } from '../services/dataLayer';

export type FinalizeSucceededScheduledPaymentIntentResult = {
  scheduledPaymentId: number | null;
  paymentId: number | null;
  appliedEnrollmentIds: number[];
  skippedDuplicate: boolean;
};

export type FinalizeSucceededScheduledPaymentIntentOptions = {
  existingPayment?: Payment | null | undefined;
  skipReceiptEmail?: boolean;
  skipRealtimeRefresh?: boolean;
};

/**
 * Idempotent fulfillment for succeeded scheduled_payment PaymentIntents.
 * Shared by webhook backup and POST /api/billing/fulfill-payment-intent (client primary).
 */
export async function finalizeSucceededScheduledPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  options?: FinalizeSucceededScheduledPaymentIntentOptions,
): Promise<FinalizeSucceededScheduledPaymentIntentResult> {
  const scheduledPaymentIdRaw = paymentIntent.metadata.scheduledPaymentId;
  const parentEmail = paymentIntent.metadata.parentEmail;
  const spIdParsed = parseInt(String(scheduledPaymentIdRaw), 10);

  if (!Number.isFinite(spIdParsed) || spIdParsed <= 0 || !parentEmail) {
    throw new Error(
      `Scheduled payment metadata missing scheduledPaymentId or parentEmail for ${paymentIntent.id}`,
    );
  }

  let scheduledPayment =
    Number.isFinite(spIdParsed) && spIdParsed > 0
      ? await storage.getScheduledPaymentById(spIdParsed)
      : undefined;
  if (!scheduledPayment) {
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);
    scheduledPayment = allScheduledPayments.find((p) => p.id === spIdParsed);
  }

  if (!scheduledPayment) {
    throw new Error(`Scheduled payment ${scheduledPaymentIdRaw} not found for PI ${paymentIntent.id}`);
  }

  const existingPayment =
    options?.existingPayment ?? (await storage.getPaymentByStripeId(paymentIntent.id));

  const creditsAppliedCents =
    parseInt(String(paymentIntent.metadata.creditsAppliedCents || '0'), 10) || 0;
  const userIdForCredits = parseInt(String(paymentIntent.metadata.userId || '0'), 10) || 0;
  const creditHoldSessionId =
    (paymentIntent.metadata.creditHoldSessionId as string) ||
    (paymentIntent.metadata.holdSessionId as string) ||
    '';

  if (creditsAppliedCents > 0 && userIdForCredits > 0) {
    const creditResult = await ensureScheduledPaymentCreditsConsumed({
      scheduledPaymentId: spIdParsed,
      userId: userIdForCredits,
      creditsAppliedCents,
      creditHoldSessionId: creditHoldSessionId || undefined,
      installmentNumber: paymentIntent.metadata.installmentNumber,
      totalInstallments: paymentIntent.metadata.totalInstallments,
    });
    if (creditResult.consumedCents < creditsAppliedCents && !creditResult.skippedAlreadyApplied) {
      throw new Error(
        `Credit ledger incomplete for scheduled payment ${scheduledPaymentIdRaw}: ` +
          `expected ${creditsAppliedCents}c, recorded ${creditResult.consumedCents}c`,
      );
    }
  }

  if (String(scheduledPayment.status) === 'completed') {
    return {
      scheduledPaymentId: spIdParsed,
      paymentId: existingPayment?.id ?? null,
      appliedEnrollmentIds: [],
      skippedDuplicate: true,
    };
  }

  const completionSrc =
    paymentIntent.metadata.autoPayInitiated === 'true' ? 'stripe_autopay' : 'stripe_checkout';
  await storage.updateScheduledPayment(spIdParsed, {
    status: 'completed',
    processedAt: new Date(),
    completionSource: completionSrc,
  });

  const enrollmentIds = resolveScheduledPaymentEnrollmentIds(
    scheduledPayment,
    paymentIntent.metadata as Record<string, string | undefined>,
  );

  const originalAmount =
    parseInt(String(paymentIntent.metadata.originalAmountCents || '0'), 10) || paymentIntent.amount;
  const totalPaymentAmount = creditsAppliedCents > 0 ? originalAmount : paymentIntent.amount;
  const totalCents = Number.isInteger(totalPaymentAmount)
    ? totalPaymentAmount
    : Math.round(Number(totalPaymentAmount)) || paymentIntent.amount;

  let childNameForPayment = 'Child';
  let classNameForPayment = 'Class';
  let payerLine = `Installment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`;
  if (enrollmentIds.length === 1) {
    const enrollmentForLabel = await storage.getProgramEnrollmentById(enrollmentIds[0]!);
    if (enrollmentForLabel) {
      payerLine = `${enrollmentForLabel.childName} - ${enrollmentForLabel.className}`;
      childNameForPayment = enrollmentForLabel.childName || childNameForPayment;
      classNameForPayment = enrollmentForLabel.className || classNameForPayment;
    }
  } else if (enrollmentIds.length > 1) {
    const parts: string[] = [];
    for (const eid of enrollmentIds) {
      const e = await storage.getProgramEnrollmentById(eid);
      if (e?.childName && e?.className) {
        parts.push(`${e.childName} - ${e.className}`);
      }
    }
    payerLine = parts.length > 0 ? parts.join('; ') : payerLine;
    childNameForPayment = 'Multiple children';
    classNameForPayment = `${enrollmentIds.length} enrollments`;
  }

  const parentUser = await storage.getUserByEmail(parentEmail);
  const schoolId = scheduledPayment.schoolId || parentUser?.schoolId || 1;

  const paymentRecord = {
    schoolId,
    parentId: parentUser?.id ?? null,
    parentEmail,
    childName: childNameForPayment,
    className: classNameForPayment,
    description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency || 'usd',
    status: 'completed' as const,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: null as string | null,
    stripeRefundId: null as string | null,
    originalPaymentId: null as number | null,
    enrollmentIds,
    metadata: {
      scheduledPaymentId: String(scheduledPaymentIdRaw),
      installmentNumber: scheduledPayment.installmentNumber,
      totalInstallments: scheduledPayment.totalInstallments,
      enrollmentIds: JSON.stringify(enrollmentIds),
    },
    paymentDate: new Date(),
  };

  let paymentId = existingPayment?.id ?? null;
  if (!existingPayment) {
    const created = await storage.createPayment(paymentRecord);
    paymentId = created.id;
  }

  if (enrollmentIds.length > 0) {
    const allocation = splitCentsEvenly(Math.max(0, totalCents), enrollmentIds.length);
    for (let i = 0; i < enrollmentIds.length; i++) {
      const targetEnrollmentId = enrollmentIds[i];
      const shareCents = allocation[i] ?? 0;
      const enrollment = await storage.getProgramEnrollmentById(targetEnrollmentId);
      if (!enrollment) continue;

      const owedBefore = Math.max(
        0,
        (enrollment.totalCost || 0) - (enrollment.totalPaid || 0),
      );
      const toApply = Math.min(shareCents, owedBefore);
      if (toApply <= 0) continue;

      const newAmountPaid = (enrollment.totalPaid || 0) + toApply;
      const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
      await storage.updateProgramEnrollment(targetEnrollmentId, {
        totalPaid: newAmountPaid,
        remainingBalance: newBalance,
        paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
      });
    }
  }

  await createReceiptFromPayment({
    schoolId,
    parentId: parentUser?.id,
    parentEmail,
    amount: paymentIntent.amount,
    description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments} - ${classNameForPayment}`,
    childName: childNameForPayment,
    className: classNameForPayment,
    enrollmentIds,
  });

  if (!options?.skipReceiptEmail) {
    try {
      const parentName = parentUser?.name || parentEmail.split('@')[0];
      const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
      const formatDate = (date: string) =>
        new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(date));

      await sendPaymentReceipt({
        parentEmail,
        parentName,
        receiptNumber: paymentIntent.id,
        paymentDate: formatDate(new Date().toISOString()),
        paymentMethod: 'Credit Card',
        amount: formatCurrency(paymentIntent.amount),
        childName: childNameForPayment,
        className: classNameForPayment,
        notes: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
      });
    } catch (emailError) {
      console.error('❌ Failed to send scheduled payment receipt email:', emailError);
    }
  }

  if (!options?.skipRealtimeRefresh) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      dataLayer.broadcastBillingUpdate(parentEmail, {
        type: 'scheduled_payment_complete',
        paymentId: String(scheduledPaymentIdRaw),
        amount: paymentIntent.amount,
        totalBalanceFormatted: `$${(paymentIntent.amount / 100).toFixed(2)}`,
        timestamp: new Date().toISOString(),
      });
      dataLayer.broadcastPaymentComplete(parentEmail, {
        amount: paymentIntent.amount,
        paymentId: String(scheduledPaymentIdRaw),
        description: payerLine,
        timestamp: new Date().toISOString(),
      });
      await dataLayer.refreshUserData(parentEmail);
    } catch (error) {
      console.error('❌ Failed to push real-time update for scheduled payment:', error);
    }
  }

  return {
    scheduledPaymentId: spIdParsed,
    paymentId,
    appliedEnrollmentIds: enrollmentIds,
    skippedDuplicate: false,
  };
}
