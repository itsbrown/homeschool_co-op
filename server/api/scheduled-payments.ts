import { Router } from 'express';
import type Stripe from 'stripe';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getStripeClient } from '../config/stripe';
import {
  buildScheduledPaymentIntentMetadata,
  resolveEnrollmentIdsFromScheduledRow,
} from '../lib/scheduled-payment-intent-metadata';
import {
  computeManualPayCredits,
  isChargeAmountDivergent,
} from '../utils/manualPayCredits';
import {
  buildCheckoutFirstInstallmentDueRows,
  filterScheduledPaymentsUntilFirstPaid,
} from '../lib/checkout-upcoming-payments';
import { formatEnrollmentCoverageLabel } from '../lib/enrollment-coverage-label';
import { resolveEnrollmentIdsFromScheduledRow } from '../lib/scheduled-payment-intent-metadata';

const router = Router();

// Get upcoming scheduled payments from local database
// This endpoint fetches scheduled payments created by the StripePaymentPlanService
router.get('/upcoming', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📅 Fetching upcoming scheduled payments for:', userEmail);

    // Get scheduled payments from local database
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);

    const filtered = allScheduledPayments.filter((p) => {
      const s = String(p.status);
      return s === 'pending' || s === 'failed' || s === 'overdue';
    });

    const afterFirstPaid = await filterScheduledPaymentsUntilFirstPaid(filtered);
    const checkoutDueRows = await buildCheckoutFirstInstallmentDueRows(userEmail);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    console.log(
      `📊 Upcoming for ${userEmail}: ${checkoutDueRows.length} checkout-due, ${afterFirstPaid.length} scheduled (filtered from ${filtered.length} pending rows)`,
    );

    const mapScheduledRow = async (payment: (typeof afterFirstPaid)[0]) => {
      const enrollmentIds = resolveEnrollmentIdsFromScheduledRow({
        enrollmentId: payment.enrollmentId,
        metadata: payment.metadata,
      });
      const enrollmentCount = enrollmentIds.length;

      let enrollmentDetails = null;
      if (payment.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          enrollmentDetails = {
            className: enrollment.className,
            childName: enrollment.childName
          };
        }
      }
      
      const metadata = payment.metadata as any || {};
      const due = new Date(payment.scheduledDate);
      due.setHours(0, 0, 0, 0);
      const rawStatus = String(payment.status);
      const overdue =
        rawStatus === 'overdue' ||
        (rawStatus === 'pending' && due.getTime() < startOfToday.getTime());

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
        enrollmentCount,
        enrollmentCoverageLabel: formatEnrollmentCoverageLabel(enrollmentCount),
        className: enrollmentDetails?.className || 'Class',
        childName: enrollmentDetails?.childName || '',
        retryCount: payment.retryCount ?? 0,
        failureReason: payment.failureReason ?? null,
        overdue,
      };
    };

    const enrichedScheduled = await Promise.all(afterFirstPaid.map(mapScheduledRow));
    const enrichedPayments = [
      ...checkoutDueRows,
      ...enrichedScheduled,
    ].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

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

