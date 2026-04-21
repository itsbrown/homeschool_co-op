/**
 * Auto-Pay Scheduler Service
 *
 * Automatically charges parents' saved payment methods for scheduled installments
 * that are past their due date and where the parent has opted in to auto-pay.
 *
 * Runs every 24 hours in development/staging.
 * NOTE: This service requires AUTO_PAY_SINGLE_INSTANCE=true to start.
 *       It is NOT compatible with Autoscale deployments.
 *       For production, use Replit Reserved VM or Scheduled Deployments only.
 *       Set AUTO_PAY_SINGLE_INSTANCE=true in the environment before enabling.
 *
 * Payment method capture: When a parent completes any Stripe checkout, their
 * payment method ID (pm_xxx) is saved to their user record by the webhook handler.
 * This service uses that saved ID to initiate off-session charges.
 *
 * Daily cycle order:
 *   1. recoverStuckProcessingPayments() — fix crash survivors
 *   2. sendPreChargeNotifications()     — warn parents 24h before charge
 *   3. processAutoPayments()            — charge due payments
 */

import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { sendScheduledPaymentReminder } from '../lib/email-service';

export const AUTOPAY_MAX_RETRIES = 3;

async function notifyAutoPayFailure(scheduledPayment: any, parent: any, errMessage: string): Promise<void> {
  try {
    const notification = await storage.createNotification({
      senderId: parent.id,
      schoolId: scheduledPayment.schoolId || parent.schoolId || null,
      type: 'in_app',
      priority: 'high',
      subject: `Auto-payment failed — action required`,
      content: `Your auto-payment of $${((scheduledPayment.amount || 0) / 100).toFixed(2)} could not be processed. Please visit the Payments page to pay manually.`,
      targetType: 'individual',
      targetData: { userId: parent.id },
      targetUserIds: [parent.id],
      status: 'sending',
      scheduledFor: null,
      expiresAt: null,
    });

    if (notification?.id) {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: parent.id,
        deliveryType: 'in_app',
        status: 'delivered',
      });
    }
  } catch (notifErr: any) {
    console.error('[AutoPay] Failed to create failure notification:', notifErr.message);
  }

  try {
    const enrollment = scheduledPayment.enrollmentId
      ? await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId)
      : null;

    await sendScheduledPaymentReminder({
      parentEmail: parent.email,
      childName: enrollment?.childName || 'Your child',
      className: enrollment?.className || 'your class',
      schoolName: 'American Seekers Academy',
      amount: scheduledPayment.amount || 0,
      dueDate: new Date(scheduledPayment.scheduledDate || Date.now()),
      daysUntilDue: -1,
      paymentId: scheduledPayment.id,
      installmentNumber: scheduledPayment.installmentNumber || 1,
      totalInstallments: scheduledPayment.totalInstallments || 1,
      urgency: 'critical',
    });
  } catch (emailErr: any) {
    console.error('[AutoPay] Failed to send failure email:', emailErr.message);
  }
}

async function notifyAutoPayCreditsSuccess(scheduledPayment: any, parent: any, creditsApplied: number, enrollment: any): Promise<void> {
  const amountDisplay = `$${(creditsApplied / 100).toFixed(2)}`;
  const className = enrollment?.className || 'your class';

  // schoolId must come from the enrollment for correct multi-tenant scoping;
  // fall back to the scheduled payment's schoolId only if enrollment is absent.
  const schoolId = enrollment?.schoolId ?? scheduledPayment.schoolId ?? null;
  if (!schoolId) {
    console.warn(`[AutoPay] Skipping credits-success notification for payment ${scheduledPayment.id} — no schoolId available`);
    return;
  }

  // senderId must be a system/admin user — look up the school's admin.
  let senderId: number | null = null;
  try {
    const school = await storage.getSchool(schoolId);
    if (school?.adminId) {
      senderId = school.adminId;
    }
  } catch (schoolErr: any) {
    console.warn(`[AutoPay] Could not fetch school ${schoolId} for senderId:`, schoolErr.message);
  }
  if (!senderId) {
    console.warn(`[AutoPay] Skipping credits-success notification for payment ${scheduledPayment.id} — could not resolve admin senderId`);
    return;
  }

  try {
    const notification = await storage.createNotification({
      senderId,
      schoolId,
      type: 'both',
      priority: 'normal',
      subject: `Payment covered by credits — no card charged`,
      content: `Your ${amountDisplay} payment for ${className} was covered by your credit balance — no card was charged.`,
      targetType: 'individual',
      targetData: { userId: parent.id },
      targetUserIds: [parent.id],
      status: 'sending',
      scheduledFor: null,
      expiresAt: null,
    });

    if (notification?.id) {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: parent.id,
        deliveryType: 'in_app',
        status: 'delivered',
      });
    }
  } catch (notifErr: any) {
    console.error('[AutoPay] Failed to create credits-success notification:', notifErr.message);
  }

  try {
    const { sendEmail } = await import('../lib/email-service');
    const childName = enrollment?.childName || 'Your child';
    const htmlContent = `
      <p>Hi ${parent.name || 'there'},</p>
      <p>Your scheduled payment of <strong>${amountDisplay}</strong> for <strong>${className}</strong> (${childName}) was fully covered by your credit balance.</p>
      <p><strong>No card was charged.</strong></p>
      <p>You can view your payment history and credit balance in the Payments section of your account.</p>
      <p>Thank you,<br/>American Seekers Academy</p>
    `;
    await sendEmail(
      parent.email,
      parent.name || 'Parent',
      `Payment covered by credits — ${amountDisplay} for ${className}`,
      htmlContent,
      `Your ${amountDisplay} payment for ${className} was covered by your credit balance — no card was charged.`,
      'autopay_credits_success'
    );
  } catch (emailErr: any) {
    console.error('[AutoPay] Failed to send credits-success email:', emailErr.message);
  }
}

