import { Router } from 'express';
import { storage } from '../storage';
import Stripe from 'stripe';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getStripeClient } from '../config/stripe';
import {
  computeManualPayCredits,
  isChargeAmountDivergent,
  STRIPE_MIN_CHARGE_CENTS,
} from '../utils/manualPayCredits';

const router = Router();

/**
 * Audit alert emitted whenever the divergence guard fires (manual Pay Now's
 * charge amount no longer matches what the client showed the parent).
 *
 * Writes a high-severity entry to `error_logs` so the existing error
 * notification pipeline (errorNotificationService) emails finance, and so
 * the row appears in the admin error dashboard. Best-effort: callers wrap
 * this in try/catch and never let an alert failure block the actual
 * 409 response.
 */
async function emitDivergenceAlert(input: {
  paymentId: number | string;
  parentId: number | string;
  parentEmail: string;
  schoolId: number | string | null;
  expectedChargeAmount: number | null | undefined;
  actualChargeAmount: number;
  creditsApplied: number;
  originalAmount: number;
  source?: 'pay' | 'pay-combined';
}): Promise<void> {
  await storage.createErrorLog({
    errorType: 'payment',
    severity: 'high',
    message:
      `Pay Now charge amount diverged from displayed amount ` +
      `(expected ${input.expectedChargeAmount}¢, server ${input.actualChargeAmount}¢) ` +
      `for parent ${input.parentEmail}. Charge was blocked.`,
    route: input.source === 'pay-combined'
      ? '/api/scheduled-payments/pay-combined'
      : '/api/scheduled-payments/pay',
    method: 'POST',
    userEmail: input.parentEmail,
    schoolId: input.schoolId == null ? null : Number(input.schoolId),
    stackTrace: null,
    metadata: {
      paymentId: input.paymentId,
      parentId: input.parentId,
      expectedChargeAmount: input.expectedChargeAmount,
      actualChargeAmount: input.actualChargeAmount,
      creditsApplied: input.creditsApplied,
      originalAmount: input.originalAmount,
      source: input.source ?? 'pay',
      detectedAt: new Date().toISOString(),
    },
    notificationSent: false,
  });
}

/**
 * Attempt to cancel a stale Stripe PaymentIntent. Returns:
 *   - 'cancelled'      — PI was in a cancelable state (requires_payment_method,
 *                        requires_confirmation, requires_action) and we
 *                        cancelled it successfully.
 *   - 'gone'           — Stripe says the PI is already canceled, not found,
 *                        or we hit a transient error. Caller may treat as
 *                        safe-to-replace (no chargeable PI remains).
 *   - 'not_cancelable' — PI is in succeeded/processing/requires_capture; a
 *                        charge has already been (or is being) collected.
 *                        Caller MUST refuse to settle the same installment
 *                        again to avoid double-collection.
 *
 * NOTE on `requires_action`: a PI in this status has had a confirmation
 * attempt, but no charge has been captured yet. Stripe permits cancellation
 * of such PIs; we include it here so credits-only re-attempts cannot leave
 * a still-confirmable PI behind.
 */
async function tryCancelStalePaymentIntent(
  stalePiId: string,
): Promise<'cancelled' | 'gone' | 'not_cancelable'> {
  const stripe = await getStripeClient();
  try {
    const existingIntent = await stripe.paymentIntents.retrieve(stalePiId);
    if (
      existingIntent.status === 'requires_payment_method' ||
      existingIntent.status === 'requires_confirmation' ||
      existingIntent.status === 'requires_action'
    ) {
      await stripe.paymentIntents.cancel(stalePiId);
      return 'cancelled';
    }
    if (
      existingIntent.status === 'succeeded' ||
      existingIntent.status === 'processing' ||
      existingIntent.status === 'requires_capture'
    ) {
      return 'not_cancelable';
    }
    // canceled / unknown → no chargeable PI left.
    return 'gone';
  } catch (cancelErr) {
    console.error(
      `⚠️ Could not cancel stale PI ${stalePiId} (treating as gone):`,
      cancelErr,
    );
    return 'gone';
  }
}

/**
 * Cancel a stale Stripe PaymentIntent that's about to be replaced by the
 * credits-only zero-charge path, then reset the scheduled payment row(s) to
 * `pending` so the credits-only branch can complete safely.
 *
 * Why this exists: if a parent first attempted Pay Now without credits (a
 * PI was created and the row went to `processing`) and then re-attempted
 * with credits ON (decision now `isCreditsOnly`), the old PI is still
 * confirmable by Stripe via its client secret. Settling the installment
 * with credits without first cancelling the PI would let the card still be
 * charged afterwards, double-collecting the same installment.
 */
export async function cancelStalePiForCreditsOnlyTransition(
  stalePiId: string,
  scheduledPaymentIds: number[],
): Promise<'cancelled' | 'gone' | 'not_cancelable'> {
  const outcome = await tryCancelStalePaymentIntent(stalePiId);
  if (outcome === 'not_cancelable') return outcome;

  for (const id of scheduledPaymentIds) {
    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) continue;
    await storage.updateScheduledPayment(id, {
      status: 'pending',
      stripePaymentIntentId: null,
      metadata: {
        ...((sp.metadata as Record<string, any>) || {}),
        previousStripePaymentIntentId: stalePiId,
        stalePiCancelledAt: new Date().toISOString(),
        canceledDueToCreditsOnly: true,
        stalePiCancelOutcome: outcome,
      },
    });
  }
  return outcome;
}

// Get upcoming scheduled payments from local database
// This endpoint fetches scheduled payments created by the StripePaymentPlanService
router.get('/upcoming', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📅 Fetching upcoming scheduled payments for:', userEmail);

    // Get scheduled payments from local database
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    
    // Filter for pending and processing payments (processing may be from abandoned checkout)
    const pendingPayments = allScheduledPayments.filter(
      p => p.status === 'pending' || p.status === 'processing'
    );
    
    console.log(`📊 Found ${pendingPayments.length} pending/processing scheduled payments for ${userEmail}`);
    console.log(`📋 Payment IDs returned: [${pendingPayments.map(p => `${p.id}(e:${p.enrollmentId})`).join(', ')}]`);

    // Get parent user for credit lookup (needed for auto-pay credit preview)
    const parentUser = await storage.getUserByEmail(userEmail);

    // Get available credits once for the whole batch (for auto-pay preview)
    // Only computed when auto-pay is enabled — otherwise no preview needed
    let totalAvailableCredits = 0;
    if (parentUser?.autoPayEnabled) {
      try {
        const availableCredits = await storage.getAvailableCredits(parentUser.id);
        totalAvailableCredits = availableCredits.reduce(
          (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0
        );
      } catch (creditErr: any) {
        console.error('[upcoming] Could not fetch credits for preview:', creditErr.message);
      }
    }

    // Get enrollment details for enrichment
    // Sort payments by due date first so credit simulation is chronologically accurate
    const sortedPending = [...pendingPayments].sort(
      (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );

    // Simulate credit consumption across sorted installments to avoid over-promising
    // remaining credits that were already "spent" on earlier installments
    let simulatedCreditsRemaining = totalAvailableCredits;
    const creditPreviewMap = new Map<number, { creditsThatWillApply: number; estimatedNetCharge: number }>();

    if (parentUser?.autoPayEnabled && simulatedCreditsRemaining > 0) {
      for (const payment of sortedPending) {
        if (simulatedCreditsRemaining <= 0) break;
        const maxPartial = payment.amount - 50;
        let appliedHere = 0;
        let netCharge = payment.amount;

        if (simulatedCreditsRemaining >= payment.amount) {
          appliedHere = payment.amount;
          netCharge = 0;
        } else if (simulatedCreditsRemaining <= maxPartial) {
          appliedHere = simulatedCreditsRemaining;
          netCharge = payment.amount - appliedHere;
        } else if (maxPartial > 0) {
          appliedHere = maxPartial;
          netCharge = 50;
        }

        if (appliedHere > 0) {
          creditPreviewMap.set(payment.id, { creditsThatWillApply: appliedHere, estimatedNetCharge: netCharge });
          simulatedCreditsRemaining -= appliedHere;
        }
      }
    }

    const enrichedPayments = await Promise.all(pendingPayments.map(async (payment) => {
      let enrollmentDetails = null;
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          enrollmentDetails = {
            className: enrollment.className,
            childName: enrollment.childName
          };
        }
      }
      
      const metadata = payment.metadata as any || {};
      const creditPreview = creditPreviewMap.get(payment.id);

      return {
        id: payment.id,
        amount: payment.amount,
        dueDate: payment.scheduledDate,
        description: metadata.description || `Payment ${payment.installmentNumber} of ${payment.totalInstallments}`,
        paymentPlan: metadata.paymentPlan || 'biweekly',
        status: payment.status,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        enrollmentId: payment.enrollmentId,
        className: enrollmentDetails?.className || 'Class',
        childName: enrollmentDetails?.childName || '',
        ...(creditPreview !== undefined && {
          creditsThatWillApply: creditPreview.creditsThatWillApply,
          estimatedNetCharge: creditPreview.estimatedNetCharge,
        }),
      };
    }));

    // Sort by due date
    enrichedPayments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    res.json({
      success: true,
      payments: enrichedPayments
    });

  } catch (error) {
    console.error('❌ Error fetching scheduled payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch scheduled payments'
    });
  }
});

