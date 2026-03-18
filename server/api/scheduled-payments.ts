import { Router } from 'express';
import { storage } from '../storage';
import Stripe from 'stripe';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getStripeClient } from '../config/stripe';

const router = Router();

// Get upcoming scheduled payments from local database
// This endpoint fetches scheduled payments created by the StripePaymentPlanService
router.get('/upcoming', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📅 Fetching upcoming scheduled payments for:', userEmail);

    // Get scheduled payments from local database
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    
    // Filter for pending, overdue, and processing payments (processing may be from abandoned checkout)
    const pendingPayments = allScheduledPayments.filter(
      p => p.status === 'pending' || p.status === 'overdue' || p.status === 'processing'
    );
    
    console.log(`📊 Found ${pendingPayments.length} pending/processing scheduled payments for ${userEmail}`);
    console.log(`📋 Payment IDs returned: [${pendingPayments.map(p => `${p.id}(e:${p.enrollmentId})`).join(', ')}]`);

    // Get enrollment details for enrichment; auto-heal stale records
    const enrichedPaymentsRaw = await Promise.all(pendingPayments.map(async (payment) => {
      let enrollmentDetails = null;
      let effectiveBalance = null;
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          enrollmentDetails = {
            className: enrollment.className,
            childName: enrollment.childName
          };
          // Compute effective_balance the same way the DB generated column does:
          // total_cost - total_paid - COALESCE(comp_amount_cents, 0)
          const totalPaid = enrollment.totalPaid ?? 0;
          const totalCost = enrollment.totalCost ?? 0;
          const compAmount = enrollment.compAmountCents ?? 0;
          effectiveBalance = Math.max(0, totalCost - totalPaid - compAmount);
        }
      }

      // AUTO-HEAL: if the enrollment is fully paid, cancel stale pending/overdue record
      if (effectiveBalance !== null && effectiveBalance <= 0) {
        if (payment.status === 'pending' || payment.status === 'overdue') {
          storage.updateScheduledPaymentStatus(payment.id, 'cancelled').catch(() => {});
          console.log(`🔄 Auto-cancelled stale scheduled payment ${payment.id} — enrollment ${payment.enrollmentId} effective_balance is ${effectiveBalance}`);
        }
        return null; // Exclude from results
      }
      
      const metadata = payment.metadata as any || {};
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
        childName: enrollmentDetails?.childName || ''
      };
    }));

    const enrichedPayments = enrichedPaymentsRaw.filter((p): p is NonNullable<typeof p> => p !== null);

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

// Process a scheduled payment
router.post('/pay', supabaseAuth, async (req: any, res) => {
  try {
    const { paymentId, creditsToApply = 0 } = req.body;
    const userEmail = req.user.email;

    console.log('💳 Processing scheduled payment:', { paymentId, userEmail, creditsToApply });

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
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
    
    // Log if retrying a processing payment (user likely abandoned previous checkout)
    if (scheduledPayment.status === 'processing') {
      console.log(`🔄 Retrying payment ${paymentId} that was previously in processing state`);
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

    // SERVER-SIDE CREDIT VALIDATION
    let validatedCreditsToApply = 0;
    if (creditsToApply > 0) {
      const availableCredits = await storage.getAvailableCredits(parentUser.id);
      const totalAvailable = availableCredits.reduce((sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0);
      
      // Validate credits: can't apply more than available or more than payment amount
      validatedCreditsToApply = Math.min(creditsToApply, totalAvailable, authoritativeAmount);
      console.log('💰 Credit validation:', { requested: creditsToApply, available: totalAvailable, validated: validatedCreditsToApply });
    }

    // Calculate final charge amount after credits (using authoritative amount)
    const chargeAmount = Math.max(0, authoritativeAmount - validatedCreditsToApply);
    
    // If credits fully cover the payment, don't create a Stripe intent
    if (chargeAmount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment fully covered by credits. Use pay-with-credits endpoint instead.'
      });
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
        userId: parentUser.id.toString()
      },
      automatic_payment_methods: {
        enabled: true
      }
    };
    
    // CRITICAL: Reuse existing Stripe customer instead of creating guest
    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
      console.log('👤 Using existing Stripe customer:', stripeCustomerId);
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log('✅ Created payment intent for scheduled payment:', paymentIntent.id, 'with enrollmentIds:', enrollmentIds, 'chargeAmount:', chargeAmount);

    // Stamp charged_by for audit trail
    await storage.updateScheduledPayment(parseInt(paymentId), { chargedBy: 'parent_manual' });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      chargeAmount,
      creditsApplied: validatedCreditsToApply
    });

  } catch (error) {
    console.error('❌ Error processing scheduled payment:', error);
    
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
    // Include overdue so stale overdue records can be auto-healed alongside pending ones
    const pendingPayments = allScheduledPayments.filter(
      p => p.status === 'pending' || p.status === 'overdue' || p.status === 'processing'
    );

    if (pendingPayments.length === 0) {
      return res.json({ success: true, groups: [] });
    }

    const enrichedPaymentsRaw = await Promise.all(pendingPayments.map(async (payment) => {
      let enrollmentDetails = null;
      let effectiveBalance = null;
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          enrollmentDetails = {
            className: enrollment.className,
            childName: enrollment.childName
          };
          const totalPaid = enrollment.totalPaid ?? 0;
          const totalCost = enrollment.totalCost ?? 0;
          const compAmount = enrollment.compAmountCents ?? 0;
          effectiveBalance = Math.max(0, totalCost - totalPaid - compAmount);
        }
      }

      // AUTO-HEAL: cancel stale pending/overdue records where enrollment is fully paid
      if (effectiveBalance !== null && effectiveBalance <= 0) {
        if (payment.status === 'pending' || payment.status === 'overdue') {
          storage.updateScheduledPaymentStatus(payment.id, 'cancelled').catch(() => {});
          console.log(`🔄 [grouped] Auto-cancelled stale scheduled payment ${payment.id} — effective_balance is ${effectiveBalance}`);
        }
        return null; // Exclude from grouped results
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

    const enrichedPayments = enrichedPaymentsRaw.filter((p): p is NonNullable<typeof p> => p !== null);

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
router.post('/pay-combined', supabaseAuth, async (req: any, res) => {
  try {
    const { scheduledPaymentIds, creditsToApply = 0 } = req.body;
    const userEmail = req.user.email;

    console.log('💳 Processing combined payment:', { scheduledPaymentIds, userEmail, creditsToApply });

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

    let validatedCreditsToApply = 0;
    if (creditsToApply > 0) {
      const availableCredits = await storage.getAvailableCredits(parentUser.id);
      const totalAvailable = availableCredits.reduce((sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0);
      validatedCreditsToApply = Math.min(creditsToApply, totalAvailable, combinedAmount);
      console.log('💰 Credit validation:', { requested: creditsToApply, available: totalAvailable, validated: validatedCreditsToApply });
    }

    const chargeAmount = Math.max(0, combinedAmount - validatedCreditsToApply);

    if (chargeAmount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment fully covered by credits. Use pay-with-credits endpoint instead.'
      });
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
      },
      automatic_payment_methods: { enabled: true }
    };

    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);
    console.log('✅ Created combined payment intent:', paymentIntent.id, 'for', paymentsToProcess.length, 'payments, chargeAmount:', chargeAmount);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      chargeAmount,
      combinedAmount,
      creditsApplied: validatedCreditsToApply,
      paymentCount: paymentsToProcess.length
    });

  } catch (error) {
    console.error('❌ Error processing combined payment:', error);

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