// Process a scheduled payment
router.post('/pay', supabaseAuth, async (req: any, res) => {
  let holdSessionIdForRelease: string | null = null;
  let claimAcquired = false;
  let numericPaymentId = -1;
  let parentUserId = 0;
  try {
    const { paymentId, description, applyCredits: applyCreditsRaw, expectedChargeAmount } = req.body;
    const userEmail = req.user.email;
    const userId = typeof req.user?.id === 'number' ? req.user.id : null;

    console.log('💳 Processing scheduled payment:', { paymentId, description, userEmail });

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
    }

    numericPaymentId = parseInt(String(paymentId), 10);
    if (!Number.isFinite(numericPaymentId) || numericPaymentId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment ID',
      });
    }

    if (userId == null || Number.isNaN(userId)) {
      return res.status(401).json({
        success: false,
        error: 'User id missing from session'
      });
    }

    parentUserId = userId;
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const scheduledPayment = allScheduledPayments.find(p => p.id === numericPaymentId);
    if (!scheduledPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }

    if (scheduledPayment.parentEmail !== userEmail || scheduledPayment.parentId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }

    const amountCents = Math.round(scheduledPayment.amount);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Scheduled payment has invalid amount'
      });
    }

    const availableRows = await storage.getAvailableCredits(userId);
    const availableCredits = availableRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const applyCredits = applyCreditsRaw !== false;

    const decision = computeManualPayCredits({
      amount: amountCents,
      availableCredits,
      applyCredits,
    });

    if (
      isChargeAmountDivergent(expectedChargeAmount, decision.chargeAmount) &&
      typeof expectedChargeAmount === 'number'
    ) {
      return res.status(409).json({
        success: false,
        error: 'Charge amount mismatch — pricing was refreshed.',
        authoritative: {
          chargeAmountCents: decision.chargeAmount,
          creditsToApplyCents: decision.creditsToApply,
          originalAmountCents: decision.originalAmount,
          availableCreditsCents: decision.availableCredits,
        },
      });
    }

    if (decision.tooSmall && !decision.isCreditsOnly) {
      return res.status(400).json({
        success: false,
        error:
          'This installment is below the card minimum. Add credits or wait until the balance can be charged.',
        decision,
      });
    }

    const enrollmentIds = resolveEnrollmentIdsFromScheduledRow({
      enrollmentId: scheduledPayment.enrollmentId,
      metadata: scheduledPayment.metadata,
    });

    const claimedRow = await storage.claimScheduledPaymentForParentCharge(numericPaymentId, parentUserId);
    if (!claimedRow) {
      return res.status(409).json({
        success: false,
        error: 'INSTALLMENT_NOT_AVAILABLE',
        message:
          'This installment cannot be started right now. It may already be processing, completed, or in use. Refresh Upcoming Payments and try again.',
      });
    }
    claimAcquired = true;

    if (decision.isCreditsOnly) {
      holdSessionIdForRelease = `parent_manual_sp_${scheduledPayment.id}_${Date.now()}`;
      const { totalHeld } = await storage.createCreditHolds(
        userId,
        decision.creditsToApply,
        holdSessionIdForRelease,
        `Parent Pay Now — scheduled payment ${scheduledPayment.id} (credits-only)`,
        60,
      );
      if (totalHeld < decision.creditsToApply) {
        await storage.releaseCreditHolds(holdSessionIdForRelease).catch(() => {});
        holdSessionIdForRelease = null;
        await storage.releaseScheduledPaymentParentClaim(numericPaymentId, parentUserId).catch(() => {});
        claimAcquired = false;
        return res.status(400).json({
          success: false,
          error: 'Could not reserve enough credits for this payment. Try again or pay by card only.',
        });
      }

      const enrollment = scheduledPayment.enrollmentId
        ? await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId)
        : null;

      try {
        await storage.completeCreditsOnlyPayment({
          holdSessionId: holdSessionIdForRelease,
          scheduledPaymentId: scheduledPayment.id,
          parentId: userId,
          enrollmentId: scheduledPayment.enrollmentId ?? null,
          schoolId: scheduledPayment.schoolId,
          creditsApplied: decision.creditsToApply,
          originalAmount: decision.originalAmount,
          installmentNumber: scheduledPayment.installmentNumber || 1,
          totalInstallments: scheduledPayment.totalInstallments || 1,
          parentEmail: userEmail,
          childName: enrollment?.childName ?? null,
          className: enrollment?.className ?? null,
          chargedBy: 'parent_manual',
          completionSource: 'parent_manual_credits_only',
          description:
            description ||
            `Installment ${scheduledPayment.installmentNumber || 1}/${scheduledPayment.totalInstallments || 1} — fully covered by credits`,
        });
      } catch (completeErr) {
        await storage.releaseCreditHolds(holdSessionIdForRelease).catch(() => {});
        holdSessionIdForRelease = null;
        await storage.releaseScheduledPaymentParentClaim(numericPaymentId, parentUserId).catch(() => {});
        claimAcquired = false;
        throw completeErr;
      }

      holdSessionIdForRelease = null;
      claimAcquired = false;
      console.log('✅ Scheduled payment settled with credits only:', scheduledPayment.id);
      return res.json({
        success: true,
        mode: 'credits_only' as const,
        scheduledPaymentId: scheduledPayment.id,
      });
    }

    let stripeCreditHoldSessionId: string | null = null;
    if (decision.creditsToApply > 0) {
      stripeCreditHoldSessionId = `parent_manual_sp_${scheduledPayment.id}_${Date.now()}`;
      const { totalHeld } = await storage.createCreditHolds(
        userId,
        decision.creditsToApply,
        stripeCreditHoldSessionId,
        `Parent Pay Now — scheduled payment ${scheduledPayment.id} (card + credits)`,
        60,
      );
      if (totalHeld < decision.creditsToApply) {
        await storage.releaseCreditHolds(stripeCreditHoldSessionId).catch(() => {});
        stripeCreditHoldSessionId = null;
        await storage.releaseScheduledPaymentParentClaim(numericPaymentId, parentUserId).catch(() => {});
        claimAcquired = false;
        return res.status(400).json({
          success: false,
          error: 'Could not reserve enough credits for this payment. Try again or pay by card only.',
        });
      }
    }

    const stripe = await getStripeClient();
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: decision.chargeAmount,
        currency: 'usd',
        metadata: buildScheduledPaymentIntentMetadata({
          scheduledPaymentId: numericPaymentId,
          parentEmail: userEmail,
          parentUserId: parentUserId,
          installmentNumber: scheduledPayment.installmentNumber,
          totalInstallments: scheduledPayment.totalInstallments,
          enrollmentIds,
          autoPayInitiated: false,
          creditsAppliedCents: decision.creditsToApply > 0 ? decision.creditsToApply : undefined,
          originalAmountCents: decision.creditsToApply > 0 ? decision.originalAmount : undefined,
          chargeAmountCents: decision.chargeAmount,
          creditHoldSessionId: stripeCreditHoldSessionId ?? undefined,
          description: description || `Scheduled Payment ${scheduledPayment.installmentNumber}`,
        }),
        automatic_payment_methods: {
          enabled: true,
        },
      });
    } catch (stripeErr) {
      if (stripeCreditHoldSessionId) {
        await storage.releaseCreditHolds(stripeCreditHoldSessionId).catch(() => {});
      }
      await storage.releaseScheduledPaymentParentClaim(numericPaymentId, parentUserId).catch(() => {});
      claimAcquired = false;
      throw stripeErr;
    }

    await storage.updateScheduledPayment(numericPaymentId, {
      stripePaymentIntentId: paymentIntent.id,
    });

    claimAcquired = false;
    console.log('✅ Created payment intent for scheduled payment:', paymentIntent.id);

    res.json({
      success: true,
      mode: 'stripe' as const,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    if (holdSessionIdForRelease) {
      await storage.releaseCreditHolds(holdSessionIdForRelease).catch(() => {});
    }
    if (claimAcquired && numericPaymentId > 0 && parentUserId > 0) {
      await storage.releaseScheduledPaymentParentClaim(numericPaymentId, parentUserId).catch(() => {});
    }
    console.error('❌ Error processing scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process scheduled payment'
    });
  }
});

// Mark a scheduled payment as paid (for when someone pays early)
router.patch('/:id/paid', supabaseAuth, async (req: any, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const userEmail = req.user.email;
    
    console.log('✅ Marking payment as paid:', { paymentId, userEmail });
    
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const payment = allScheduledPayments.find((p) => p.id === paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }
    if (payment.parentEmail !== userEmail) {
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }
    const st = String(payment.status);
    if (st !== 'pending' && st !== 'overdue') {
      return res.status(400).json({
        success: false,
        error: `Payment is already ${payment.status}`
      });
    }
    
    // Update the scheduled payment status
    const updatedPayment = await storage.updateScheduledPaymentStatus(paymentId, 'paid');
    
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