// DEPRECATED: Old Stripe subscription schedule-based endpoint
// Keeping commented out for reference during migration
/*
router.get('/upcoming-old', async (req, res) => {
  try {
    console.log('🚀 Upcoming payments API called');
    // Extract user email from Supabase token (same as billing summary)
    const authHeader = req.headers.authorization;
    console.log('🔑 Auth header present:', !!authHeader, authHeader ? 'Bearer token provided' : 'No auth header');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Missing or invalid authorization header');
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Simple token decode for email (same as billing.ts)
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Email not found in token'
        });
      }
    } catch (error) {
      console.log('❌ Token decode error:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    console.log('📅 Fetching scheduled payments for:', userEmail);
    
    if (!stripe) {
      console.log('❌ Stripe not configured');
      return res.json({
        success: true,
        payments: []
      });
    }
    
    // Get Stripe Subscription Schedules for this parent (NEW APPROACH)
    console.log('🔍 Checking Stripe Subscription Schedules...');
    const subscriptionSchedules = await storage.getStripeSubscriptionSchedulesByParentEmail(userEmail);
    console.log(`📋 Found ${subscriptionSchedules.length} subscription schedules for ${userEmail}`);
    
    const upcomingPayments = [];
    
    // For each schedule, fetch upcoming invoices from Stripe
    for (const localSchedule of subscriptionSchedules) {
      try {
        // Skip completed or canceled schedules
        if (localSchedule.status === 'completed' || localSchedule.status === 'canceled') {
          console.log(`⏭️ Skipping ${localSchedule.status} schedule ${localSchedule.stripeScheduleId}`);
          continue;
        }
        
        // Safely parse enrollmentIds with error handling
        let enrollmentIds: number[] = [];
        try {
          if (localSchedule.enrollmentIds) {
            const parsed = typeof localSchedule.enrollmentIds === 'string' 
              ? JSON.parse(localSchedule.enrollmentIds) 
              : localSchedule.enrollmentIds;
            enrollmentIds = Array.isArray(parsed) ? parsed : [];
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse enrollmentIds for schedule ${localSchedule.stripeScheduleId}:`, parseError);
          continue; // Skip this schedule if metadata is corrupted
        }
        
        if (enrollmentIds.length === 0) {
          console.log(`⚠️ No enrollments found for schedule ${localSchedule.stripeScheduleId}`);
          continue;
        }
        
        // Fetch live schedule data from Stripe
        const stripeSchedule = await stripe.subscriptionSchedules.retrieve(localSchedule.stripeScheduleId);
        console.log(`✅ Retrieved Stripe schedule ${stripeSchedule.id}, status: ${stripeSchedule.status}`);
        
        // Get upcoming invoice preview if schedule is active
        if (stripeSchedule.status === 'active' && stripeSchedule.subscription) {
          try {
            const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
              subscription: stripeSchedule.subscription as string
            });
            
            if (upcomingInvoice && upcomingInvoice.amount_due > 0) {
              // Get child and class names from enrollments with error handling
              const enrollments = [];
              for (const enrollmentId of enrollmentIds) {
                try {
                  const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
                  if (enrollment) enrollments.push(enrollment);
                } catch (enrollmentError) {
                  console.error(`❌ Failed to fetch enrollment ${enrollmentId}:`, enrollmentError);
                }
              }
              
              // Build display names with fallbacks
              const childNames = [...new Set(enrollments.map(e => e.childName).filter(Boolean))];
              const classNames = [...new Set(enrollments.map(e => e.className).filter(Boolean))];
              
              const childName = childNames.length === 0 ? 'Child' : 
                               childNames.length === 1 ? childNames[0] : 
                               `${childNames.length} children`;
              const className = classNames.length === 0 ? 'Class' :
                               classNames.length === 1 ? classNames[0] : 
                               `${classNames.length} classes`;
              
              // Safely parse Stripe timestamp for due date
              const periodEnd = upcomingInvoice.period_end;
              const dueDate = (periodEnd && typeof periodEnd === 'number' && periodEnd > 0) 
                ? new Date(periodEnd * 1000) 
                : new Date();
              const validDueDate = isNaN(dueDate.getTime()) ? new Date() : dueDate;
              
              upcomingPayments.push({
                id: localSchedule.id,
                amount: upcomingInvoice.amount_due,
                dueDate: validDueDate,
                status: 'pending',
                childName: childName,
                className: className,
                description: `Upcoming payment for ${localSchedule.paymentPlan} plan`,
                enrollmentIds: enrollmentIds,
                stripeScheduleId: localSchedule.stripeScheduleId,
                installmentNumber: localSchedule.currentPhase,
                totalInstallments: localSchedule.totalPhases
              });
              console.log(`📅 Added upcoming payment: ${upcomingInvoice.amount_due / 100} due ${validDueDate.toLocaleDateString()}`);
            }
          } catch (invoiceError: any) {
            // No upcoming invoice (schedule might be paused or no more payments)
            console.log(`ℹ️ No upcoming invoice for schedule ${stripeSchedule.id}:`, invoiceError.message);
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing schedule ${localSchedule.stripeScheduleId}:`, error.message);
        // Continue processing other schedules even if one fails
      }
    }
    
    // Sort by due date
    upcomingPayments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    console.log(`📊 Found ${upcomingPayments.length} upcoming payments from Stripe Subscription Schedules`);
    
    res.json({
      success: true,
      payments: upcomingPayments
    });
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch scheduled payments'
    });
  }
});
*/

