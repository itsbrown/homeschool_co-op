import express from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { getDb } from '../db';
import { membershipEnrollments } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getStripeClient } from '../config/stripe';

const router = express.Router();

/** Unverified JSON webhook routes below are blocked in production; use POST /api/stripe/webhook. */
function blockLegacyStripeWebhookInProduction(routeLabel: string): express.RequestHandler {
  return (_req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`Blocked legacy unverified Stripe route (${routeLabel}) in production`);
      return res.status(410).json({
        error: 'Endpoint disabled',
        message:
          'Configure Stripe to send all events (including membership) to POST /api/stripe/webhook.',
      });
    }
    next();
  };
}

/**
 * Membership subscription Stripe events — invoked from verified webhook-handler and (non-prod only)
 * legacy POST /api/stripe-webhooks/membership for unsigned test payloads.
 */
export async function processMembershipStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'invoice.paid':
      await handleMembershipInvoicePaid(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleMembershipPaymentFailed(event.data.object);
      break;
    case 'customer.subscription.created':
      await handleMembershipSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleMembershipSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleMembershipSubscriptionDeleted(event.data.object);
      break;
    default:
      console.log('ℹ️ Unhandled membership webhook event type:', event.type);
  }
}

/**
 * Safely parse Stripe Unix timestamp to Date
 * Returns current date as fallback if timestamp is invalid
 */
function safeStripeDate(timestamp: number | undefined | null): Date {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    console.warn('⚠️ Invalid Stripe timestamp, using current date');
    return new Date();
  }
  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) {
    console.warn('⚠️ Stripe timestamp resulted in invalid date:', timestamp);
    return new Date();
  }
  return date;
}

/**
 * Enhanced Stripe webhook handler for subscription schedules
 */
router.post('/subscription-schedules', blockLegacyStripeWebhookInProduction('subscription-schedules'), async (req, res) => {
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
    const parentEmail = paymentIntent.metadata.parentEmail;
    const enrollmentIdsRaw = paymentIntent.metadata.enrollmentIds;
    if (!parentEmail || !enrollmentIdsRaw) {
      console.log('⚠️ Missing required metadata for direct payment:', {
        parentEmail,
        enrollmentIds: enrollmentIdsRaw,
      });
      return;
    }

    const enrollmentIdList = JSON.parse(enrollmentIdsRaw) as number[];
    const { finalizeSucceededPaymentIntent } = await import('../lib/finalize-succeeded-payment-intent');
    await finalizeSucceededPaymentIntent(paymentIntent, enrollmentIdList, {
      persistScheduledPayments: true,
      skipConfirmationEmail: true,
    });
    console.log('✅ Direct payment finalized via membership waterfall:', paymentIntent.id);
  } catch (error) {
    console.error('❌ Error handling direct payment success:', error);
  }
}

// Handle final payment failure after all retries
async function handleFinalPaymentFailure(schedule: any, invoice: any) {
  try {
    console.log('❌ Handling final payment failure for schedule:', schedule.stripeScheduleId);
    
    // Cancel the subscription schedule
    const stripe = await getStripeClient();
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
router.post('/membership', blockLegacyStripeWebhookInProduction('membership'), async (req, res) => {
  try {
    console.log('🔔 Stripe membership webhook received (legacy unverified route; dev/test only)');
    await processMembershipStripeEvent(req.body as Stripe.Event);

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
      newStatus = 'enrolled';
    } else if (amountPaid > 0) {
      newStatus = 'enrolled'; // Partial payment still activates membership
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
    
    // Calculate dates safely
    const startDate = safeStripeDate(subscription.current_period_start);
    const renewalDate = safeStripeDate(subscription.current_period_end);
    
    // Update enrollment with subscription data
    await db
      .update(membershipEnrollments)
      .set({
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        startDate: startDate,
        renewalDate: renewalDate,
        status: (subscription.status === 'active' || subscription.status === 'trialing') ? 'enrolled' : 'pending_payment',
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
    
    // Map Stripe status to our valid schema status
    // Valid statuses: pending_payment, enrolled, expired, grace_period, suspended
    let newStatus: 'pending_payment' | 'enrolled' | 'expired' | 'grace_period' | 'suspended' = enrollment.status as any;
    switch (subscription.status) {
      case 'active':
      case 'trialing':
        newStatus = 'enrolled';
        break;
      case 'past_due':
        newStatus = 'grace_period';
        break;
      case 'canceled':
        newStatus = 'suspended';
        break;
      case 'unpaid':
      case 'incomplete_expired':
        newStatus = 'expired';
        break;
      case 'incomplete':
      case 'paused':
      default:
        newStatus = 'pending_payment';
        break;
    }
    
    // Update renewal date safely
    const renewalDate = safeStripeDate(subscription.current_period_end);
    
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
    
    // Calculate expiration date safely (end of current period)
    const expirationDate = safeStripeDate(subscription.current_period_end);
    
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