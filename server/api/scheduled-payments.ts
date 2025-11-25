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
    
    // Filter for pending payments only (future installments)
    const pendingPayments = allScheduledPayments.filter(p => p.status === 'pending');
    
    console.log(`📊 Found ${pendingPayments.length} pending scheduled payments for ${userEmail}`);

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
              
              upcomingPayments.push({
                id: localSchedule.id,
                amount: upcomingInvoice.amount_due,
                dueDate: new Date(upcomingInvoice.period_end * 1000),
                status: 'pending',
                childName: childName,
                className: className,
                description: `Upcoming payment for ${localSchedule.paymentPlan} plan`,
                enrollmentIds: enrollmentIds,
                stripeScheduleId: localSchedule.stripeScheduleId,
                installmentNumber: localSchedule.currentPhase,
                totalInstallments: localSchedule.totalPhases
              });
              console.log(`📅 Added upcoming payment: ${upcomingInvoice.amount_due / 100} due ${new Date(upcomingInvoice.period_end * 1000).toLocaleDateString()}`);
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
    const { paymentId, amount, description } = req.body;
    const userEmail = req.user.email;

    console.log('💳 Processing scheduled payment:', { paymentId, amount, description, userEmail });

    if (!paymentId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID and amount are required'
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

    // Create Stripe payment intent
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Amount should be in cents
      currency: 'usd',
      metadata: {
        type: 'scheduled_payment',
        scheduledPaymentId: paymentId.toString(),
        parentEmail: userEmail,
        description: description || `Scheduled Payment ${scheduledPayment.installmentNumber}`
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    console.log('✅ Created payment intent for scheduled payment:', paymentIntent.id);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
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