async function notifyAutoPayRetry(scheduledPayment: any, parent: any, retryCount: number): Promise<void> {
  try {
    const notification = await storage.createNotification({
      senderId: parent.id,
      schoolId: scheduledPayment.schoolId || parent.schoolId || null,
      type: 'in_app',
      priority: 'high',
      subject: `Auto-payment declined — will retry`,
      content: `Your auto-payment of $${((scheduledPayment.amount || 0) / 100).toFixed(2)} was declined. We will retry automatically. If this continues, please update your payment method.`,
      targetType: 'individual',
      targetData: { userId: parent.id },
      targetUserIds: [parent.id],
      status: 'sending',
      scheduledFor: null,
      expiresAt: null,
    });

    if (notification?.id) {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: parent.id,
        deliveryType: 'in_app',
        status: 'delivered',
      });
    }
  } catch (notifErr: any) {
    console.error('[AutoPay] Failed to create retry notification:', notifErr.message);
  }
}

/**
 * Recover a single stuck-processing payment.
 * Exported so the test endpoint can invoke it directly by ID without the time-filter.
 *
 * Case A — no stripePaymentIntentId: Stripe was never called. Reset to pending.
 * Case B — has stripePaymentIntentId: Reconcile against Stripe API.
 */
export async function recoverOneScheduledPayment(sp: any): Promise<'reset' | 'completed' | 'failed' | 'left-alone'> {
  try {
    if (!sp.stripePaymentIntentId) {
      await storage.updateScheduledPayment(sp.id, { status: 'pending' });
      console.log(`[AutoPay] Recovery: reset payment ${sp.id} to pending — Stripe was never called`);
      return 'reset';
    }

    const stripe = await getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(sp.stripePaymentIntentId);

    if (intent.status === 'succeeded') {
      await storage.updateScheduledPayment(sp.id, {
        status: 'completed',
        processedAt: new Date(),
        completionSource: 'recovery',
      });

      if (sp.enrollmentId && sp.parentId) {
        try {
          const existingHistory = await storage.getStripePaymentByIntentId(intent.id);
          if (!existingHistory) {
            const stripeHistoryRecord = await storage.saveStripePayment({
              userId: sp.parentId,
              paymentIntentId: intent.id,
              customerId: (intent.customer as string) || null,
              subscriptionId: null,
              amount: sp.amount,
              currency: intent.currency || 'usd',
              status: 'succeeded',
              paymentMethod: typeof intent.payment_method === 'string' ? intent.payment_method : 'card',
              description: `Auto-pay recovery: installment ${sp.installmentNumber || 1} of ${sp.totalInstallments || 1}`,
              idempotencyKey: `recovery_${sp.id}_${intent.id}`,
              source: 'stripe',
              snapshotJson: null,
              snapshotChecksum: null,
              subtotalAmount: null,
              discountTotal: null,
              discountSnapshot: null,
              stripeCreatedAt: new Date(intent.created * 1000),
            });

            await storage.createPaymentAllocations([{
              paymentHistoryId: stripeHistoryRecord.id,
              enrollmentId: sp.enrollmentId,
              allocatedAmountCents: sp.amount,
              allocationType: 'payment' as const,
              sourceAllocationId: null,
              adminComment: null,
            }]);
          }

          const enrollment = await storage.getProgramEnrollmentById(sp.enrollmentId);
          if (enrollment) {
            const newTotalPaid = (enrollment.totalPaid || 0) + sp.amount;
            const newBalance = Math.max(0, (enrollment.totalCost || 0) - newTotalPaid - (enrollment.compAmountCents ?? 0));
            await storage.updateProgramEnrollment(sp.enrollmentId, {
              totalPaid: newTotalPaid,
              remainingBalance: newBalance,
              paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
            });
            console.log(`[AutoPay] Recovery: updated enrollment ${sp.enrollmentId}: paid=${newTotalPaid}, balance=${newBalance}`);
          }
        } catch (auditErr: any) {
          console.error(`[AutoPay] Recovery: could not complete audit records / enrollment update for payment ${sp.id}:`, auditErr.message);
        }
      }

      console.log(`[AutoPay] Recovery: completed payment ${sp.id} — Stripe confirmed succeeded`);
      return 'completed';
    }

    if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
      const newRetryCount = (sp.retryCount ?? 0) + 1;
      const exhausted = newRetryCount >= AUTOPAY_MAX_RETRIES;
      await storage.updateScheduledPayment(sp.id, {
        status: exhausted ? 'failed' : 'pending',
        retryCount: newRetryCount,
        failureReason: exhausted
          ? `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`
          : `Stripe payment ${intent.status}`,
      });
      if (exhausted) {
        const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
        if (parent) await notifyAutoPayFailure(sp, parent, `Stripe payment ${intent.status}`);
      }
      console.log(`[AutoPay] Recovery: payment ${sp.id} marked ${exhausted ? 'failed (exhausted)' : 'pending (retry)'} — Stripe status: ${intent.status}`);
      return 'failed';
    }

    if (intent.status === 'processing') {
      console.warn(`[AutoPay] Recovery: payment ${sp.id} still processing in Stripe after >15 min — leaving alone`);
      return 'left-alone';
    }

    await storage.updateScheduledPayment(sp.id, { status: 'pending' });
    console.log(`[AutoPay] Recovery: reset payment ${sp.id} — unknown Stripe status: ${intent.status}`);
    return 'reset';
  } catch (err: any) {
    // Stripe "No such payment_intent" means the PI was created under a different key
    // (e.g. a previous test session). Treat it the same as Case A — reset to pending.
    const isNotFound =
      err?.type === 'StripeInvalidRequestError' ||
      err?.code === 'resource_missing' ||
      err?.message?.includes('No such payment_intent');
    if (isNotFound) {
      await storage.updateScheduledPayment(sp.id, { status: 'pending', stripePaymentIntentId: null } as any);
      console.log(`[AutoPay] Recovery: reset payment ${sp.id} to pending — PI not found in Stripe (stale key)`);
      return 'reset';
    }
    console.error(`[AutoPay] Recovery: error handling payment ${sp.id}:`, err.message);
    return 'left-alone';
  }
}