// Process a scheduled payment.
//
// Server is the only source of truth for credits applied and charge amount;
// the client only sends `applyCredits` (default true) and the required
// `expectedChargeAmount` for the divergence guard.
router.post('/pay', supabaseAuth, async (req: any, res) => {
  try {
    const {
      paymentId,
      paymentMethodId,
      applyCredits: applyCreditsRaw,
      expectedChargeAmount,
    } = req.body;
    // Default credits ON to match auto-pay behavior.
    const applyCredits = applyCreditsRaw !== false;
    const userEmail = req.user.email;

    console.log('💳 Processing scheduled payment:', {
      paymentId, userEmail, applyCredits, expectedChargeAmount,
      paymentMethodId: paymentMethodId ? '[provided]' : null,
    });

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
    }

    // expectedChargeAmount is REQUIRED — the divergence guard relies on it.
    // Reject anything that is missing, non-numeric, negative, or non-finite.
    if (
      typeof expectedChargeAmount !== 'number' ||
      !Number.isFinite(expectedChargeAmount) ||
      expectedChargeAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        code: 'expected_charge_amount_required',
        error:
          'expectedChargeAmount (cents) is required and must be a non-negative finite number. ' +
          'Refresh the page so the displayed amount is sent with the payment request.',
      });
    }

    // Get the scheduled payment to verify it belongs to the user
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const scheduledPayment = allScheduledPayments.find(p => p.id === parseInt(paymentId));
    if (!scheduledPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }

    if (scheduledPayment.parentEmail !== userEmail) {
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }

    // Prevent duplicate payment attempts for already completed payments
    // Allow 'processing' status to proceed (user may be retrying after abandonment)
    if (scheduledPayment.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'This payment has already been completed'
      });
    }

    // SERVER-AUTHORITATIVE AMOUNT: Use the scheduled payment amount, not client-supplied
    const authoritativeAmount = scheduledPayment.amount;
    console.log('💰 Server-authoritative amount:', authoritativeAmount);

    // Get the user for credit validation
    const parentUser = await storage.getUserByEmail(userEmail);
    if (!parentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // SERVER-AUTHORITATIVE CREDIT MATH — mirrors the auto-pay scheduler.
    // *** This MUST run before any PI-reuse decision (code-review fix) ***
    // so a parent who toggles "Apply credits" between attempts is not silently
    // billed the previous PI's amount.
    const availableCreditsRows = await storage.getAvailableCredits(parentUser.id);
    const totalAvailableCredits = availableCreditsRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const decision = computeManualPayCredits({
      amount: authoritativeAmount,
      availableCredits: totalAvailableCredits,
      applyCredits,
    });
    const validatedCreditsToApply = decision.creditsToApply;
    const chargeAmount = decision.chargeAmount;
    console.log('💰 Credit decision:', {
      authoritativeAmount,
      availableCredits: totalAvailableCredits,
      applyCredits,
      validatedCreditsToApply,
      chargeAmount,
      isCreditsOnly: decision.isCreditsOnly,
    });

    // DIVERGENCE GUARD: refuse to charge an amount the client did not show
    // the parent. This is the regression-pin for Grace Mulcahy's case where
    // the displayed amount and the Stripe charge silently disagreed. Runs
    // BEFORE PI reuse so a stale PI cannot bypass the guard.
    if (isChargeAmountDivergent(expectedChargeAmount, chargeAmount)) {
      console.warn('⚠️ Charge amount diverged from client expectation', {
        paymentId,
        expectedChargeAmount,
        actualChargeAmount: chargeAmount,
        creditsApplied: validatedCreditsToApply,
        originalAmount: authoritativeAmount,
      });
      try {
        await emitDivergenceAlert({
          paymentId: scheduledPayment.id,
          parentId: parentUser.id,
          parentEmail: userEmail,
          schoolId: scheduledPayment.schoolId,
          expectedChargeAmount,
          actualChargeAmount: chargeAmount,
          creditsApplied: validatedCreditsToApply,
          originalAmount: authoritativeAmount,
        });
      } catch (alertErr) {
        console.error('❌ Failed to emit divergence alert (non-blocking):', alertErr);
      }
      return res.status(409).json({
        success: false,
        code: 'charge_amount_diverged',
        error:
          'The amount we are about to charge no longer matches what was shown. ' +
          'Please refresh the page and try again.',
        expectedChargeAmount,
        actualChargeAmount: chargeAmount,
        creditsApplied: validatedCreditsToApply,
        originalAmount: authoritativeAmount,
      });
    }

    // STALE-PI CLEANUP for the credits-only transition. See
    // `cancelStalePiForCreditsOnlyTransition` for rationale.
    if (
      scheduledPayment.status === 'processing' &&
      scheduledPayment.stripePaymentIntentId &&
      decision.isCreditsOnly
    ) {
      const stalePiId = scheduledPayment.stripePaymentIntentId;
      const outcome = await cancelStalePiForCreditsOnlyTransition(
        stalePiId,
        [scheduledPayment.id],
      );
      if (outcome === 'not_cancelable') {
        return res.status(409).json({
          success: false,
          code: 'stale_pi_not_cancelable',
          error:
            'A previous payment attempt is still being processed. Please refresh ' +
            'the page in a moment and try again.',
        });
      }
      scheduledPayment.status = 'pending';
      scheduledPayment.stripePaymentIntentId = null;
    }

    // PI REUSE — only safe if the existing PI's amount still matches the
    // freshly-computed `chargeAmount`. If the parent toggled "Apply credits"
    // between attempts, the previous PI is stale; we cancel it and let the
    // handler create a fresh one below (no double-charge risk because the
    // old PI was never confirmed).
    if (
      scheduledPayment.status === 'processing' &&
      scheduledPayment.stripePaymentIntentId &&
      !decision.isCreditsOnly
    ) {
      const stripe = await getStripeClient();
      const existingIntent = await stripe.paymentIntents.retrieve(scheduledPayment.stripePaymentIntentId);
      const existingAmount = existingIntent.amount || 0;
      if (!isChargeAmountDivergent(existingAmount, chargeAmount)) {
        console.log(`🔄 Payment ${paymentId} reusing existing PaymentIntent ${existingIntent.id} (amount matches: ${existingAmount}¢)`);
        return res.json({
          success: true,
          clientSecret: existingIntent.client_secret,
          paymentIntentId: existingIntent.id,
          chargeAmount: existingIntent.amount,
          creditsApplied: (scheduledPayment.metadata as Record<string, any>)?.pendingCreditsReservation || 0,
          reused: true
        });
      }
      // Stale PI — amount no longer matches the credit-aware decision.
      console.log(
        `♻️ Cancelling stale PI ${existingIntent.id} (amount ${existingAmount}¢) ` +
        `because charge amount changed to ${chargeAmount}¢ (parent likely toggled credits).`,
      );
      // Use the shared helper so the retry path treats `requires_action`
      // as cancelable too, and so we REFUSE to create a replacement PI when
      // the old one is already succeeded/processing/requires_capture
      // (otherwise we'd end up with two chargeable PIs for one installment).
      const cancelOutcome = await tryCancelStalePaymentIntent(existingIntent.id);
      if (cancelOutcome === 'not_cancelable') {
        console.error(
          `🚨 Refusing to replace PI ${existingIntent.id} for payment ${scheduledPayment.id}: ` +
          `existing PI is in non-cancelable status ${existingIntent.status}. ` +
          `Creating a new PI would risk double-charging the same installment.`,
        );
        return res.status(409).json({
          success: false,
          code: 'stale_pi_not_cancelable',
          error:
            'A previous payment attempt is still being processed. Please refresh ' +
            'the page in a moment and try again.',
        });
      }
      // Reset the scheduled payment so the create-PI block below can run.
      await storage.updateScheduledPayment(scheduledPayment.id, {
        status: 'pending',
        stripePaymentIntentId: null,
        metadata: {
          ...((scheduledPayment.metadata as Record<string, any>) || {}),
          previousStripePaymentIntentId: existingIntent.id,
          stalePiCancelledAt: new Date().toISOString(),
          stalePiCancelOutcome: cancelOutcome,
        },
      });
    }

    // Log if retrying a processing payment with no stored PI (legacy/edge case — proceed to create new PI)
    if (scheduledPayment.status === 'processing' && !scheduledPayment.stripePaymentIntentId) {
      console.log(`🔄 Retrying payment ${paymentId} in processing state with no stored PI — creating new PaymentIntent`);
    }

    // Sanity guard for inputs the helper flagged as un-chargeable. Runs AFTER
    // the credits-only branch below would have caught a fully-covered
    // sub-Stripe-minimum installment, so this only rejects truly unchargeable
    // (no credits cover, amount < $0.50) cases.
    if (decision.tooSmall) {
      return res.status(400).json({
        success: false,
        error: `Installment amount $${(authoritativeAmount / 100).toFixed(2)} is below the $${(STRIPE_MIN_CHARGE_CENTS / 100).toFixed(2)} Stripe minimum.`,
      });
    }

    // CREDITS-ONLY ZERO-CHARGE PATH — atomic finalize, no Stripe call.
    // Mirrors auto-pay scheduler's createCreditHolds → completeCreditsOnlyPayment
    // sequence so the parent-manual flow has the same correctness guarantees.
    if (decision.isCreditsOnly) {
      const holdSessionId = `parent_manual_credits_${scheduledPayment.id}_${Date.now()}`;
      const enrollmentForCredits = scheduledPayment.enrollmentId
        ? await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId)
        : null;
      let holdsCreated = false;
      try {
        const { totalHeld } = await storage.createCreditHolds(
          parentUser.id,
          validatedCreditsToApply,
          holdSessionId,
          `Parent-manual credits-only payment for scheduled payment ${scheduledPayment.id}`,
          5,
        );
        if (totalHeld < validatedCreditsToApply) {
          throw new Error(
            `Could not reserve enough credits: needed ${validatedCreditsToApply}¢, reserved ${totalHeld}¢`,
          );
        }
        holdsCreated = true;

        await storage.completeCreditsOnlyPayment({
          holdSessionId,
          scheduledPaymentId: scheduledPayment.id,
          parentId: parentUser.id,
          enrollmentId: scheduledPayment.enrollmentId ?? null,
          schoolId: scheduledPayment.schoolId,
          creditsApplied: validatedCreditsToApply,
          originalAmount: authoritativeAmount,
          installmentNumber: scheduledPayment.installmentNumber || 1,
          totalInstallments: scheduledPayment.totalInstallments || 1,
          parentEmail: userEmail,
          childName: enrollmentForCredits?.childName ?? null,
          className: enrollmentForCredits?.className ?? null,
          chargedBy: 'parent_manual',
          completionSource: 'parent_manual_credits_only',
          description:
            `Parent-manual installment ${scheduledPayment.installmentNumber || 1}` +
            `/${scheduledPayment.totalInstallments || 1} — fully covered by credits`,
        });

        console.log(
          `✅ Credits-only manual payment completed for scheduled payment ${scheduledPayment.id} ` +
          `(credits: ${validatedCreditsToApply}¢, original: ${authoritativeAmount}¢)`,
        );
        return res.json({
          success: true,
          creditsOnly: true,
          alreadyConfirmed: true,
          chargeAmount: 0,
          creditsApplied: validatedCreditsToApply,
          originalAmount: authoritativeAmount,
        });
      } catch (creditsErr: any) {
        if (holdsCreated) {
          try {
            await storage.releaseCreditHolds(holdSessionId);
          } catch (releaseErr) {
            console.error('❌ Failed to release credit holds after credits-only failure:', releaseErr);
          }
        }
        console.error('❌ Credits-only manual payment failed:', creditsErr);
        return res.status(500).json({
          success: false,
          error: creditsErr?.message || 'Failed to apply credits to scheduled payment',
        });
      }
    }

    // CREDIT RESERVATION: Mark scheduled payment as processing with pending credits
    // This prevents duplicate payment attempts and tracks reserved credits
    await storage.updateScheduledPayment(scheduledPayment.id, {
      status: 'processing',
      metadata: {
        ...((scheduledPayment.metadata as Record<string, any>) || {}),
        pendingCreditsReservation: validatedCreditsToApply,
        paymentIntentCreatedAt: new Date().toISOString()
      }
    });
    console.log(`🔒 Reserved ${validatedCreditsToApply} credits for payment ${scheduledPayment.id} (status: processing)`);

    // Get the enrollment to retrieve enrollmentIds and Stripe customer
    const enrollment = scheduledPayment.enrollmentId 
      ? await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId)
      : null;
    
    // Build enrollmentIds array - use the enrollment from the scheduled payment
    const enrollmentIds = enrollment ? [enrollment.id] : [];
    
    // Get existing Stripe customer ID from enrollment or parent user
    let stripeCustomerId = enrollment?.stripeCustomerId || null;
    
    // If no customer ID on enrollment, try to find from parent user
    if (!stripeCustomerId) {
      stripeCustomerId = parentUser?.stripeCustomerId || null;
    }
    
    console.log('💳 Processing scheduled payment with context:', {
      paymentId,
      enrollmentId: scheduledPayment.enrollmentId,
      enrollmentIds,
      stripeCustomerId,
      originalAmount: authoritativeAmount,
      creditsApplied: validatedCreditsToApply,
      chargeAmount
    });

    // Create Stripe payment intent with complete metadata
    const stripe = await getStripeClient();

    // SAVED-CARD FLOW: if paymentMethodId provided, validate it belongs to this customer
    let useSavedCard = false;
    if (paymentMethodId) {
      if (!stripeCustomerId) {
        // Lazily create a customer record so we can attach the saved card flow
        const newCustomer = await stripe.customers.create({
          email: userEmail,
          name: parentUser.name || undefined,
          metadata: { userId: String(parentUser.id) },
        });
        stripeCustomerId = newCustomer.id;
        await storage.updateUser(parentUser.id, { stripeCustomerId: stripeCustomerId });
      }

      try {
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== stripeCustomerId) {
          throw new Error('Payment method does not belong to this account');
        }
        useSavedCard = true;
      } catch (pmErr: any) {
        return res.status(400).json({
          success: false,
          error: pmErr.message || 'Invalid saved card. Please pick another payment method.'
        });
      }
    }

    const paymentIntentParams: any = {
      amount: Math.round(chargeAmount), // Charge reduced amount after credits
      currency: 'usd',
      metadata: {
        type: 'scheduled_payment',
        paymentType: 'scheduled_payment',
        scheduledPaymentId: paymentId.toString(),
        parentEmail: userEmail,
        description: `Scheduled Payment ${scheduledPayment.installmentNumber}`,
        // CRITICAL: Include enrollmentIds so webhook can update balances
        enrollmentIds: JSON.stringify(enrollmentIds),
        enrollmentId: scheduledPayment.enrollmentId?.toString() || '',
        installmentNumber: scheduledPayment.installmentNumber?.toString() || '1',
        totalInstallments: scheduledPayment.totalInstallments?.toString() || '1',
        createdBy: 'asa_payment_system',
        version: 'v2_scheduled_payment',
        // Credit tracking metadata - SERVER AUTHORITATIVE VALUES
        originalAmountCents: authoritativeAmount.toString(),
        creditsAppliedCents: validatedCreditsToApply.toString(),
        userId: parentUser.id.toString(),
        savedCardOneClick: useSavedCard ? 'true' : 'false',
      },
    };

    if (useSavedCard) {
      paymentIntentParams.customer = stripeCustomerId;
      paymentIntentParams.payment_method = paymentMethodId;
      paymentIntentParams.confirm = true;
      paymentIntentParams.off_session = true;
      console.log('👤 Charging saved card off-session for customer:', stripeCustomerId);
    } else {
      paymentIntentParams.automatic_payment_methods = { enabled: true };
      // CRITICAL: Reuse existing Stripe customer instead of creating guest
      if (stripeCustomerId) {
        paymentIntentParams.customer = stripeCustomerId;
        console.log('👤 Using existing Stripe customer:', stripeCustomerId);
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log('✅ Created payment intent for scheduled payment:', paymentIntent.id, 'with enrollmentIds:', enrollmentIds, 'chargeAmount:', chargeAmount, 'status:', paymentIntent.status);

    // Immediately store the PI ID to prevent double-charge on concurrent retries
    await storage.updateScheduledPayment(parseInt(paymentId), {
      stripePaymentIntentId: paymentIntent.id,
      chargedBy: useSavedCard ? 'parent_manual_saved_card' : 'parent_manual'
    });

    // For saved-card flow: PI is already confirmed; tell client to skip Stripe Elements
    if (useSavedCard && paymentIntent.status === 'succeeded') {
      return res.json({
        success: true,
        alreadyConfirmed: true,
        paymentIntentId: paymentIntent.id,
        chargeAmount,
        creditsApplied: validatedCreditsToApply
      });
    }

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      chargeAmount,
      creditsApplied: validatedCreditsToApply
    });

  } catch (error: any) {
    console.error('❌ Error processing scheduled payment:', error);

    // Detect synchronous Stripe card decline (off-session, saved-card flow)
    const isCardDecline =
      error?.type === 'StripeCardError' ||
      error?.code === 'card_declined' ||
      error?.code === 'authentication_required';

    // ROLLBACK: Reset scheduled payment status if Stripe intent creation failed
    try {
      const { paymentId } = req.body;
      if (paymentId) {
        console.log(`🔓 Rolling back credit reservation for payment ${paymentId} after error`);
        
        // Get existing metadata to preserve
        const allPayments = await storage.getScheduledPaymentsByParentEmail(req.user.email);
        const existingPayment = allPayments.find(p => p.id === parseInt(paymentId));
        const existingMetadata = (existingPayment?.metadata as Record<string, any>) || {};
        
        await storage.updateScheduledPayment(parseInt(paymentId), {
          status: 'pending',  // Reset to pending to allow retry
          metadata: {
            ...existingMetadata,  // Preserve existing metadata
            pendingCreditsReservation: 0,
            lastErrorAt: new Date().toISOString(),
            errorReason: error instanceof Error ? error.message : 'Unknown error'
          }
        });
        console.log(`✅ Reset scheduled payment ${paymentId} to pending after failure`);
      }
    } catch (rollbackError) {
      console.error('❌ Failed to rollback scheduled payment status:', rollbackError);
    }

    if (isCardDecline) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Saved card was declined. Please try a different payment method.',
        cardDeclined: true,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process scheduled payment'
    });
  }
});

