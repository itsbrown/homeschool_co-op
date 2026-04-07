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
 * Notify parent that their auto-pay will be retried.
 */
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
      // Mark the scheduled payment completed with recovery source
      await storage.updateScheduledPayment(sp.id, {
        status: 'completed',
        processedAt: new Date(),
        completionSource: 'recovery',
      });

      // Create stripe_payment_history + allocation records and update enrollment balance,
      // using the same pattern as the payment_intent.succeeded webhook handler.
      // This ensures the payment is fully recorded and enrollment state is immediately consistent.
      if (sp.enrollmentId && sp.parentId) {
        try {
          // Idempotent: skip history record creation if it already exists for this intent
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

          // Update enrollment balance using the same webhook-pattern approach:
          // add the payment amount to totalPaid and recompute remainingBalance.
          // Recovery applies the Stripe charge amount (no credit context available).
          const enrollment = await storage.getProgramEnrollmentById(sp.enrollmentId);
          if (enrollment) {
            const newTotalPaid = (enrollment.totalPaid || 0) + sp.amount;
            const newBalance = Math.max(0, (enrollment.totalCost || 0) - newTotalPaid);
            await storage.updateProgramEnrollment(sp.enrollmentId, {
              totalPaid: newTotalPaid,
              remainingBalance: newBalance,
              paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
            });
            console.log(`[AutoPay] Recovery: updated enrollment ${sp.enrollmentId}: paid=${newTotalPaid}, balance=${newBalance}`);
          }
        } catch (auditErr: any) {
          console.error(`[AutoPay] Recovery: could not complete audit records / enrollment update for payment ${sp.id}:`, auditErr.message);
          // Non-fatal: scheduled payment is still marked completed; enrollment can be reconciled manually
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

    // Idempotency: mark as processing before calling Stripe
    await storage.updateScheduledPaymentStatus(sp.id, 'processing' as any);
    console.log(`[AutoPay] Processing payment ${sp.id} for user ${parent.id} — $${(sp.amount / 100).toFixed(2)}`);

    const stripe = await getStripeClient();

    try {
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
        // Stamp completionSource before webhook updates enrollment.
        // The webhook handler (payment_intent.succeeded) will: mark completed, update enrollment, create history record.
        // We pre-stamp completionSource='stripe_autopay' here so the audit trail is accurate.
        console.log(`[AutoPay] ✅ Payment ${sp.id} charged successfully — webhook will update enrollment`);
        await storage.updateScheduledPayment(sp.id, {
          chargedBy: 'auto_pay',
          completionSource: 'stripe_autopay',
        });
        return 'charged';
      } else {
        throw new Error(`PaymentIntent requires action — status: ${intent.status}`);
      }
    } catch (stripeErr: any) {
      // Determine if this is a synchronous card decline.
      // NOTE: Stripe does NOT fire the payment_intent.payment_failed webhook for
      // synchronously-rejected off-session PaymentIntents (decline happens inline).
      // Therefore the scheduler must apply retry logic itself — do NOT permanently
      // fail on the first declined attempt.
      const isCardDecline =
        stripeErr?.type === 'StripeCardError' ||
        stripeErr?.code === 'card_declined' ||
        (stripeErr?.message && stripeErr.message.toLowerCase().includes('card'));

      if (isCardDecline) {
        const newRetryCount = (sp.retryCount ?? 0) + 1;
        const exhausted = newRetryCount >= MAX_RETRIES;

        console.log(`[AutoPay] ⚠️ Payment ${sp.id} card declined (retry ${newRetryCount}/${MAX_RETRIES})${exhausted ? ' — permanently failing' : ' — will retry'}`);

        await storage.updateScheduledPayment(sp.id, {
          status: exhausted ? 'failed' : 'pending',
          retryCount: newRetryCount,
          failureReason: exhausted
            ? `Exceeded ${MAX_RETRIES} auto-pay attempts. Manual payment required.`
            : `Card declined: ${stripeErr.message}`,
        });

        if (exhausted) {
          await notifyAutoPayFailure(sp, parent, stripeErr.message);
        } else {
          await notifyAutoPayRetry(sp, parent, newRetryCount);
        }

        return 'failed';
      }

      // Non-card-decline error (network, Stripe API issue, etc.) — re-throw to outer catch
      throw stripeErr;
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
