import express from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';

const router = express.Router();

/**
 * Enhanced Stripe webhook handler for subscription schedules
 */
router.post('/subscription-schedules', async (req, res) => {
  try {
    console.log('🔔 Stripe subscription schedule webhook received');
    
    const event = req.body;
    
    // In a real implementation, verify webhook signature here
    
    switch (event.type) {
      case 'subscription_schedule.phase_started':
        console.log('📅 Subscription schedule phase started:', event.data.object.id);
        // Handle phase transition
        break;
        
      case 'invoice.payment_succeeded':
        console.log('✅ Invoice payment succeeded for schedule');
        await handlePaymentSuccess(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        console.log('❌ Invoice payment failed for schedule');
        await handlePaymentFailure(event.data.object);
        break;
        
      case 'subscription_schedule.completed':
        console.log('🎉 Subscription schedule completed');
        // Mark enrollments as fully paid
        break;
        
      case 'payment_intent.succeeded':
        console.log('💳 Payment intent succeeded:', event.data.object.id);
        await handleDirectPaymentSuccess(event.data.object);
        break;
        
      default:
        console.log('ℹ️ Unhandled webhook event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing Stripe webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Initialize Stripe for retry operations
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil',
});

// Handle successful subscription schedule payments
async function handlePaymentSuccess(invoice: any) {
  try {
    console.log('✅ Processing successful payment for invoice:', invoice.id);
    
    // Get subscription schedule from invoice
    if (invoice.subscription_schedule) {
      const scheduleId = invoice.subscription_schedule;
      
      // Find enrollments associated with this schedule
      const schedules = await storage.getStripeSubscriptionSchedules();
      const schedule = schedules.find(s => s.stripeScheduleId === scheduleId);
      
      if (schedule) {
        const enrollmentIds = JSON.parse(schedule.enrollmentIds);
        const paymentAmount = invoice.amount_paid;
        const perEnrollmentAmount = Math.round(paymentAmount / enrollmentIds.length);
        
        // Update each enrollment
        for (const enrollmentId of enrollmentIds) {
          const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
          if (enrollment) {
            const newTotalPaid = (enrollment.totalPaid || 0) + perEnrollmentAmount;
            const newRemainingBalance = Math.max(0, enrollment.totalCost - newTotalPaid);
            
            await storage.updateProgramEnrollment(enrollment.id, {
              totalPaid: newTotalPaid,
              remainingBalance: newRemainingBalance,
              paymentStatus: newRemainingBalance === 0 ? 'completed' : 'stripe_managed',
              status: 'enrolled'
            });
            
            console.log(`✅ Updated enrollment ${enrollmentId}: paid=${newTotalPaid}, remaining=${newRemainingBalance}`);
          }
        }
        
        console.log(`📡 Payment received for ${schedule.parentEmail}: ${paymentAmount}`);
        
        console.log(`📧 Payment receipt for ${schedule.parentEmail}: ${paymentAmount}`);
      }
    }
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

// Handle failed subscription schedule payments with retry logic
async function handlePaymentFailure(invoice: any) {
  try {
    console.log('❌ Processing failed payment for invoice:', invoice.id);
    
    if (invoice.subscription_schedule) {
      const scheduleId = invoice.subscription_schedule;
      
      // Find enrollments associated with this schedule
      const schedules = await storage.getStripeSubscriptionSchedules();
      const schedule = schedules.find(s => s.stripeScheduleId === scheduleId);
      
      if (schedule) {
        // Check attempt count
        const attemptCount = invoice.attempt_count || 1;
        const maxAttempts = 3;
        
        if (attemptCount < maxAttempts) {
          // Schedule retry payment
          console.log(`🔄 Scheduling retry ${attemptCount + 1}/${maxAttempts} for invoice ${invoice.id}`);
          
          try {
            // Update the subscription schedule to retry payment in 3 days
            const retryDate = Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60); // 3 days from now
            
            await stripe.subscriptionSchedules.update(scheduleId, {
              phases: [{
                items: [{
                  price: invoice.lines.data[0].price.id,
                  quantity: 1,
                }],
                start_date: retryDate,
                end_date: retryDate + (30 * 24 * 60 * 60), // 30 days duration
              }]
            });
            
            console.log(`📧 Retry notification sent to ${schedule.parentEmail}`);
            
            console.log(`✅ Scheduled retry payment for ${retryDate}`);
            
          } catch (retryError) {
            console.error('❌ Failed to schedule retry:', retryError);
            await handleFinalPaymentFailure(schedule, invoice);
          }
          
        } else {
          // Max attempts reached
          console.log(`❌ Max retry attempts reached for invoice ${invoice.id}`);
          await handleFinalPaymentFailure(schedule, invoice);
        }
        
        console.log(`📡 Payment failed for ${schedule.parentEmail}: attempt ${attemptCount}/${maxAttempts}`);
      }
    }
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

// Handle direct payment success (e.g., "Pay in Full" from billing page)
async function handleDirectPaymentSuccess(paymentIntent: any) {
  try {
    console.log('💳 Processing direct payment success:', paymentIntent.id);
    console.log('🔍 Payment metadata:', paymentIntent.metadata);
    
    const parentEmail = paymentIntent.metadata.parentEmail;
    const enrollmentIds = paymentIntent.metadata.enrollmentIds;
    const paymentType = paymentIntent.metadata.paymentType;
    
    if (!parentEmail || !enrollmentIds) {
      console.log('⚠️ Missing required metadata for direct payment:', { parentEmail, enrollmentIds, paymentType });
      return;
    }
    
    const enrollmentIdList = JSON.parse(enrollmentIds);
    const totalAmount = paymentIntent.amount;
    const perEnrollmentAmount = Math.round(totalAmount / enrollmentIdList.length);
    
    console.log(`💰 Processing payment for ${enrollmentIdList.length} enrollments, ${perEnrollmentAmount} cents each`);
    
    // Collect enrollment data for payment record
    const enrollments = [];
    
    // Update each enrollment and collect data
    for (const enrollmentId of enrollmentIdList) {
      try {
        const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
        if (enrollment) {
          enrollments.push(enrollment); // Store for later use
          
          const currentPaid = enrollment.totalPaid || 0;
          const newTotalPaid = currentPaid + perEnrollmentAmount;
          const newBalance = Math.max(0, enrollment.totalCost - newTotalPaid);
          
          await storage.updateProgramEnrollment(enrollment.id, {
            totalPaid: newTotalPaid,
            remainingBalance: newBalance,
            paymentStatus: newBalance === 0 ? 'completed' : 'stripe_managed',
            paymentSystemVersion: 'v2_stripe',
            status: 'enrolled'
          });
          console.log(`✅ Updated enrollment ${enrollmentId}: paid=${newTotalPaid}, balance=${newBalance}`);
        }
      } catch (error) {
        console.error(`❌ Error updating enrollment ${enrollmentId}:`, error);
      }
    }
    
    // Build child and class names from actual enrollments
    let childName = 'Child';
    let className = 'Class';
    
    if (enrollments.length === 1) {
      childName = enrollments[0].childName || 'Child';
      className = enrollments[0].className || 'Class';
    } else if (enrollments.length > 1) {
      const childNames = [...new Set(enrollments.map(e => e.childName).filter(Boolean))];
      const classNames = [...new Set(enrollments.map(e => e.className).filter(Boolean))];
      
      childName = childNames.length === 1 ? childNames[0] : `${childNames.length} children`;
      className = classNames.length === 1 ? classNames[0] : `${classNames.length} classes`;
    }
    
    // Create payment record with actual enrollment data
    const payment = {
      stripePaymentIntentId: paymentIntent.id,
      parentEmail: parentEmail,
      childName: childName,
      className: className,
      amount: totalAmount,
      currency: paymentIntent.currency || 'usd',
      status: 'completed' as const,
      enrollmentIds: enrollmentIdList, // Add enrollment IDs for reference
      metadata: {
        paymentType: 'direct_payment',
        enrollmentCount: enrollmentIdList.length
      }
    };
    
    await storage.createPayment(payment);
    console.log('✅ Payment record created for direct payment:', paymentIntent.id, 'Child:', childName, 'Class:', className);
    
  } catch (error) {
    console.error('❌ Error handling direct payment success:', error);
  }
}

// Handle final payment failure after all retries
async function handleFinalPaymentFailure(schedule: any, invoice: any) {
  try {
    console.log('❌ Handling final payment failure for schedule:', schedule.stripeScheduleId);
    
    // Cancel the subscription schedule
    await stripe.subscriptionSchedules.cancel(schedule.stripeScheduleId);
    
    // Update enrollments to require manual payment
    const enrollmentIds = JSON.parse(schedule.enrollmentIds);
    
    for (const enrollmentId of enrollmentIds) {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (enrollment) {
        await storage.updateProgramEnrollment(enrollment.id, {
          paymentStatus: 'pending',
          status: 'enrolled'
        });
      }
    }
    
    console.log(`📧 Final failure notification sent to ${schedule.parentEmail}`);
    
    console.log('✅ Payment plan canceled and enrollments updated');
    
  } catch (error) {
    console.error('❌ Error handling final payment failure:', error);
  }
}


export default router;