import express from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { getDb } from '../db';
import { membershipEnrollments, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { STRIPE_SECRET_KEY } from '../config/stripe';

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
const stripe = new Stripe(STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20',
});

// DEPRECATED: Old subscription schedule handlers - replaced by membership webhook handlers
// Handle successful subscription schedule payments
async function handlePaymentSuccess(invoice: any) {
  try {
    console.log('⚠️ DEPRECATED: Old subscription schedule payment handler called for invoice:', invoice.id);
    console.log('ℹ️ This handler is deprecated. Use membership webhook handlers instead.');
    
    // Legacy code commented out - no longer used
    /*
    // Get subscription schedule from invoice
    if (invoice.subscription_schedule) {
      const scheduleId = invoice.subscription_schedule;
      
      // Find enrollments associated with this schedule
      const schedules = await storage.getStripeSubscriptionSchedules();
      const schedule = schedules.find((s: any) => s.stripeScheduleId === scheduleId);
      
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
    */
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

// DEPRECATED: Old subscription schedule handlers - replaced by membership webhook handlers
// Handle failed subscription schedule payments with retry logic
async function handlePaymentFailure(invoice: any) {
  try {
    console.log('⚠️ DEPRECATED: Old subscription schedule payment failure handler called for invoice:', invoice.id);
    console.log('ℹ️ This handler is deprecated. Use membership webhook handlers instead.');
    
    // Legacy code commented out - no longer used
    /*
    if (invoice.subscription_schedule) {
      const scheduleId = invoice.subscription_schedule;
      
      // Find enrollments associated with this schedule
      const schedules = await storage.getStripeSubscriptionSchedules();
      const schedule = schedules.find((s: any) => s.stripeScheduleId === scheduleId);
      
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
    */
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
    let schoolId = 0;
    
    if (enrollments.length === 1) {
      childName = enrollments[0].childName || 'Child';
      className = enrollments[0].className || 'Class';
      schoolId = enrollments[0].schoolId || 0;
    } else if (enrollments.length > 1) {
      const childNames = [...new Set(enrollments.map(e => e.childName).filter(Boolean))];
      const classNames = [...new Set(enrollments.map(e => e.className).filter(Boolean))];
      schoolId = enrollments[0].schoolId || 0; // Use first enrollment's school
      
      childName = childNames.length === 1 ? childNames[0] : `${childNames.length} children`;
      className = classNames.length === 1 ? classNames[0] : `${classNames.length} classes`;
    }
    
    // Create payment record with actual enrollment data
    const payment = {
      schoolId,
      parentId: null, // Will be set later if needed
      stripePaymentIntentId: paymentIntent.id,
      parentEmail: parentEmail,
      childName: childName,
      className: className,
      description: `Direct payment for ${className}`,
      amount: totalAmount,
      currency: paymentIntent.currency || 'usd',
      status: 'completed' as const,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentDate: new Date(),
      enrollmentIds: enrollmentIdList,
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

/**
 * Stripe webhook handler for membership subscriptions
 * Handles: invoice.paid, invoice.payment_failed, customer.subscription.updated
 */
router.post('/membership', async (req, res) => {
  try {
    console.log('🔔 Stripe membership webhook received');
    
    const event = req.body;
    
    // In a real implementation, verify webhook signature here:
    // const signature = req.headers['stripe-signature'];
    // const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    
    switch (event.type) {
      case 'invoice.paid':
        console.log('✅ Invoice paid for membership');
        await handleMembershipInvoicePaid(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        console.log('❌ Invoice payment failed for membership');
        await handleMembershipPaymentFailed(event.data.object);
        break;
        
      case 'customer.subscription.created':
        console.log('🆕 Subscription created for membership');
        await handleMembershipSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        console.log('🔄 Subscription updated for membership');
        await handleMembershipSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        console.log('🗑️ Subscription deleted/cancelled for membership');
        await handleMembershipSubscriptionDeleted(event.data.object);
        break;
        
      default:
        console.log('ℹ️ Unhandled membership webhook event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing membership webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful membership invoice payment
async function handleMembershipInvoicePaid(invoice: any) {
  try {
    console.log('✅ Processing successful membership payment for invoice:', invoice.id);
    
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) {
      console.log('⚠️ No subscription ID in invoice');
      return;
    }
    
    const db = await getDb();
    
    // Find membership enrollment by subscription ID
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscriptionId));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership enrollment found for subscription:', subscriptionId);
      return;
    }
    
    const enrollment = enrollments[0];
    
    // Calculate payment tracking
    const amountPaid = invoice.amount_paid || 0;
    const currentAmountPaid = enrollment.amountPaid || 0;
    const newAmountPaid = currentAmountPaid + amountPaid;
    const totalAmount = enrollment.amount || 0;
    const remainingBalance = Math.max(0, totalAmount - newAmountPaid);
    
    // Determine new status based on payment
    let newStatus = enrollment.status;
    if (remainingBalance === 0) {
      newStatus = 'active';
    } else if (amountPaid > 0) {
      newStatus = 'active'; // Partial payment still activates membership
    }
    
    // Calculate renewal date (1 year from start date)
    const startDate = enrollment.startDate || new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    
    // Update membership enrollment
    await db
      .update(membershipEnrollments)
      .set({
        status: newStatus,
        amountPaid: newAmountPaid,
        remainingBalance: remainingBalance,
        renewalDate: renewalDate,
        paymentMethod: 'stripe',
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`✅ Membership ${enrollment.id} updated: status=${newStatus}, paid=${newAmountPaid}, balance=${remainingBalance}`);
    
  } catch (error) {
    console.error('❌ Error handling membership invoice paid:', error);
  }
}

// Handle failed membership invoice payment
async function handleMembershipPaymentFailed(invoice: any) {
  try {
    console.log('❌ Processing failed membership payment for invoice:', invoice.id);
    
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) {
      console.log('⚠️ No subscription ID in invoice');
      return;
    }
    
    const db = await getDb();
    
    // Find membership enrollment by subscription ID
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscriptionId));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership enrollment found for subscription:', subscriptionId);
      return;
    }
    
    const enrollment = enrollments[0];
    const attemptCount = invoice.attempt_count || 1;
    
    // Update status to payment_failed but keep active until grace period ends
    await db
      .update(membershipEnrollments)
      .set({
        status: 'payment_failed',
        notes: `Payment attempt ${attemptCount} failed for invoice ${invoice.id}`,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`⚠️ Membership ${enrollment.id} marked as payment_failed (attempt ${attemptCount})`);
    
    // TODO: Send notification to parent about failed payment
    
  } catch (error) {
    console.error('❌ Error handling membership payment failure:', error);
  }
}

// Handle new subscription creation
async function handleMembershipSubscriptionCreated(subscription: any) {
  try {
    console.log('🆕 Processing new membership subscription:', subscription.id);
    
    const membershipId = subscription.metadata?.membershipId;
    if (!membershipId) {
      console.log('⚠️ No membershipId in subscription metadata');
      return;
    }
    
    const db = await getDb();
    
    // Find and update membership enrollment
    const enrollment = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.id, parseInt(membershipId)))
      .limit(1);
    
    if (enrollment.length === 0) {
      console.log('⚠️ No membership enrollment found for ID:', membershipId);
      return;
    }
    
    // Calculate dates
    const startDate = new Date(subscription.current_period_start * 1000);
    const renewalDate = new Date(subscription.current_period_end * 1000);
    
    // Update enrollment with subscription data
    await db
      .update(membershipEnrollments)
      .set({
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        startDate: startDate,
        renewalDate: renewalDate,
        status: subscription.status === 'active' ? 'active' : 'pending_payment',
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, parseInt(membershipId)));
    
    console.log(`✅ Membership ${membershipId} linked to subscription ${subscription.id}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription creation:', error);
  }
}

// Handle subscription updates (tier changes, cancellations)
async function handleMembershipSubscriptionUpdated(subscription: any) {
  try {
    console.log('🔄 Processing membership subscription update:', subscription.id);
    
    const db = await getDb();
    
    // Find membership by subscription ID
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscription.id));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership found for subscription:', subscription.id);
      return;
    }
    
    const enrollment = enrollments[0];
    
    // Map Stripe status to our status
    let newStatus = enrollment.status;
    if (subscription.status === 'active') {
      newStatus = 'active';
    } else if (subscription.status === 'canceled') {
      newStatus = 'cancelled';
    } else if (subscription.status === 'past_due') {
      newStatus = 'payment_failed';
    } else if (subscription.status === 'unpaid') {
      newStatus = 'expired';
    }
    
    // Update renewal date
    const renewalDate = new Date(subscription.current_period_end * 1000);
    
    // Update enrollment
    await db
      .update(membershipEnrollments)
      .set({
        status: newStatus,
        renewalDate: renewalDate,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`✅ Membership ${enrollment.id} updated: status=${newStatus}, renewalDate=${renewalDate.toISOString()}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription update:', error);
  }
}

// Handle subscription deletion/cancellation
async function handleMembershipSubscriptionDeleted(subscription: any) {
  try {
    console.log('🗑️ Processing membership subscription cancellation:', subscription.id);
    
    const db = await getDb();
    
    // Find membership by subscription ID
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscription.id));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership found for subscription:', subscription.id);
      return;
    }
    
    const enrollment = enrollments[0];
    
    // Calculate expiration date (end of current period)
    const expirationDate = new Date(subscription.current_period_end * 1000);
    
    // Update enrollment to cancelled
    await db
      .update(membershipEnrollments)
      .set({
        status: 'cancelled',
        expirationDate: expirationDate,
        notes: `Subscription cancelled on ${new Date().toISOString()}. Access until ${expirationDate.toISOString()}`,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`✅ Membership ${enrollment.id} marked as cancelled. Expires: ${expirationDate.toISOString()}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription deletion:', error);
  }
}


export default router;