async function recoverStuckProcessingPayments(): Promise<void> {
  try {
    const stuckPayments = await storage.getStuckProcessingPayments(15);
    if (stuckPayments.length === 0) return;

    console.log(`[AutoPay] Found ${stuckPayments.length} stuck-processing payment(s) — reconciling`);
    for (const sp of stuckPayments) {
      await recoverOneScheduledPayment(sp);
    }
  } catch (err: any) {
    console.error('[AutoPay] Error during stuck-processing recovery:', err.message);
  }
}

/**
 * Send advance notifications to parents whose auto-pay will charge tomorrow.
 * Deduped by lastReminderSentAt — won't send twice within 20 hours.
 * Uses getUpcomingAutoPayScheduledPayments() instead of getAllScheduledPayments() + in-JS filter
 * to avoid loading all payments into memory on large datasets.
 */
async function sendPreChargeNotifications(): Promise<void> {
  try {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const upcomingPayments = await storage.getUpcomingAutoPayScheduledPayments(now, tomorrow);

    if (upcomingPayments.length === 0) return;
    console.log(`[AutoPay] Pre-charge notifications: ${upcomingPayments.length} payment(s) due tomorrow`);

    for (const sp of upcomingPayments) {
      try {
        const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
        if (!parent) continue;
        if (!parent.autoPayEnabled) continue;
        if (!parent.stripeDefaultPaymentMethodId) continue;

        // Dedup: skip if already notified within the last 20 hours
        if (sp.lastReminderSentAt) {
          const hoursSinceLastReminder = (Date.now() - new Date(sp.lastReminderSentAt).getTime()) / 3600000;
          if (hoursSinceLastReminder < 20) continue;
        }

        const enrollment = sp.enrollmentId
          ? await storage.getProgramEnrollmentById(sp.enrollmentId)
          : null;
        const childName = enrollment?.childName || 'Your child';
        const className = enrollment?.className || 'your class';
        const amountDisplay = `$${(sp.amount / 100).toFixed(2)}`;

        // Estimate credit reduction for reminder (read-only, no reservation)
        let estimatedCredits: number | undefined;
        let estimatedNetCharge: number | undefined;

        {
          try {
            const availableCredits = await storage.getAvailableCredits(parent.id);
            const totalAvailable = availableCredits.reduce(
              (sum: number, c: any) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0
            );
            if (totalAvailable > 0) {
              const maxForPartial = sp.amount - 50;
              if (totalAvailable >= sp.amount) {
                estimatedCredits = sp.amount;
                estimatedNetCharge = 0;
              } else if (totalAvailable <= maxForPartial) {
                estimatedCredits = totalAvailable;
                estimatedNetCharge = sp.amount - totalAvailable;
              } else if (maxForPartial > 0) {
                estimatedCredits = maxForPartial;
                estimatedNetCharge = 50;
              }
            }
          } catch (creditErr: any) {
            console.error(`[AutoPay] Could not fetch credits for reminder ${sp.id}:`, creditErr.message);
          }
        }

        let inAppContent: string;
        if (estimatedCredits !== undefined && estimatedNetCharge !== undefined) {
          if (estimatedNetCharge === 0) {
            inAppContent = `Your ${amountDisplay} auto-payment for ${className} is scheduled for tomorrow. Your credits will fully cover this payment — no card charge!`;
          } else {
            inAppContent = `Your ${amountDisplay} auto-payment for ${className} is scheduled for tomorrow. $${(estimatedCredits / 100).toFixed(2)} in credits will apply, so your estimated card charge is $${(estimatedNetCharge / 100).toFixed(2)}.`;
          }
        } else {
          inAppContent = `Your ${amountDisplay} auto-payment for ${className} is scheduled for tomorrow. Make sure your payment method is up to date.`;
        }

        // In-app notification (senderId = parent.id per notifyAutoPayFailure convention)
        try {
          const notification = await storage.createNotification({
            senderId: parent.id,
            schoolId: sp.schoolId,
            type: 'in_app',
            priority: 'normal',
            subject: 'Auto-payment scheduled for tomorrow',
            content: inAppContent,
            targetType: 'individual',
            targetData: { userId: parent.id },
            targetUserIds: [parent.id],
            status: 'sending',
            scheduledFor: null,
            expiresAt: null,
          });

          if (notification?.id) {
            await storage.createNotificationRecipient({
              notificationId: notification.id,
              recipientId: parent.id,
              deliveryType: 'in_app',
              status: 'delivered',
            });
          }
        } catch (notifErr: any) {
          console.error(`[AutoPay] Failed to create pre-charge notification for payment ${sp.id}:`, notifErr.message);
        }

        // Email reminder
        try {
          await sendScheduledPaymentReminder({
            parentEmail: parent.email,
            childName,
            className,
            schoolName: 'American Seekers Academy',
            amount: sp.amount,
            dueDate: new Date(sp.scheduledDate),
            daysUntilDue: 1,
            paymentId: sp.id,
            installmentNumber: sp.installmentNumber || 1,
            totalInstallments: sp.totalInstallments || 1,
            urgency: 'warning',
            estimatedCredits,
            estimatedNetCharge,
          });
        } catch (emailErr: any) {
          console.error(`[AutoPay] Pre-charge email failed for payment ${sp.id}:`, emailErr.message);
        }

        // Update reminder tracking fields
        await storage.updateScheduledPayment(sp.id, {
          reminderCount: (sp.reminderCount ?? 0) + 1,
          lastReminderSentAt: new Date(),
        });

        // Write audit log
        try {
          await storage.createPaymentReminderLog({
            schoolId: sp.schoolId,
            scheduledPaymentId: sp.id,
            parentEmail: sp.parentEmail,
            amountCents: sp.amount,
            reminderType: '1_day_before',
            status: 'sent',
            isManual: false,
          } as any);
        } catch (logErr: any) {
          console.error(`[AutoPay] Failed to write reminder log for payment ${sp.id}:`, logErr.message);
        }

        console.log(`[AutoPay] Pre-charge notification sent for payment ${sp.id} to ${parent.email}`);
      } catch (err: any) {
        console.error(`[AutoPay] Error sending pre-charge notification for payment ${sp.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[AutoPay] Error in sendPreChargeNotifications:', err.message);
  }
}

/**
 * Process a single scheduled payment record.
 * Returns 'charged', 'skipped', or 'failed' for the caller to tally.
 * Extracted so tests can invoke exactly one payment without touching other DB records.
 */
export async function processOneScheduledPayment(sp: any): Promise<'charged' | 'skipped' | 'failed'> {
  // Declare all mutable state at function top-level so every catch block can read/write safely.
  let creditsToApply: number = 0;
  let chargeAmount: number = sp.amount;
  let holdSessionId: string = '';
  let holdCreated: boolean = false;

  try {
    // Idempotency guard: only process payments in 'pending' or 'overdue' state
    if (sp.status !== 'pending' && sp.status !== 'overdue') {
      console.log(`[AutoPay] Skipping payment ${sp.id} — status is '${sp.status}', not 'pending' or 'overdue'`);
      return 'skipped';
    }

    const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;

    if (!parent) {
      console.log(`[AutoPay] Skipping payment ${sp.id} — parent user not found`);
      return 'skipped';
    }

    if (!parent.autoPayEnabled) {
      return 'skipped';
    }

    if (!sp.amount || sp.amount < 50) {
      console.log(`[AutoPay] Skipping payment ${sp.id} — amount ${sp.amount} is below Stripe minimum ($0.50)`);
      return 'skipped';
    }

    // Retry cap guard — permanently fail after AUTOPAY_MAX_RETRIES attempts
    if ((sp.retryCount ?? 0) >= AUTOPAY_MAX_RETRIES) {
      console.log(`[AutoPay] Payment ${sp.id} exceeded max retries (${sp.retryCount}) — permanently failing`);
      await storage.updateScheduledPayment(sp.id, {
        status: 'failed',
        failureReason: `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`,
      });
      await notifyAutoPayFailure(sp, parent, 'Exceeded maximum retry attempts');
      return 'failed';
    }

    // Guard: verify enrollment hasn't already been paid in full before charging
    if (sp.enrollmentId) {
      try {
        const enrollment = await storage.getProgramEnrollmentById(sp.enrollmentId);
        if (!enrollment) {
          console.log(`[AutoPay] Skipping payment ${sp.id} — enrollment ${sp.enrollmentId} not found`);
          return 'skipped';
        }
        // Use effectiveBalance formula per db-patterns skill:
        // remainingBalance is unreliable for comped accounts (set to 0, not null, so ?? never triggers).
        // Always compute: totalCost - totalPaid - (compAmountCents ?? 0)
        const effectiveBalance = enrollment.totalCost - enrollment.totalPaid - (enrollment.compAmountCents ?? 0);
        if (effectiveBalance <= 0) {
          console.log(`[AutoPay] Skipping payment ${sp.id} — enrollment ${sp.enrollmentId} already paid in full (effectiveBalance: ${effectiveBalance})`);
          await storage.updateScheduledPaymentStatus(sp.id, 'cancelled');
          return 'skipped';
        }
      } catch (e) {
        console.error(`[AutoPay] Could not verify enrollment balance for payment ${sp.id}:`, e);
        return 'skipped';
      }
    }

    // Credit calculation: apply available credits to reduce or eliminate the card charge.
    try {
      const availableCredits = await storage.getAvailableCredits(parent.id);
      const totalAvailable = availableCredits.reduce(
        (sum: number, c: any) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0
      );

      if (totalAvailable > 0) {
        // Determine how many credits to apply, respecting the $0.50 Stripe minimum:
        //   Full coverage (credits >= amount)        → zero-charge path
        //   Partial + safe (credits <= amount - 50)  → reduce card charge
        //   Would drop below $0.50 but not cover     → cap credits to leave $0.50
        const maxForPartial = sp.amount - 50;

        if (totalAvailable >= sp.amount) {
          creditsToApply = sp.amount;
          chargeAmount = 0;
        } else if (totalAvailable <= maxForPartial) {
          creditsToApply = totalAvailable;
          chargeAmount = sp.amount - creditsToApply;
        } else if (maxForPartial > 0) {
          creditsToApply = maxForPartial;
          chargeAmount = 50;
        }

        console.log(`[AutoPay] Credits for payment ${sp.id}: available=${totalAvailable}, applying=${creditsToApply}, chargeAmount=${chargeAmount}`);
      }
    } catch (creditErr: any) {
      console.error(`[AutoPay] Could not fetch credits for payment ${sp.id} — charging full amount:`, creditErr.message);
      creditsToApply = 0;
      chargeAmount = sp.amount;
    }

    // Zero-charge path: credits fully cover the installment (no Stripe needed).
    // Uses the same reserve/finalize pattern as the partial-credit path:
    //   createCreditHolds → audit payment + enrollment update → finalizeCreditHolds
    // On any failure after hold creation: releaseCreditHolds restores all credits.
    // Note: Stripe card presence is NOT checked here — credits-only completion
    // should succeed even if the parent has no saved payment method.
    if (chargeAmount === 0 && creditsToApply > 0) {
      console.log(`[AutoPay] ✅ Payment ${sp.id} fully covered by credits ($${(creditsToApply / 100).toFixed(2)}) — skipping Stripe`);

      await storage.updateScheduledPaymentStatus(sp.id, 'processing' as any);

      holdSessionId = `autopay_credits_${sp.id}_${Date.now()}`;
      let zeroChargeHoldCreated = false;

      try {
        const { totalHeld } = await storage.createCreditHolds(
          parent.id,
          creditsToApply,
          holdSessionId,
          `Auto-pay zero-charge hold for scheduled payment ${sp.id}`,
          60
        );
        if (totalHeld < creditsToApply) {
          throw new Error(`Insufficient credits reserved: needed ${creditsToApply}, got ${totalHeld}`);
        }
        zeroChargeHoldCreated = true;

        const enrollment = sp.enrollmentId
          ? await storage.getProgramEnrollmentById(sp.enrollmentId)
          : null;

        // Single atomic transaction: finalize holds + audit payment + enrollment update + complete
        await storage.completeCreditsOnlyPayment({
          holdSessionId,
          scheduledPaymentId: sp.id,
          parentId: parent.id,
          enrollmentId: sp.enrollmentId ?? null,
          schoolId: sp.schoolId,
          creditsApplied: creditsToApply,
          originalAmount: sp.amount,
          installmentNumber: sp.installmentNumber || 1,
          totalInstallments: sp.totalInstallments || 1,
          parentEmail: parent.email,
          childName: enrollment?.childName ?? null,
          className: enrollment?.className ?? null,
        });

        console.log(`[AutoPay] ✅ Credits-only payment ${sp.id} completed atomically`);

        try {
          await notifyAutoPayCreditsSuccess(sp, parent, creditsToApply, enrollment);
        } catch (notifErr: any) {
          console.error(`[AutoPay] Non-fatal: credits-success notification failed for payment ${sp.id}:`, notifErr.message);
        }

        return 'charged';
      } catch (creditsOnlyErr: any) {
        console.error(`[AutoPay] ❌ Credits-only path failed for payment ${sp.id}:`, creditsOnlyErr.message);
        if (zeroChargeHoldCreated) {
          try {
            await storage.releaseCreditHolds(holdSessionId);
            console.log(`[AutoPay] Released zero-charge hold ${holdSessionId} after failure`);
          } catch (releaseErr: any) {
            console.error(`[AutoPay] Could not release zero-charge hold ${holdSessionId}:`, releaseErr.message);
          }
        }
        try {
          await storage.updateScheduledPaymentStatus(sp.id, 'pending' as any);
        } catch (_) { /* best-effort */ }
        return 'failed';
      }
    }

    // Stripe card is required for any payment that reaches here (partial-credit or full charge)
    if (!parent.stripeDefaultPaymentMethodId || !parent.stripeCustomerId) {
      console.log(`[AutoPay] Skipping payment ${sp.id} for user ${parent.id} — no saved payment method`);
      return 'skipped';
    }

    // Mark processing before any Stripe/credit operations so concurrent scheduler
    // runs that query by 'pending' status cannot double-process this payment.
    await storage.updateScheduledPaymentStatus(sp.id, 'processing' as any);

    // Partial-credit path: reserve credits before charging Stripe.
    // Reserve/finalize lifecycle:
    //   createCreditHolds   → reserves credits, preventing concurrent spend
    //   Stripe PaymentIntent confirmed with creditHoldSessionId in metadata
    //   webhook.payment_intent.succeeded → finalizeCreditHolds(creditHoldSessionId)
    //   On card decline or error          → scheduler calls releaseCreditHolds
    //
    // If hold creation reserves fewer credits than requested, use the actually held
    // amount to compute a reduced card charge (never fall back to full amount;
    // never drop below the Stripe $0.50 minimum).
    if (creditsToApply > 0) {
      holdSessionId = `autopay_${sp.id}_${Date.now()}`;
      try {
        const { totalHeld } = await storage.createCreditHolds(
          parent.id,
          creditsToApply,
          holdSessionId,
          `Auto-pay hold for scheduled payment ${sp.id}`,
          60
        );
        if (totalHeld > 0) {
          // Adjust credits/charge to reflect what was actually reserved
          creditsToApply = totalHeld;
          chargeAmount = sp.amount - totalHeld;
          // Enforce Stripe $0.50 minimum: if reduced charge would be 1–49 cents, bump up credits
          if (chargeAmount > 0 && chargeAmount < 50) {
            const excess = 50 - chargeAmount;
            creditsToApply = totalHeld - excess;
            chargeAmount = 50;
          }
          holdCreated = true;
          console.log(`[AutoPay] Held ${totalHeld} credits for payment ${sp.id} — charge=${chargeAmount} (session: ${holdSessionId})`);
        } else {
          console.warn(`[AutoPay] No credits reserved for payment ${sp.id} — charging full amount`);
          await storage.releaseCreditHolds(holdSessionId).catch(() => { /* best-effort */ });
          holdSessionId = '';
          creditsToApply = 0;
          chargeAmount = sp.amount;
        }
      } catch (holdErr: any) {
        console.error(`[AutoPay] Could not create credit hold for payment ${sp.id} — charging full amount:`, holdErr.message);
        holdSessionId = '';
        creditsToApply = 0;
        chargeAmount = sp.amount;
      }
    }
    console.log(`[AutoPay] Processing payment ${sp.id} for user ${parent.id} — $${(chargeAmount / 100).toFixed(2)} (original: $${(sp.amount / 100).toFixed(2)}, credits: $${(creditsToApply / 100).toFixed(2)})`);

    const stripe = await getStripeClient();

    try {
      const intent = await stripe.paymentIntents.create({
        amount: chargeAmount,
        currency: 'usd',
        customer: parent.stripeCustomerId,
        payment_method: parent.stripeDefaultPaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          paymentType: 'scheduled_payment',
          scheduledPaymentId: String(sp.id),
          enrollmentId: String(sp.enrollmentId || ''),
          parentEmail: parent.email,
          installmentNumber: String(sp.installmentNumber || ''),
          totalInstallments: String(sp.totalInstallments || ''),
          autoPayInitiated: 'true',
          creditsAppliedCents: String(creditsToApply),
          originalAmountCents: String(sp.amount),
          userId: String(parent.id),
          creditHoldSessionId: holdSessionId,
        },
      });

      if (intent.status === 'succeeded') {
        // The webhook (payment_intent.succeeded) will mark completed, update enrollment,
        // create history record, and call finalizeCreditHolds(creditHoldSessionId) when
        // holdSessionId is non-empty, or useCredits(creditsAppliedCents) otherwise.
        console.log(`[AutoPay] ✅ Payment ${sp.id} charged successfully — webhook will update enrollment`);
        await storage.updateScheduledPayment(sp.id, {
          chargedBy: 'auto_pay',
          completionSource: creditsToApply > 0 ? 'stripe_autopay_partial_credits' : 'stripe_autopay',
        });
        return 'charged';
      } else {
        throw new Error(`PaymentIntent requires action — status: ${intent.status}`);
      }
    } catch (stripeErr: any) {
      // NOTE: Stripe does NOT fire the payment_intent.payment_failed webhook for
      // synchronously-rejected off-session PaymentIntents — the scheduler must apply
      // retry logic itself.
      const isCardDecline =
        stripeErr?.type === 'StripeCardError' ||
        stripeErr?.code === 'card_declined' ||
        (stripeErr?.message && stripeErr.message.toLowerCase().includes('card'));

      if (isCardDecline) {
        const newRetryCount = (sp.retryCount ?? 0) + 1;
        const exhausted = newRetryCount >= AUTOPAY_MAX_RETRIES;

        console.log(`[AutoPay] ⚠️ Payment ${sp.id} card declined (retry ${newRetryCount}/${AUTOPAY_MAX_RETRIES})${exhausted ? ' — permanently failing' : ' — will retry'}`);

        if (holdCreated) {
          try {
            await storage.releaseCreditHolds(holdSessionId);
            console.log(`[AutoPay] Released credit hold ${holdSessionId} after card decline`);
          } catch (releaseErr: any) {
            console.error(`[AutoPay] Could not release credit hold ${holdSessionId}:`, releaseErr.message);
          }
        }

        await storage.updateScheduledPayment(sp.id, {
          status: exhausted ? 'failed' : 'pending',
          retryCount: newRetryCount,
          failureReason: exhausted
            ? `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`
            : `Card declined: ${stripeErr.message}`,
        });

        if (exhausted) {
          await notifyAutoPayFailure(sp, parent, stripeErr.message);
        } else {
          await notifyAutoPayRetry(sp, parent, newRetryCount);
        }

        return 'failed';
      }

      // Non-card-decline error — release hold and re-throw to outer catch
      if (holdCreated) {
        try {
          await storage.releaseCreditHolds(holdSessionId);
          console.log(`[AutoPay] Released credit hold ${holdSessionId} after Stripe error`);
        } catch (releaseErr: any) {
          console.error(`[AutoPay] Could not release credit hold ${holdSessionId}:`, releaseErr.message);
        }
      }
      throw stripeErr;
    }
  } catch (err: any) {
    console.error(`[AutoPay] ❌ Failed to charge payment ${sp.id}:`, err.message);

    // holdCreated and holdSessionId are at function scope — always accessible here
    if (holdCreated) {
      try {
        await storage.releaseCreditHolds(holdSessionId);
        console.log(`[AutoPay] Released credit hold ${holdSessionId} in outer catch`);
      } catch (releaseErr: any) {
        console.error(`[AutoPay] Could not release credit hold ${holdSessionId}:`, releaseErr.message);
      }
    }

    try {
      await storage.updateScheduledPaymentStatus(sp.id, 'failed' as any);
    } catch (updateErr: any) {
      console.error(`[AutoPay] Failed to mark payment ${sp.id} as failed:`, updateErr.message);
    }

    const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
    if (parent) {
      await notifyAutoPayFailure(sp, parent, err.message);
    }

    return 'failed';
  }
}

async function processAutoPayments(): Promise<void> {
  console.log('[AutoPay] Starting auto-pay processing run...');

  try {
    const MAX_STALE_DAYS = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffDate = new Date(today.getTime() - MAX_STALE_DAYS * 86400000);
    console.log(`[AutoPay] Checking due payments — window: ${cutoffDate.toDateString()} → ${today.toDateString()}`);

    const duePayments = await storage.getDueScheduledPayments(today, MAX_STALE_DAYS);

    if (duePayments.length === 0) {
      console.log('[AutoPay] No pending auto-pay payments due today.');
      return;
    }

    console.log(`[AutoPay] Found ${duePayments.length} due payment(s) to check for auto-pay.`);

    let charged = 0;
    let skipped = 0;
    let failed = 0;

    for (const sp of duePayments) {
      const result = await processOneScheduledPayment(sp);
      if (result === 'charged') charged++;
      else if (result === 'skipped') skipped++;
      else failed++;
    }

    console.log(`[AutoPay] Run complete — charged: ${charged}, skipped: ${skipped}, failed: ${failed}`);
  } catch (err: any) {
    console.error('[AutoPay] Fatal error during auto-pay processing:', err);
  }
}

/**
 * Start the auto-pay background job.
 * Cycle order: recover stuck → pre-charge notify → charge due.
 * Runs immediately on startup, then every 24 hours.
 *
 * DEPLOYMENT REQUIREMENT: AUTO_PAY_SINGLE_INSTANCE=true must be set.
 * This job is NOT safe to run on Autoscale (multiple instances cause double charges).
 * Only start on Reserved VM or Scheduled Deployments.
 */
export function startAutoPayJob(): void {
  if (process.env.AUTO_PAY_SINGLE_INSTANCE !== 'true') {
    console.error('CRITICAL: [AutoPayJob] blocked — requires AUTO_PAY_SINGLE_INSTANCE=true (Reserved VM only). Auto-pay scheduler will NOT start.');
    return;
  }

  console.log('💳 Starting auto-pay job... Credit auto-application is ACTIVE (applied by default to all auto-pay installments).');
  recoverStuckProcessingPayments();
  sendPreChargeNotifications();
  processAutoPayments();
  setInterval(() => {
    recoverStuckProcessingPayments();
    sendPreChargeNotifications();
    processAutoPayments();
  }, 24 * 60 * 60 * 1000);
  console.log('✅ Auto-pay job initialized - will run every 24 hours');
}