// Process scheduled payment using credits only (no Stripe charge)
router.post('/pay-with-credits', supabaseAuth, async (req: any, res) => {
  try {
    const { paymentId, creditsToApply } = req.body;
    const userEmail = req.user.email;

    console.log('🎫 Processing credit-only scheduled payment:', { paymentId, creditsToApply, userEmail });

    if (!paymentId || !creditsToApply || creditsToApply <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID and credits amount are required'
      });
    }

    // Get the scheduled payment to verify it belongs to the user
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const scheduledPayment = allScheduledPayments.find(p => p.id === parseInt(paymentId));
    if (!scheduledPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }

    if (scheduledPayment.parentEmail !== userEmail) {
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }

    if (scheduledPayment.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'This payment has already been completed'
      });
    }

    // Get the user for credit validation and consumption
    const parentUser = await storage.getUserByEmail(userEmail);
    if (!parentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // SERVER-SIDE CREDIT VALIDATION
    const availableCredits = await storage.getAvailableCredits(parentUser.id);
    const totalAvailable = availableCredits.reduce((sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0);
    
    // Validate that credits fully cover the payment
    const paymentAmount = scheduledPayment.amount;
    if (creditsToApply < paymentAmount) {
      return res.status(400).json({
        success: false,
        error: 'Credits do not fully cover the payment amount. Use regular pay endpoint for partial credit payments.'
      });
    }
    
    if (totalAvailable < paymentAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. Available: ${totalAvailable} cents, Required: ${paymentAmount} cents`
      });
    }

    console.log('💰 Credit-only payment validation passed:', { 
      paymentAmount, 
      creditsToApply, 
      totalAvailable 
    });

    // CONSUME CREDITS using the existing FIFO pattern
    const { usedCredits, totalUsed } = await storage.useCredits(
      parentUser.id,
      paymentAmount,
      undefined, // paymentHistoryId - we'll create it after
      `Scheduled payment ${scheduledPayment.id} - ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`
    );

    console.log(`💰 ✅ Consumed ${totalUsed} cents across ${usedCredits.length} credits for scheduled payment`);

    // Mark the scheduled payment as completed
    await storage.updateScheduledPayment(scheduledPayment.id, {
      status: 'completed',
      processedAt: new Date(),
    });

    // Update enrollment totalPaid if we have an enrollment
    if (scheduledPayment.enrollmentId) {
      const enrollment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
      if (enrollment) {
        const newTotalPaid = (enrollment.totalPaid || 0) + paymentAmount;
        const totalCost = enrollment.totalCost || 0;
        const remainingBalance = Math.max(0, totalCost - newTotalPaid);
        
        await storage.updateProgramEnrollment(enrollment.id, {
          totalPaid: newTotalPaid,
          remainingBalance
        });
        
        console.log(`✅ Updated enrollment ${enrollment.id}: totalPaid=${newTotalPaid}, remaining=${remainingBalance}`);
      }
    }

    // Get enrollment details for payment record
    let childName = 'Child';
    let className = 'Class';
    if (scheduledPayment.enrollmentId) {
      const enrollment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
      if (enrollment) {
        childName = enrollment.childName || 'Child';
        className = enrollment.className || 'Class';
      }
    }
    
    // Create a payment record for tracking
    await storage.createPayment({
      schoolId: scheduledPayment.schoolId,
      parentId: parentUser.id,
      parentEmail: userEmail,
      childName,
      className,
      amount: paymentAmount,
      paymentDate: new Date(),
      status: 'completed',
      paymentMethod: 'other',  // 'credits' is not a valid type, use 'other' with description
      description: `Credit payment for ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`,
      enrollmentIds: scheduledPayment.enrollmentId ? [scheduledPayment.enrollmentId] : [],
      stripePaymentIntentId: `credit_${Date.now()}_${scheduledPayment.id}`,
      metadata: { scheduledPaymentId: scheduledPayment.id, paymentType: 'credits' },
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
    });

    console.log('✅ Credit-only payment completed successfully for scheduled payment:', scheduledPayment.id);

    res.json({
      success: true,
      message: 'Payment completed using credits',
      creditsUsed: totalUsed,
      remainingCredits: totalAvailable - totalUsed
    });

  } catch (error) {
    console.error('❌ Error processing credit-only payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process credit payment'
    });
  }
});

// Pay multiple combined scheduled payments using credits only (no Stripe needed)
// Mirrors pay-with-credits pattern but loops across all payments in the combined group
router.post('/pay-combined-with-credits', supabaseAuth, async (req: any, res) => {
  try {
    const { scheduledPaymentIds, creditsToApply } = req.body;
    const userEmail = req.user.email;

    console.log('🎫 Processing combined credit-only payment:', { scheduledPaymentIds, creditsToApply, userEmail });

    if (!scheduledPaymentIds || !Array.isArray(scheduledPaymentIds) || scheduledPaymentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'scheduledPaymentIds array is required'
      });
    }

    if (!creditsToApply || creditsToApply <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Credits amount is required'
      });
    }

    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const paymentsToProcess: any[] = [];

    for (const id of scheduledPaymentIds) {
      const payment = allScheduledPayments.find(p => p.id === parseInt(id));
      if (!payment) {
        return res.status(404).json({
          success: false,
          error: `Scheduled payment ${id} not found`
        });
      }
      if (payment.parentEmail !== userEmail) {
        return res.status(403).json({
          success: false,
          error: `Payment ${id} does not belong to this user`
        });
      }
      if (payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: `Payment ${id} has already been completed`
        });
      }
      paymentsToProcess.push(payment);
    }

    const combinedAmount = paymentsToProcess.reduce((sum, p) => sum + p.amount, 0);

    if (creditsToApply < combinedAmount) {
      return res.status(400).json({
        success: false,
        error: 'Credits do not fully cover the combined payment amount. Use pay-combined endpoint for partial credit payments.'
      });
    }

    const parentUser = await storage.getUserByEmail(userEmail);
    if (!parentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const availableCredits = await storage.getAvailableCredits(parentUser.id);
    const totalAvailable = availableCredits.reduce((sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0);

    if (totalAvailable < combinedAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. Available: ${totalAvailable} cents, Required: ${combinedAmount} cents`
      });
    }

    console.log('💰 Combined credit-only payment validation passed:', {
      combinedAmount,
      creditsToApply,
      totalAvailable,
      paymentCount: paymentsToProcess.length
    });

    let totalCreditsUsed = 0;

    for (const payment of paymentsToProcess) {
      const paymentAmount = payment.amount;

      const { usedCredits, totalUsed } = await storage.useCredits(
        parentUser.id,
        paymentAmount,
        undefined,
        `Combined credit payment - Scheduled payment ${payment.id} - ${payment.installmentNumber}/${payment.totalInstallments}`
      );

      totalCreditsUsed += totalUsed;
      console.log(`💰 ✅ Consumed ${totalUsed} cents for scheduled payment ${payment.id}`);

      await storage.updateScheduledPayment(payment.id, {
        status: 'completed',
        processedAt: new Date(),
      });

      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          const newTotalPaid = (enrollment.totalPaid || 0) + paymentAmount;
          const totalCost = enrollment.totalCost || 0;
          const remainingBalance = Math.max(0, totalCost - newTotalPaid);

          await storage.updateProgramEnrollment(enrollment.id, {
            totalPaid: newTotalPaid,
            remainingBalance
          });

          console.log(`✅ Updated enrollment ${enrollment.id}: totalPaid=${newTotalPaid}, remaining=${remainingBalance}`);
        }
      }

      let childName = 'Child';
      let className = 'Class';
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          childName = enrollment.childName || 'Child';
          className = enrollment.className || 'Class';
        }
      }

      await storage.createPayment({
        schoolId: payment.schoolId,
        parentId: parentUser.id,
        parentEmail: userEmail,
        childName,
        className,
        amount: paymentAmount,
        paymentDate: new Date(),
        status: 'completed',
        paymentMethod: 'other',
        description: `Credit payment for ${payment.installmentNumber}/${payment.totalInstallments} (combined)`,
        enrollmentIds: payment.enrollmentId ? [payment.enrollmentId] : [],
        stripePaymentIntentId: `credit_combined_${Date.now()}_${payment.id}`,
        metadata: { scheduledPaymentId: payment.id, paymentType: 'credits_combined' },
        stripeChargeId: null,
        stripeRefundId: null,
        originalPaymentId: null,
      });
    }

    console.log('✅ Combined credit-only payment completed:', {
      paymentsProcessed: paymentsToProcess.length,
      totalCreditsUsed
    });

    res.json({
      success: true,
      message: `${paymentsToProcess.length} payments completed using credits`,
      creditsUsed: totalCreditsUsed,
      remainingCredits: totalAvailable - totalCreditsUsed,
      paymentsProcessed: paymentsToProcess.length
    });

  } catch (error) {
    console.error('❌ Error processing combined credit-only payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process combined credit payment'
    });
  }
});

