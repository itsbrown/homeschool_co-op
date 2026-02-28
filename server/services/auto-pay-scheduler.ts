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
 */

import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { sendScheduledPaymentReminder } from '../lib/email-service';

/**
 * Notify parent of a failed auto-pay attempt via in-app notification and email.
 */
async function notifyAutoPayFailure(scheduledPayment: any, parent: any, errMessage: string): Promise<void> {
  try {
    // In-app notification — requires a sender; use the parent as sender for system notifications
    const systemSenderId = parent.id;
    const notification = await storage.createNotification({
      senderId: systemSenderId,
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

  // Email reminder using the existing scheduled-payment reminder service
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
 * Process all pending scheduled payments that are past due for parents with auto-pay enabled.
 */
async function processAutoPayments(): Promise<void> {
  console.log('[AutoPay] Starting auto-pay processing run...');

  try {
    const allPayments = await storage.getAllScheduledPayments();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find pending payments that are due today or overdue
    const duePayments = allPayments.filter((p: any) => {
      if (p.status !== 'pending') return false;
      const dueDate = new Date(p.scheduledDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate <= today;
    });

    if (duePayments.length === 0) {
      console.log('[AutoPay] No pending auto-pay payments due today.');
      return;
    }

    console.log(`[AutoPay] Found ${duePayments.length} due payment(s) to check for auto-pay.`);

    let charged = 0;
    let skipped = 0;
    let failed = 0;

    for (const sp of duePayments) {
      try {
        // Look up parent user
        const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;

        if (!parent) {
          console.log(`[AutoPay] Skipping payment ${sp.id} — parent user not found`);
          skipped++;
          continue;
        }

        if (!parent.autoPayEnabled) {
          skipped++;
          continue;
        }

        if (!parent.stripeDefaultPaymentMethodId || !parent.stripeCustomerId) {
          console.log(`[AutoPay] Skipping payment ${sp.id} for user ${parent.id} — no saved payment method`);
          skipped++;
          continue;
        }

        if (!sp.amount || sp.amount < 50) {
          console.log(`[AutoPay] Skipping payment ${sp.id} — amount ${sp.amount} is below Stripe minimum ($0.50)`);
          skipped++;
          continue;
        }

        // Idempotency guard: mark as processing before calling Stripe
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
          // The existing payment_intent.succeeded webhook will:
          //   1. Mark scheduled_payment as completed
          //   2. Update enrollment totalPaid and remainingBalance
          //   3. Create payment history record
          // We don't touch the enrollment here — the webhook handles it.
          console.log(`[AutoPay] ✅ Payment ${sp.id} charged successfully — webhook will update enrollment`);
          charged++;
        } else {
          // Stripe requires additional action (3DS, etc.) — not supported for off-session
          throw new Error(`PaymentIntent requires action — status: ${intent.status}`);
        }
      } catch (err: any) {
        console.error(`[AutoPay] ❌ Failed to charge payment ${sp.id}:`, err.message);
        failed++;

        try {
          await storage.updateScheduledPaymentStatus(sp.id, 'failed' as any);
        } catch (updateErr: any) {
          console.error(`[AutoPay] Failed to mark payment ${sp.id} as failed:`, updateErr.message);
        }

        // Notify the parent
        const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
        if (parent) {
          await notifyAutoPayFailure(sp, parent, err.message);
        }
      }
    }

    console.log(`[AutoPay] Run complete — charged: ${charged}, skipped: ${skipped}, failed: ${failed}`);
  } catch (err: any) {
    console.error('[AutoPay] Fatal error during auto-pay processing:', err);
  }
}

/**
 * Start the auto-pay background job.
 * Runs immediately on startup, then every 24 hours.
 */
export function startAutoPayJob(): void {
  console.log('💳 Starting auto-pay job...');
  processAutoPayments();
  setInterval(processAutoPayments, 24 * 60 * 60 * 1000);
  console.log('✅ Auto-pay job initialized - will run every 24 hours');
}
