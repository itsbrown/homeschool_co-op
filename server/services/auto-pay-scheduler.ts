/**
 * Auto-Pay Scheduler Service
 *
 * Automatically charges parents' saved payment methods for scheduled installments
 * that are past their due date and where the parent has opted in to auto-pay.
 *
 * Runs every 24 hours in development/staging.
 * NOTE: This service is not compatible with Autoscale deployments.
 * For production, use Replit Reserved VM or Scheduled Deployments.
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

const MAX_RETRIES = 3;

/**
 * Notify parent of a failed auto-pay attempt via in-app notification and email.
 */
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
      });

      if (sp.enrollmentId) {
        try {
          const enrollment = await storage.getProgramEnrollmentById(sp.enrollmentId);
          if (enrollment) {
            // Always use ?? fallback — remainingBalance can be null or stale
            const effectiveBalance = enrollment.remainingBalance ?? (enrollment.totalCost - enrollment.totalPaid);
            const newTotalPaid = enrollment.totalPaid + sp.amount;
            const newBalance = Math.max(0, effectiveBalance - sp.amount);
            await storage.updateProgramEnrollment(sp.enrollmentId, {
              totalPaid: newTotalPaid,
              remainingBalance: newBalance,
            });
          }
        } catch (enrollErr: any) {
          console.error(`[AutoPay] Recovery: could not update enrollment ${sp.enrollmentId}:`, enrollErr.message);
        }
      }

      console.log(`[AutoPay] Recovery: completed payment ${sp.id} — Stripe confirmed succeeded`);
      return 'completed';
    }

    if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
      const newRetryCount = (sp.retryCount ?? 0) + 1;
      const exhausted = newRetryCount >= MAX_RETRIES;
      await storage.updateScheduledPayment(sp.id, {
        status: exhausted ? 'failed' : 'pending',
        retryCount: newRetryCount,
        failureReason: exhausted
          ? `Exceeded ${MAX_RETRIES} auto-pay attempts. Manual payment required.`
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

    // Unknown status — safe to reset
    await storage.updateScheduledPayment(sp.id, { status: 'pending' });
    console.log(`[AutoPay] Recovery: reset payment ${sp.id} — unknown Stripe status: ${intent.status}`);
    return 'reset';
  } catch (err: any) {
    console.error(`[AutoPay] Recovery: error handling payment ${sp.id}:`, err.message);
    // On Stripe API error, do not crash — leave the payment alone
    return 'left-alone';
  }
}

/**
 * Find payments stuck in 'processing' for more than 15 minutes and reconcile them.
 * Runs at the start of each scheduler cycle to fix crash survivors.
 */
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
 */
async function sendPreChargeNotifications(): Promise<void> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    const now = new Date();

    const allPayments = await storage.getAllScheduledPayments();
    const upcomingPayments = allPayments.filter((p: any) => {
      if (p.status !== 'pending') return false;
      const d = new Date(p.scheduledDate);
      // Due within the next 24–48 hours
      return d >= now && d <= tomorrow;
    });

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

        // In-app notification (senderId = parent.id per notifyAutoPayFailure convention)
        const notification = await storage.createNotification({
          senderId: parent.id,
          schoolId: sp.schoolId,
          type: 'in_app',
          priority: 'normal',
          subject: 'Auto-payment scheduled for tomorrow',
          content: `Your ${amountDisplay} auto-payment for ${className} is scheduled for tomorrow. Make sure your payment method is up to date.`,
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
  try {
    // Idempotency guard: only process payments in 'pending' state
    if (sp.status !== 'pending') {
      console.log(`[AutoPay] Skipping payment ${sp.id} — status is '${sp.status}', not 'pending'`);
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

    if (!parent.stripeDefaultPaymentMethodId || !parent.stripeCustomerId) {
      console.log(`[AutoPay] Skipping payment ${sp.id} for user ${parent.id} — no saved payment method`);
      return 'skipped';
    }

    if (!sp.amount || sp.amount < 50) {
      console.log(`[AutoPay] Skipping payment ${sp.id} — amount ${sp.amount} is below Stripe minimum ($0.50)`);
      return 'skipped';
    }

    // Retry cap guard — permanently fail after MAX_RETRIES attempts
    if ((sp.retryCount ?? 0) >= MAX_RETRIES) {
      console.log(`[AutoPay] Payment ${sp.id} exceeded max retries (${sp.retryCount}) — permanently failing`);
      await storage.updateScheduledPayment(sp.id, {
        status: 'failed',
        failureReason: `Exceeded ${MAX_RETRIES} auto-pay attempts. Manual payment required.`,
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
        // Use ?? fallback per db-patterns: remainingBalance may be null or stale
        const effectiveBalance = enrollment.remainingBalance ?? (enrollment.totalCost - enrollment.totalPaid);
        if (effectiveBalance <= 0) {
          console.log(`[AutoPay] Skipping payment ${sp.id} — enrollment ${sp.enrollmentId} already paid in full (balance: ${effectiveBalance})`);
          await storage.updateScheduledPaymentStatus(sp.id, 'cancelled');
          return 'skipped';
        }
      } catch (e) {
        console.error(`[AutoPay] Could not verify enrollment balance for payment ${sp.id}:`, e);
        return 'skipped';
      }
    }

    // Idempotency: mark as processing before calling Stripe
    await storage.updateScheduledPaymentStatus(sp.id, 'processing' as any);
    console.log(`[AutoPay] Processing payment ${sp.id} for user ${parent.id} — $${(sp.amount / 100).toFixed(2)}`);

    const stripe = await getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: sp.amount,
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
      },
    });

    if (intent.status === 'succeeded') {
      // Webhook payment_intent.succeeded will: mark completed, update enrollment, create history record
      console.log(`[AutoPay] ✅ Payment ${sp.id} charged successfully — webhook will update enrollment`);
      return 'charged';
    } else {
      throw new Error(`PaymentIntent requires action — status: ${intent.status}`);
    }
  } catch (err: any) {
    console.error(`[AutoPay] ❌ Failed to charge payment ${sp.id}:`, err.message);

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

/**
 * Process all pending scheduled payments that are past due (within 14-day staleness window).
 */
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
 */
export function startAutoPayJob(): void {
  console.log('💳 Starting auto-pay job...');
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