// Confirm a scheduled payment after successful Stripe payment
// This endpoint verifies with Stripe that the PaymentIntent succeeded before updating status
// Provides immediate status update without waiting for webhook (server-authoritative)
router.post('/:id/confirm', supabaseAuth, async (req: any, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const { paymentIntentId } = req.body;
    const userEmail = req.user.email;

    console.log('🔐 Confirming scheduled payment with Stripe verification:', { 
      paymentId, 
      paymentIntentId: paymentIntentId?.substring(0, 20) + '...', 
      userEmail 
    });

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'PaymentIntent ID is required for confirmation'
      });
    }

    // Get the scheduled payment first
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const scheduledPayment = allScheduledPayments.find(p => p.id === paymentId);

    if (!scheduledPayment) {
      console.error(`❌ Scheduled payment ${paymentId} not found for ${userEmail}`);
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }

    // IDEMPOTENCY CHECK: If already completed, return success without reprocessing
    if (scheduledPayment.status === 'completed' || scheduledPayment.status === 'paid') {
      console.log(`✅ Payment ${paymentId} already completed - returning idempotent success`);
      return res.json({
        success: true,
        message: 'Payment already confirmed',
        alreadyProcessed: true
      });
    }

    // VERIFY WITH STRIPE that the PaymentIntent actually succeeded
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    console.log('🔍 Stripe PaymentIntent verification:', {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount
    });

    if (paymentIntent.status !== 'succeeded') {
      console.error(`❌ PaymentIntent ${paymentIntentId} status is ${paymentIntent.status}, not succeeded`);
      return res.status(400).json({
        success: false,
        error: `Payment not yet successful. Status: ${paymentIntent.status}`
      });
    }

    // SECURITY CHECK: Verify this payment belongs to this user via metadata
    if (paymentIntent.metadata?.parentEmail !== userEmail) {
      console.error(`❌ PaymentIntent ${paymentIntentId} belongs to ${paymentIntent.metadata?.parentEmail}, not ${userEmail}`);
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }

    // CRITICAL SECURITY CHECK: Verify PaymentIntent is for THIS scheduled payment
    // This prevents a user from using any of their succeeded PaymentIntents to confirm any scheduled payment
    const paymentIntentScheduledPaymentId = paymentIntent.metadata?.scheduledPaymentId;
    if (!paymentIntentScheduledPaymentId || parseInt(paymentIntentScheduledPaymentId) !== paymentId) {
      console.error(`❌ PaymentIntent ${paymentIntentId} scheduledPaymentId mismatch: metadata has ${paymentIntentScheduledPaymentId}, but request is for ${paymentId}`);
      return res.status(400).json({
        success: false,
        error: 'Payment intent does not match this scheduled payment'
      });
    }

    // AMOUNT VERIFICATION: Ensure the payment amount matches expected
    // The originalAmountCents (before credits) should match the scheduled payment amount
    const expectedAmount = scheduledPayment.amount;
    const originalAmountCents = parseInt(paymentIntent.metadata?.originalAmountCents || '0') || paymentIntent.amount;
    // Allow for credits being applied - original amount should match scheduled amount
    // Use Stripe amount + credits applied as the total that should match scheduled amount
    const creditsApplied = parseInt(paymentIntent.metadata?.creditsAppliedCents || '0');
    const totalPaymentAmount = paymentIntent.amount + creditsApplied;
    
    // Allow small variance (1 cent) for rounding
    if (Math.abs(totalPaymentAmount - expectedAmount) > 1 && Math.abs(originalAmountCents - expectedAmount) > 1) {
      console.warn(`⚠️ PaymentIntent amount mismatch: PI total=${totalPaymentAmount}, original=${originalAmountCents}, expected=${expectedAmount}`);
      // Log warning but proceed - webhook reconciliation will catch discrepancies
    }

    // UPDATE SCHEDULED PAYMENT STATUS TO COMPLETED
    await storage.updateScheduledPayment(paymentId, {
      status: 'completed',
      processedAt: new Date(),
    });
    console.log(`✅ Marked scheduled payment ${paymentId} as completed`);

    // COMPUTE AUTHORITATIVE PAYMENT SPLIT (single source of truth for allocations)
    // Reuse originalAmountCents from verification above, use creditsApplied for consistency
    const totalPaymentReceived = creditsApplied > 0 ? originalAmountCents : paymentIntent.amount;
    
    const hasMembership = paymentIntent.metadata?.hasMembership === 'true';
    const membershipAmount = hasMembership ? parseInt(paymentIntent.metadata?.membershipAmount || '0') : 0;
    const enrollmentAmount = Math.max(0, totalPaymentReceived - membershipAmount);
    
    // Validate split sums correctly (fail-safe check)
    if (membershipAmount + enrollmentAmount !== totalPaymentReceived) {
      console.warn(`⚠️ Allocation mismatch: membership(${membershipAmount}) + enrollment(${enrollmentAmount}) != total(${totalPaymentReceived}). Using enrollment=${totalPaymentReceived - membershipAmount}`);
    }
    
    console.log(`💰 Payment split: total=${totalPaymentReceived}, membership=${membershipAmount}, enrollment=${enrollmentAmount}`);

    // ENSURE PAYMENT HISTORY EXISTS for audit trail (create if missing)
    let paymentHistory = await storage.getStripePaymentByIntentId(paymentIntent.id);
    if (!paymentHistory) {
      try {
        const userId = parseInt(paymentIntent.metadata?.userId || '0');
        paymentHistory = await (storage as any).saveStripePayment({
          userId: userId > 0 ? userId : null,
          paymentIntentId: paymentIntent.id,
          customerId: (paymentIntent.customer as string) || `cus_scheduled_${Date.now()}`,
          subscriptionId: null,
          amount: totalPaymentReceived,
          currency: paymentIntent.currency || 'usd',
          status: 'succeeded',
          description: `Scheduled payment ${paymentId} - ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`,
          receiptEmail: paymentIntent.receipt_email || null,
          metadata: {
            ...paymentIntent.metadata,
            scheduledPaymentId: paymentId,
            processedVia: 'scheduled_payment_confirm'
          }
        });
        console.log(`✅ Created payment history record: ${paymentHistory?.id}`);
      } catch (historyError) {
        console.error('⚠️ Failed to create payment history:', historyError);
        // Continue - allocation tracking is best-effort
      }
    }

    // CREATE PAYMENT RECORD for payment history display (using payments table)
    // This follows the same pattern as credit-only payments (line 562-575)
    try {
      const parentUser = await storage.getUserByEmail(userEmail);
      let childName = 'Child';
      let className = 'Class';
      
      if (scheduledPayment.enrollmentId) {
        const enrollmentForPayment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
        if (enrollmentForPayment) {
          childName = enrollmentForPayment.childName || 'Child';
          className = enrollmentForPayment.className || 'Class';
        }
      }
      
      if (parentUser) {
        await storage.createPayment({
          schoolId: scheduledPayment.schoolId,
          parentId: parentUser.id,
          parentEmail: userEmail,
          childName,
          className,
          amount: totalPaymentReceived,
          paymentDate: new Date(),
          status: 'completed',
          paymentMethod: 'stripe',
          description: `Scheduled payment ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`,
          enrollmentIds: scheduledPayment.enrollmentId ? [scheduledPayment.enrollmentId] : [],
          stripePaymentIntentId: paymentIntent.id,
          metadata: { scheduledPaymentId: paymentId, paymentType: 'biweekly' },
          stripeChargeId: null,
          stripeRefundId: null,
          originalPaymentId: null,
        });
        console.log(`✅ Created payment record in payments table for history display`);
      }
    } catch (paymentRecordError) {
      console.error('⚠️ Failed to create payment record:', paymentRecordError);
      // Continue - this is for display purposes, not critical
    }

    // UPDATE ENROLLMENT BALANCE
    const targetEnrollmentId = scheduledPayment.enrollmentId;
    
    if (targetEnrollmentId) {
      try {
        const enrollment = await storage.getProgramEnrollmentById(targetEnrollmentId);
        
        if (enrollment) {
          const currentAmountPaid = enrollment.totalPaid || 0;
          const newAmountPaid = currentAmountPaid + enrollmentAmount;
          const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
          
          await storage.updateProgramEnrollment(targetEnrollmentId, {
            totalPaid: newAmountPaid,
            remainingBalance: newBalance,
            paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment'
          });
          
          console.log(`✅ Updated enrollment ${targetEnrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);
          
          // Create payment allocation record for enrollment audit trail
          if (enrollmentAmount > 0 && paymentHistory) {
            try {
              await storage.createPaymentAllocation({
                paymentHistoryId: paymentHistory.id,
                enrollmentId: targetEnrollmentId,
                membershipEnrollmentId: null,
                allocatedAmountCents: enrollmentAmount,
                allocationType: 'payment',
                sourceAllocationId: null,
                adminComment: null,
                metadata: {
                  scheduledPaymentId: paymentId,
                  installmentNumber: scheduledPayment.installmentNumber,
                  totalInstallments: scheduledPayment.totalInstallments,
                  totalPaymentReceived,
                  membershipDeducted: membershipAmount,
                  processedVia: 'scheduled_payment_confirm'
                }
              });
              console.log(`✅ Created enrollment payment allocation for ${enrollmentAmount} cents`);
            } catch (allocationError) {
              console.error('⚠️ Failed to create enrollment allocation record:', allocationError);
            }
          }
        }
      } catch (enrollmentError) {
        console.error(`⚠️ Error updating enrollment ${targetEnrollmentId}:`, enrollmentError);
        // Don't fail the whole request - enrollment can be reconciled later
      }
    }

    // PROCESS MEMBERSHIP ALLOCATION if this payment includes membership (first biweekly payment)
    if (hasMembership && membershipAmount > 0) {
      try {
        const membershipParentUserId = parseInt(paymentIntent.metadata?.membershipParentUserId || '0');
        const membershipSchoolId = parseInt(paymentIntent.metadata?.membershipSchoolId || '0');
        const membershipYear = parseInt(paymentIntent.metadata?.membershipYear || new Date().getFullYear().toString());
        
        console.log('🎫 Processing membership allocation from scheduled payment:', {
          parentUserId: membershipParentUserId,
          schoolId: membershipSchoolId,
          amount: membershipAmount,
          year: membershipYear,
          paymentId
        });
        
        if (membershipParentUserId > 0 && membershipSchoolId > 0) {
          // Find existing membership enrollment
          const existingMemberships = await storage.getMembershipEnrollmentsByParentId(membershipParentUserId);
          const membershipEnrollment = existingMemberships.find((m: any) => 
            m.schoolId === membershipSchoolId && 
            (m.membershipYear === membershipYear || m.membershipYear === membershipYear + 1)
          );
          
          if (membershipEnrollment) {
            // Update existing membership
            const currentPaid = membershipEnrollment.amountPaid || 0;
            const newPaid = currentPaid + membershipAmount;
            const newBalance = Math.max(0, (membershipEnrollment.amount || 0) - newPaid);
            
            await storage.updateMembershipEnrollment(membershipEnrollment.id, {
              amountPaid: newPaid,
              remainingBalance: newBalance,
              balanceDue: newBalance,
              status: newBalance <= 0 ? 'enrolled' : membershipEnrollment.status
            });
            
            console.log(`✅ Updated membership enrollment ${membershipEnrollment.id}: paid=${newPaid}, remaining=${newBalance}`);
            
            // Create payment allocation record for membership audit trail (use pre-fetched paymentHistory)
            if (paymentHistory) {
              try {
                await storage.createPaymentAllocation({
                  paymentHistoryId: paymentHistory.id,
                  enrollmentId: null,
                  membershipEnrollmentId: membershipEnrollment.id,
                  allocatedAmountCents: membershipAmount,
                  allocationType: 'membership',
                  sourceAllocationId: null,
                  adminComment: null,
                  metadata: {
                    scheduledPaymentId: paymentId,
                    membershipYear,
                    schoolId: membershipSchoolId,
                    totalPaymentReceived,
                    enrollmentAllocated: enrollmentAmount,
                    processedVia: 'scheduled_payment_confirm'
                  }
                });
                console.log(`✅ Created membership payment allocation for ${membershipAmount} cents`);
              } catch (allocationError) {
                console.error('⚠️ Failed to create membership allocation record:', allocationError);
              }
            }
          } else {
            // Create new membership enrollment (rare case - should exist from checkout)
            console.log(`⚠️ No existing membership found for parent ${membershipParentUserId} - creating new one`);
            const school = await storage.getSchool(membershipSchoolId);
            const now = new Date();
            const expirationDate = new Date(now);
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            
            await storage.createMembershipEnrollment({
              schoolId: membershipSchoolId,
              parentUserId: membershipParentUserId,
              membershipYear,
              membershipTier: 'basic',
              amount: school?.membershipFeeAmount || membershipAmount,
              amountPaid: membershipAmount,
              remainingBalance: Math.max(0, (school?.membershipFeeAmount || membershipAmount) - membershipAmount),
              totalAmount: school?.membershipFeeAmount || membershipAmount,
              balanceDue: Math.max(0, (school?.membershipFeeAmount || membershipAmount) - membershipAmount),
              status: 'enrolled',
              stripeCustomerId: (paymentIntent.customer as string) || null,
              stripeSubscriptionId: null,
              dueDate: now,
              endDate: expirationDate,
              expirationDate: expirationDate,
              gracePeriodEnd: null,
              paymentMethod: 'other',
              notes: `Scheduled payment confirmation (${paymentIntent.id})`,
              startDate: now,
              renewalDate: expirationDate
            });
            console.log(`✅ Created new membership enrollment for parent ${membershipParentUserId}`);
          }
        }
      } catch (membershipError) {
        console.error('❌ Error processing membership allocation:', membershipError);
        // Don't fail the whole request - membership can be reconciled later
      }
    }

    // CONSUME CREDITS if any were applied (use creditsApplied from verification block)
    const userId = parseInt(paymentIntent.metadata?.userId || '0');
    
    if (creditsApplied > 0 && userId > 0) {
      try {
        console.log(`💰 Consuming ${creditsApplied} cents of credits for user ${userId}`);
        const { usedCredits, totalUsed } = await storage.useCredits(
          userId,
          creditsApplied,
          undefined,
          `Scheduled payment ${paymentId} - ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`
        );
        console.log(`💰 ✅ Consumed ${totalUsed} cents across ${usedCredits.length} credit records`);
      } catch (creditError) {
        console.error(`❌ Failed to consume credits for scheduled payment ${paymentId}:`, creditError);
        // Don't fail - credits can be manually reconciled
      }
    }

    res.json({
      success: true,
      message: 'Scheduled payment confirmed and completed',
      payment: {
        id: paymentId,
        status: 'completed',
        amount: paymentIntent.amount,
        stripePaymentIntentId: paymentIntentId
      }
    });

  } catch (error) {
    console.error('❌ Error confirming scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm scheduled payment'
    });
  }
});

// Get scheduled payments grouped by due date for consolidated family payments
router.get('/grouped', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📅 Fetching grouped scheduled payments for:', userEmail);

    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const pendingPayments = allScheduledPayments.filter(
      p => p.status === 'pending' || p.status === 'processing'
    );

    if (pendingPayments.length === 0) {
      return res.json({ success: true, groups: [] });
    }

    const enrichedPayments = await Promise.all(pendingPayments.map(async (payment) => {
      let enrollmentDetails = null;
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          enrollmentDetails = {
            className: enrollment.className,
            childName: enrollment.childName
          };
        }
      }
      const metadata = payment.metadata as any || {};
      return {
        id: payment.id,
        amount: payment.amount,
        dueDate: payment.scheduledDate,
        status: payment.status,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        enrollmentId: payment.enrollmentId,
        schoolId: payment.schoolId,
        className: enrollmentDetails?.className || 'Class',
        childName: enrollmentDetails?.childName || '',
        paymentPlan: metadata.paymentPlan || 'biweekly',
        description: metadata.description || `Payment ${payment.installmentNumber} of ${payment.totalInstallments}`,
      };
    }));

    const groupMap: Record<string, {
      dueDate: string;
      dueDateFormatted: string;
      payments: typeof enrichedPayments;
      totalAmount: number;
      paymentCount: number;
      schoolId: number;
    }> = {};

    for (const payment of enrichedPayments) {
      const dateKey = new Date(payment.dueDate).toISOString().split('T')[0];
      if (!groupMap[dateKey]) {
        groupMap[dateKey] = {
          dueDate: dateKey,
          dueDateFormatted: new Date(payment.dueDate).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
          }),
          payments: [],
          totalAmount: 0,
          paymentCount: 0,
          schoolId: payment.schoolId,
        };
      }
      groupMap[dateKey].payments.push(payment);
      groupMap[dateKey].totalAmount += payment.amount;
      groupMap[dateKey].paymentCount += 1;
    }

    const groups = Object.values(groupMap).sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    console.log(`📊 Grouped ${pendingPayments.length} payments into ${groups.length} date groups for ${userEmail}`);

    res.json({ success: true, groups });
  } catch (error) {
    console.error('❌ Error fetching grouped scheduled payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch grouped payments'
    });
  }
});

// Pay multiple scheduled payments in a single combined Stripe charge
// (Combined Pay Now flow).
//
// Task 173 — same divergence/credits-default fix as `/pay`:
//   * Credits default ON (`applyCredits` defaults to true).
//   * Server is the only source of truth for `creditsToApply` / `chargeAmount`.
//   * Optional `expectedChargeAmount` is enforced via `isChargeAmountDivergent`.
//   * Credits-only zero-charge path uses the same atomic
//     `createCreditHolds` → `completeCreditsOnlyPayment` sequence per
//     installment, in due-date order, so we never silently fall through to a
//     gross Stripe charge.
router.post('/pay-combined', supabaseAuth, async (req: any, res) => {
  try {
    const {
      scheduledPaymentIds,
      paymentMethodId,
      applyCredits: applyCreditsRaw,
      expectedChargeAmount,
    } = req.body;
    const applyCredits = applyCreditsRaw !== false;
    const userEmail = req.user.email;

    console.log('💳 Processing combined payment:', {
      scheduledPaymentIds, userEmail, applyCredits, expectedChargeAmount,
      paymentMethodId: paymentMethodId ? '[provided]' : null,
    });

    if (!scheduledPaymentIds || !Array.isArray(scheduledPaymentIds) || scheduledPaymentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'scheduledPaymentIds array is required'
      });
    }

    if (scheduledPaymentIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Cannot combine more than 50 payments at once'
      });
    }

    // expectedChargeAmount is REQUIRED — divergence guard relies on it.
    if (
      typeof expectedChargeAmount !== 'number' ||
      !Number.isFinite(expectedChargeAmount) ||
      expectedChargeAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        code: 'expected_charge_amount_required',
        error:
          'expectedChargeAmount (cents) is required and must be a non-negative finite number. ' +
          'Refresh the page so the displayed amount is sent with the payment request.',
      });
    }

    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const paymentsToProcess: any[] = [];

    for (const id of scheduledPaymentIds) {
      const payment = allScheduledPayments.find(p => p.id === parseInt(id));
      if (!payment) {
        return res.status(404).json({
          success: false,
          error: `Scheduled payment ${id} not found`
        });
      }
      if (payment.parentEmail !== userEmail) {
        return res.status(403).json({
          success: false,
          error: `Payment ${id} does not belong to this user`
        });
      }
      if (payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: `Payment ${id} has already been completed`
        });
      }
      paymentsToProcess.push(payment);
    }

    const schoolIds = [...new Set(paymentsToProcess.map(p => p.schoolId))];
    if (schoolIds.length > 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot combine payments from different schools'
      });
    }

    const combinedAmount = paymentsToProcess.reduce((sum, p) => sum + p.amount, 0);
    console.log('💰 Server-authoritative combined amount:', combinedAmount);

    const parentUser = await storage.getUserByEmail(userEmail);
    if (!parentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // SERVER-AUTHORITATIVE COMBINED CREDIT MATH — same helper as `/pay`,
    // applied to the combined total. The combined Stripe charge is a single
    // PI so we treat the group like one large installment for the helper.
    // *** Runs BEFORE PI reuse (code-review fix) ***
    const availableCreditsRows = await storage.getAvailableCredits(parentUser.id);
    const totalAvailableCredits = availableCreditsRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const decision = computeManualPayCredits({
      amount: combinedAmount,
      availableCredits: totalAvailableCredits,
      applyCredits,
    });
    const validatedCreditsToApply = decision.creditsToApply;
    const chargeAmount = decision.chargeAmount;
    console.log('💰 Combined credit decision:', {
      combinedAmount,
      availableCredits: totalAvailableCredits,
      applyCredits,
      validatedCreditsToApply,
      chargeAmount,
      isCreditsOnly: decision.isCreditsOnly,
    });

    if (isChargeAmountDivergent(expectedChargeAmount, chargeAmount)) {
      console.warn('⚠️ Combined charge amount diverged from client expectation', {
        scheduledPaymentIds, expectedChargeAmount,
        actualChargeAmount: chargeAmount,
        creditsApplied: validatedCreditsToApply,
        originalAmount: combinedAmount,
      });
      try {
        await emitDivergenceAlert({
          paymentId: scheduledPaymentIds.join(','),
          parentId: parentUser.id,
          parentEmail: userEmail,
          schoolId: paymentsToProcess[0]?.schoolId ?? null,
          expectedChargeAmount,
          actualChargeAmount: chargeAmount,
          creditsApplied: validatedCreditsToApply,
          originalAmount: combinedAmount,
          source: 'pay-combined',
        });
      } catch (alertErr) {
        console.error('❌ Failed to emit divergence alert (non-blocking):', alertErr);
      }
      return res.status(409).json({
        success: false,
        code: 'charge_amount_diverged',
        error:
          'The amount we are about to charge no longer matches what was shown. ' +
          'Please refresh the page and try again.',
        expectedChargeAmount,
        actualChargeAmount: chargeAmount,
        creditsApplied: validatedCreditsToApply,
        originalAmount: combinedAmount,
      });
    }

    // STALE-PI CLEANUP for credits-only transition (combined). Same overcharge
    // guard as /pay: if every installment shares a stale PI and the new
    // decision is credits-only, cancel the PI before settling with credits.
    const allProcessing = paymentsToProcess.every(p => p.status === 'processing');
    if (allProcessing && decision.isCreditsOnly) {
      const piIds = paymentsToProcess.map(p => p.stripePaymentIntentId).filter(Boolean) as string[];
      const uniquePiIds = new Set(piIds);
      if (piIds.length === paymentsToProcess.length && uniquePiIds.size === 1) {
        const stalePiId = piIds[0];
        const outcome = await cancelStalePiForCreditsOnlyTransition(
          stalePiId,
          paymentsToProcess.map(p => p.id),
        );
        if (outcome === 'not_cancelable') {
          return res.status(409).json({
            success: false,
            code: 'stale_pi_not_cancelable',
            error:
              'A previous payment attempt is still being processed. Please refresh ' +
              'the page in a moment and try again.',
          });
        }
        for (const sp of paymentsToProcess) {
          sp.status = 'pending';
          sp.stripePaymentIntentId = null;
        }
      }
    }

    // PI REUSE — only safe if every installment is processing AND they all
    // share the same PI AND that PI's amount still matches the freshly
    // computed `chargeAmount`. Otherwise the parent toggled credits between
    // attempts and we'd silently reuse a stale amount.
    if (allProcessing && !decision.isCreditsOnly) {
      const piIds = paymentsToProcess.map(p => p.stripePaymentIntentId).filter(Boolean) as string[];
      const uniquePiIds = new Set(piIds);
      if (piIds.length === paymentsToProcess.length && uniquePiIds.size === 1) {
        const existingPiId = piIds[0];
        const stripe = await getStripeClient();
        const existingIntent = await stripe.paymentIntents.retrieve(existingPiId);
        const existingAmount = existingIntent.amount || 0;
        if (!isChargeAmountDivergent(existingAmount, chargeAmount)) {
          console.log(`🔄 Combined payment reusing PI ${existingPiId} (amount matches: ${existingAmount}¢)`);
          return res.json({
            success: true,
            clientSecret: existingIntent.client_secret,
            paymentIntentId: existingIntent.id,
            chargeAmount: existingIntent.amount,
            combinedAmount,
            creditsApplied: parseInt((existingIntent.metadata?.creditsAppliedCents) || '0'),
            paymentCount: paymentsToProcess.length,
            reused: true
          });
        }
        // Stale PI — cancel via the shared helper (treats requires_action
        // as cancelable and refuses to proceed when the old PI is already
        // succeeded/processing/requires_capture, preventing two chargeable
        // PIs for the same combined group).
        console.log(
          `♻️ Cancelling stale combined PI ${existingPiId} (amount ${existingAmount}¢) ` +
          `because charge amount changed to ${chargeAmount}¢ (parent likely toggled credits).`,
        );
        const cancelOutcome = await tryCancelStalePaymentIntent(existingPiId);
        if (cancelOutcome === 'not_cancelable') {
          console.error(
            `🚨 Refusing to replace combined PI ${existingPiId}: ` +
            `existing PI is in non-cancelable status ${existingIntent.status}. ` +
            `Creating a new PI would risk double-charging the same installments.`,
          );
          return res.status(409).json({
            success: false,
            code: 'stale_pi_not_cancelable',
            error:
              'A previous payment attempt is still being processed. Please refresh ' +
              'the page in a moment and try again.',
          });
        }
        // Reset all installments back to pending so the create-PI block can run.
        for (const sp of paymentsToProcess) {
          await storage.updateScheduledPayment(sp.id, {
            status: 'pending',
            stripePaymentIntentId: null,
            metadata: {
              ...((sp.metadata as Record<string, any>) || {}),
              previousStripePaymentIntentId: existingPiId,
              stalePiCancelledAt: new Date().toISOString(),
              stalePiCancelOutcome: cancelOutcome,
            },
          });
          sp.status = 'pending';
          sp.stripePaymentIntentId = null;
        }
      } else {
        console.log(`🔄 Combined payment group processing but PI state incomplete — creating new PaymentIntent`);
      }
    }

    if (decision.tooSmall) {
      return res.status(400).json({
        success: false,
        error: `Combined amount $${(combinedAmount / 100).toFixed(2)} is below the $${(STRIPE_MIN_CHARGE_CENTS / 100).toFixed(2)} Stripe minimum.`,
      });
    }

    // CREDITS-ONLY ZERO-CHARGE PATH for the combined group.
    // Apply credits installment-by-installment (in due-date order) using the
    // same atomic helper auto-pay uses. Each installment has its own hold
    // session so a partial failure can be released without affecting the
    // others. We pre-validate that total available credits >= combined amount.
    if (decision.isCreditsOnly) {
      const sortedPayments = [...paymentsToProcess].sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
      );
      const completedIds: number[] = [];
      const heldSessions: string[] = [];
      try {
        for (const sp of sortedPayments) {
          const holdSessionId = `parent_manual_combined_${sp.id}_${Date.now()}`;
          const enrollment = sp.enrollmentId
            ? await storage.getProgramEnrollmentById(sp.enrollmentId)
            : null;
          const { totalHeld } = await storage.createCreditHolds(
            parentUser.id,
            sp.amount,
            holdSessionId,
            `Parent-manual combined credits-only hold for scheduled payment ${sp.id}`,
            5,
          );
          heldSessions.push(holdSessionId);
          if (totalHeld < sp.amount) {
            throw new Error(
              `Could not reserve enough credits for installment ${sp.id}: needed ${sp.amount}¢, reserved ${totalHeld}¢`,
            );
          }
          await storage.completeCreditsOnlyPayment({
            holdSessionId,
            scheduledPaymentId: sp.id,
            parentId: parentUser.id,
            enrollmentId: sp.enrollmentId ?? null,
            schoolId: sp.schoolId,
            creditsApplied: sp.amount,
            originalAmount: sp.amount,
            installmentNumber: sp.installmentNumber || 1,
            totalInstallments: sp.totalInstallments || 1,
            parentEmail: userEmail,
            childName: enrollment?.childName ?? null,
            className: enrollment?.className ?? null,
            chargedBy: 'parent_manual',
            completionSource: 'parent_manual_credits_only',
            description:
              `Parent-manual combined installment ${sp.installmentNumber || 1}` +
              `/${sp.totalInstallments || 1} — fully covered by credits`,
          });
          // Pop the just-finalized session so the catch block doesn't try to
          // release holds that have already been finalized inside the tx.
          heldSessions.pop();
          completedIds.push(sp.id);
        }
        console.log(
          `✅ Combined credits-only manual payment completed for ${completedIds.length} installments ` +
          `(credits: ${validatedCreditsToApply}¢)`,
        );
        return res.json({
          success: true,
          creditsOnly: true,
          alreadyConfirmed: true,
          chargeAmount: 0,
          combinedAmount,
          creditsApplied: validatedCreditsToApply,
          paymentCount: completedIds.length,
        });
      } catch (creditsErr: any) {
        // Best-effort release of any held-but-not-finalized sessions. Already
        // finalized installments cannot be rolled back here — the payment
        // rows exist and the credits have been used. Surface the error so the
        // operator can reconcile manually.
        for (const sessionId of heldSessions) {
          try {
            await storage.releaseCreditHolds(sessionId);
          } catch (releaseErr) {
            console.error('❌ Failed to release combined credit holds:', releaseErr);
          }
        }
        console.error('❌ Combined credits-only payment failed:', creditsErr, {
          completedIds,
          remainingIds: sortedPayments
            .map(sp => sp.id)
            .filter(id => !completedIds.includes(id)),
        });
        return res.status(500).json({
          success: false,
          error: creditsErr?.message || 'Failed to apply credits to combined payment',
          partiallyCompletedScheduledPaymentIds: completedIds,
        });
      }
    }

    for (const payment of paymentsToProcess) {
      await storage.updateScheduledPayment(payment.id, {
        status: 'processing',
        metadata: {
          ...((payment.metadata as Record<string, any>) || {}),
          combinedPaymentGroup: scheduledPaymentIds.join(','),
          paymentIntentCreatedAt: new Date().toISOString()
        }
      });
    }
    console.log(`🔒 Marked ${paymentsToProcess.length} payments as processing`);

    const firstEnrollment = paymentsToProcess[0].enrollmentId
      ? await storage.getProgramEnrollmentById(paymentsToProcess[0].enrollmentId)
      : null;

    let stripeCustomerId = firstEnrollment?.stripeCustomerId || parentUser?.stripeCustomerId || null;

    const enrollmentIds = paymentsToProcess
      .map(p => p.enrollmentId)
      .filter((id): id is number => id != null);

    const perPaymentAmounts: Record<string, number> = {};
    for (const p of paymentsToProcess) {
      perPaymentAmounts[p.id.toString()] = p.amount;
    }

    const stripe = await getStripeClient();

    // SAVED-CARD FLOW: validate payment method belongs to this customer
    let useSavedCard = false;
    if (paymentMethodId) {
      if (!stripeCustomerId) {
        const newCustomer = await stripe.customers.create({
          email: userEmail,
          name: parentUser.name || undefined,
          metadata: { userId: String(parentUser.id) },
        });
        stripeCustomerId = newCustomer.id;
        await storage.updateUser(parentUser.id, { stripeCustomerId: stripeCustomerId });
      }

      try {
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== stripeCustomerId) {
          throw new Error('Payment method does not belong to this account');
        }
        useSavedCard = true;
      } catch (pmErr: any) {
        // Roll back the processing flags before returning an error
        for (const payment of paymentsToProcess) {
          await storage.updateScheduledPayment(payment.id, {
            status: 'pending',
            metadata: {
              ...((payment.metadata as Record<string, any>) || {}),
              combinedPaymentGroup: undefined,
              lastErrorAt: new Date().toISOString(),
              errorReason: pmErr.message || 'Invalid saved card',
            },
          });
        }
        return res.status(400).json({
          success: false,
          error: pmErr.message || 'Invalid saved card. Please pick another payment method.',
        });
      }
    }

    const paymentIntentParams: any = {
      amount: Math.round(chargeAmount),
      currency: 'usd',
      metadata: {
        type: 'scheduled_payment',
        paymentType: 'combined_scheduled_payment',
        scheduledPaymentIds: scheduledPaymentIds.join(','),
        parentEmail: userEmail,
        description: `Combined payment for ${paymentsToProcess.length} installments`,
        enrollmentIds: JSON.stringify(enrollmentIds),
        schoolId: schoolIds[0].toString(),
        createdBy: 'asa_payment_system',
        version: 'v2_combined_scheduled_payment',
        originalAmountCents: combinedAmount.toString(),
        creditsAppliedCents: validatedCreditsToApply.toString(),
        userId: parentUser.id.toString(),
        perPaymentAmounts: JSON.stringify(perPaymentAmounts),
        savedCardOneClick: useSavedCard ? 'true' : 'false',
      },
    };

    if (useSavedCard) {
      paymentIntentParams.customer = stripeCustomerId;
      paymentIntentParams.payment_method = paymentMethodId;
      paymentIntentParams.confirm = true;
      paymentIntentParams.off_session = true;
    } else {
      paymentIntentParams.automatic_payment_methods = { enabled: true };
      if (stripeCustomerId) {
        paymentIntentParams.customer = stripeCustomerId;
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);
    console.log('✅ Created combined payment intent:', paymentIntent.id, 'for', paymentsToProcess.length, 'payments, chargeAmount:', chargeAmount, 'status:', paymentIntent.status);

    // Immediately store the PI ID on every payment in the group to prevent double-charge on concurrent retries
    await Promise.all(paymentsToProcess.map(p =>
      storage.updateScheduledPayment(p.id, { stripePaymentIntentId: paymentIntent.id })
    ));

    if (useSavedCard && paymentIntent.status === 'succeeded') {
      return res.json({
        success: true,
        alreadyConfirmed: true,
        paymentIntentId: paymentIntent.id,
        chargeAmount,
        combinedAmount,
        creditsApplied: validatedCreditsToApply,
        paymentCount: paymentsToProcess.length,
      });
    }

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      chargeAmount,
      combinedAmount,
      creditsApplied: validatedCreditsToApply,
      paymentCount: paymentsToProcess.length
    });

  } catch (error: any) {
    console.error('❌ Error processing combined payment:', error);

    const isCardDecline =
      error?.type === 'StripeCardError' ||
      error?.code === 'card_declined' ||
      error?.code === 'authentication_required';

    try {
      const { scheduledPaymentIds } = req.body;
      if (scheduledPaymentIds && Array.isArray(scheduledPaymentIds)) {
        const allPayments = await storage.getScheduledPaymentsByParentEmail(req.user.email);
        for (const id of scheduledPaymentIds) {
          const payment = allPayments.find(p => p.id === parseInt(id));
          if (payment && payment.status === 'processing') {
            await storage.updateScheduledPayment(parseInt(id), {
              status: 'pending',
              metadata: {
                ...((payment.metadata as Record<string, any>) || {}),
                combinedPaymentGroup: undefined,
                lastErrorAt: new Date().toISOString(),
                errorReason: error instanceof Error ? error.message : 'Unknown error'
              }
            });
          }
        }
        console.log(`✅ Reset ${scheduledPaymentIds.length} scheduled payments to pending after failure`);
      }
    } catch (rollbackError) {
      console.error('❌ Failed to rollback combined payment statuses:', rollbackError);
    }

    if (isCardDecline) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Saved card was declined. Please try a different payment method.',
        cardDeclined: true,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process combined payment'
    });
  }
});

// Confirm a combined scheduled payment after successful Stripe payment
router.post('/confirm-combined', supabaseAuth, async (req: any, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userEmail = req.user.email;

    console.log('🔐 Confirming combined scheduled payment:', { paymentIntentId: paymentIntentId?.substring(0, 20) + '...', userEmail });

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: 'PaymentIntent ID is required' });
    }

    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: `Payment not yet successful. Status: ${paymentIntent.status}`
      });
    }

    if (paymentIntent.metadata?.parentEmail !== userEmail) {
      return res.status(403).json({ success: false, error: 'Payment does not belong to this user' });
    }

    const metadataScheduledPaymentIds = paymentIntent.metadata?.scheduledPaymentIds;
    if (!metadataScheduledPaymentIds) {
      return res.status(400).json({
        success: false,
        error: 'PaymentIntent does not contain combined payment metadata'
      });
    }

    const scheduledPaymentIds = metadataScheduledPaymentIds.split(',').map((id: string) => parseInt(id.trim()));
    const creditsApplied = parseInt(paymentIntent.metadata?.creditsAppliedCents || '0');
    const originalAmountCents = parseInt(paymentIntent.metadata?.originalAmountCents || '0') || paymentIntent.amount;
    const totalPaymentReceived = creditsApplied > 0 ? originalAmountCents : paymentIntent.amount;
    const perPaymentAmounts: Record<string, number> = {};

    try {
      const parsed = JSON.parse(paymentIntent.metadata?.perPaymentAmounts || '{}');
      Object.assign(perPaymentAmounts, parsed);
    } catch {
      console.warn('⚠️ Could not parse perPaymentAmounts metadata');
    }

    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const completedIds: number[] = [];
    const skippedIds: number[] = [];

    const parentUser = await storage.getUserByEmail(userEmail);

    let paymentHistory = await storage.getStripePaymentByIntentId(paymentIntent.id);
    if (!paymentHistory) {
      try {
        const userId = parseInt(paymentIntent.metadata?.userId || '0');
        paymentHistory = await (storage as any).saveStripePayment({
          userId: userId > 0 ? userId : null,
          paymentIntentId: paymentIntent.id,
          customerId: (paymentIntent.customer as string) || `cus_combined_${Date.now()}`,
          subscriptionId: null,
          amount: totalPaymentReceived,
          currency: paymentIntent.currency || 'usd',
          status: 'succeeded',
          description: `Combined payment for ${scheduledPaymentIds.length} installments`,
          receiptEmail: paymentIntent.receipt_email || null,
          metadata: {
            ...paymentIntent.metadata,
            processedVia: 'combined_payment_confirm'
          }
        });
        console.log(`✅ Created payment history record: ${paymentHistory?.id}`);
      } catch (historyError) {
        console.error('⚠️ Failed to create payment history:', historyError);
      }
    }

    for (const paymentId of scheduledPaymentIds) {
      const scheduledPayment = allScheduledPayments.find(p => p.id === paymentId);

      if (!scheduledPayment) {
        console.warn(`⚠️ Scheduled payment ${paymentId} not found - skipping`);
        continue;
      }

      if (scheduledPayment.status === 'completed' || scheduledPayment.status === 'paid') {
        console.log(`✅ Payment ${paymentId} already completed - skipping (idempotent)`);
        skippedIds.push(paymentId);
        continue;
      }

      await storage.updateScheduledPayment(paymentId, {
        status: 'completed',
        processedAt: new Date(),
      });
      console.log(`✅ Marked scheduled payment ${paymentId} as completed`);

      const paymentAmount = perPaymentAmounts[paymentId.toString()] || scheduledPayment.amount;

      const hasMembership = paymentIntent.metadata?.hasMembership === 'true';
      const membershipAmount = hasMembership
        ? parseInt(paymentIntent.metadata?.membershipAmount || '0')
        : 0;

      let perPaymentMembershipAmount = 0;
      let perPaymentEnrollmentAmount = paymentAmount;
      if (hasMembership && scheduledPayment.installmentNumber === 1 && membershipAmount > 0) {
        perPaymentMembershipAmount = Math.min(membershipAmount, paymentAmount);
        perPaymentEnrollmentAmount = Math.max(0, paymentAmount - perPaymentMembershipAmount);
      }

      try {
        let childName = 'Child';
        let className = 'Class';
        if (scheduledPayment.enrollmentId) {
          const enrollmentForPayment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
          if (enrollmentForPayment) {
            childName = enrollmentForPayment.childName || 'Child';
            className = enrollmentForPayment.className || 'Class';
          }
        }

        if (parentUser) {
          await storage.createPayment({
            schoolId: scheduledPayment.schoolId,
            parentId: parentUser.id,
            parentEmail: userEmail,
            childName,
            className,
            amount: paymentAmount,
            paymentDate: new Date(),
            status: 'completed',
            paymentMethod: 'stripe',
            description: `Combined payment - installment ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`,
            enrollmentIds: scheduledPayment.enrollmentId ? [scheduledPayment.enrollmentId] : [],
            stripePaymentIntentId: paymentIntent.id,
            metadata: {
              scheduledPaymentId: paymentId,
              paymentType: 'combined_biweekly',
              combinedPaymentIds: scheduledPaymentIds
            },
            stripeChargeId: null,
            stripeRefundId: null,
            originalPaymentId: null,
          });
        }
      } catch (paymentRecordError) {
        console.error('⚠️ Failed to create payment record for scheduled payment', paymentId, ':', paymentRecordError);
      }

      if (scheduledPayment.enrollmentId) {
        try {
          const enrollment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
          if (enrollment) {
            const currentAmountPaid = enrollment.totalPaid || 0;
            const newAmountPaid = currentAmountPaid + perPaymentEnrollmentAmount;
            const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);

            await storage.updateProgramEnrollment(scheduledPayment.enrollmentId, {
              totalPaid: newAmountPaid,
              remainingBalance: newBalance,
              paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment'
            });
            console.log(`✅ Updated enrollment ${scheduledPayment.enrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);

            if (perPaymentEnrollmentAmount > 0 && paymentHistory) {
              try {
                await storage.createPaymentAllocation({
                  paymentHistoryId: paymentHistory.id,
                  enrollmentId: scheduledPayment.enrollmentId,
                  membershipEnrollmentId: null,
                  allocatedAmountCents: perPaymentEnrollmentAmount,
                  allocationType: 'payment',
                  sourceAllocationId: null,
                  adminComment: null,
                  metadata: {
                    scheduledPaymentId: paymentId,
                    installmentNumber: scheduledPayment.installmentNumber,
                    totalInstallments: scheduledPayment.totalInstallments,
                    totalPaymentReceived: paymentAmount,
                    membershipDeducted: perPaymentMembershipAmount,
                    processedVia: 'combined_payment_confirm'
                  }
                });
              } catch (allocationError) {
                console.error('⚠️ Failed to create enrollment allocation:', allocationError);
              }
            }
          }
        } catch (enrollmentError) {
          console.error(`⚠️ Error updating enrollment for payment ${paymentId}:`, enrollmentError);
        }
      }

      if (perPaymentMembershipAmount > 0) {
        try {
          const membershipParentUserId = parseInt(paymentIntent.metadata?.membershipParentUserId || '0');
          const membershipSchoolId = parseInt(paymentIntent.metadata?.membershipSchoolId || '0');
          const membershipYear = parseInt(paymentIntent.metadata?.membershipYear || new Date().getFullYear().toString());

          if (membershipParentUserId > 0 && membershipSchoolId > 0) {
            const existingMemberships = await storage.getMembershipEnrollmentsByParentId(membershipParentUserId);
            const membershipEnrollment = existingMemberships.find((m: any) =>
              m.schoolId === membershipSchoolId &&
              (m.membershipYear === membershipYear || m.membershipYear === membershipYear + 1)
            );

            if (membershipEnrollment) {
              const currentPaid = membershipEnrollment.amountPaid || 0;
              const newPaid = currentPaid + perPaymentMembershipAmount;
              const newBalance = Math.max(0, (membershipEnrollment.amount || 0) - newPaid);

              await storage.updateMembershipEnrollment(membershipEnrollment.id, {
                amountPaid: newPaid,
                remainingBalance: newBalance,
                balanceDue: newBalance,
                status: newBalance <= 0 ? 'enrolled' : membershipEnrollment.status
              });

              if (paymentHistory) {
                try {
                  await storage.createPaymentAllocation({
                    paymentHistoryId: paymentHistory.id,
                    enrollmentId: null,
                    membershipEnrollmentId: membershipEnrollment.id,
                    allocatedAmountCents: perPaymentMembershipAmount,
                    allocationType: 'membership',
                    sourceAllocationId: null,
                    adminComment: null,
                    metadata: {
                      scheduledPaymentId: paymentId,
                      membershipYear,
                      schoolId: membershipSchoolId,
                      totalPaymentReceived: paymentAmount,
                      enrollmentAllocated: perPaymentEnrollmentAmount,
                      processedVia: 'combined_payment_confirm'
                    }
                  });
                } catch (allocationError) {
                  console.error('⚠️ Failed to create membership allocation:', allocationError);
                }
              }
            }
          }
        } catch (membershipError) {
          console.error('❌ Error processing membership allocation for combined payment:', membershipError);
        }
      }

      completedIds.push(paymentId);
    }

    const userId = parseInt(paymentIntent.metadata?.userId || '0');
    if (creditsApplied > 0 && userId > 0) {
      try {
        console.log(`💰 Consuming ${creditsApplied} cents of credits for combined payment`);
        const { usedCredits, totalUsed } = await storage.useCredits(
          userId,
          creditsApplied,
          undefined,
          `Combined payment for ${scheduledPaymentIds.length} installments`
        );
        console.log(`💰 ✅ Consumed ${totalUsed} cents across ${usedCredits.length} credit records`);
      } catch (creditError) {
        console.error('❌ Failed to consume credits for combined payment:', creditError);
      }
    }

    console.log(`✅ Combined payment confirmation complete: ${completedIds.length} completed, ${skippedIds.length} skipped`);

    res.json({
      success: true,
      message: `Combined payment confirmed: ${completedIds.length} payments completed`,
      completedPayments: completedIds,
      skippedPayments: skippedIds,
      totalAmount: paymentIntent.amount
    });

  } catch (error) {
    console.error('❌ Error confirming combined scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm combined payment'
    });
  }
});

// Mark a scheduled payment as paid (for when someone pays early)
router.patch('/:id/paid', supabaseAuth, async (req: any, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const userEmail = req.user.email;
    
    console.log('✅ Marking payment as paid:', { paymentId, userEmail });
    
    // Update the scheduled payment status
    const updatedPayment = await storage.updateScheduledPaymentStatus(paymentId, 'paid');
    
    if (!updatedPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }
    
    res.json({
      success: true,
      payment: updatedPayment
    });
  } catch (error) {
    console.error('Error updating scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update scheduled payment'
    });
  }
});

export default router;