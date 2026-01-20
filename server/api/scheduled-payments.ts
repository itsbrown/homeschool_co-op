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
    
    // Filter for pending and processing payments (processing may be from abandoned checkout)
    const pendingPayments = allScheduledPayments.filter(
      p => p.status === 'pending' || p.status === 'processing'
    );
    
    console.log(`📊 Found ${pendingPayments.length} pending/processing scheduled payments for ${userEmail}`);

    // Get enrollment details for enrichment
    const enrichedPayments = await Promise.all(pendingPayments.map(async (payment) => {
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
      ? await storage.getEnrollmentById(scheduledPayment.enrollmentId)
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
      const enrollment = await storage.getEnrollmentById(scheduledPayment.enrollmentId);
      if (enrollment) {
        const newTotalPaid = (enrollment.totalPaid || 0) + paymentAmount;
        const classData = enrollment.programId ? await storage.getClassById(enrollment.programId) : null;
        const totalCost = classData?.price || 0;
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
      const enrollment = await storage.getEnrollmentById(scheduledPayment.enrollmentId);
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
      enrollmentId: scheduledPayment.enrollmentId || undefined,
      stripePaymentIntentId: `credit_${Date.now()}_${scheduledPayment.id}`,
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