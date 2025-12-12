import express from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { getDb } from '../db';
import { membershipEnrollments, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getStripeClient } from '../config/stripe';
import { generateMemberId } from '../utils/membership';

const router = express.Router();

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

/**
 * @deprecated Use membership webhook handlers instead
 * Kept for backward compatibility - logs warning only
 */
async function handlePaymentSuccess(invoice: any) {
  console.log('⚠️ DEPRECATED: Old subscription schedule handler called for invoice:', invoice.id);
}

/**
 * @deprecated Use membership webhook handlers instead
 * Kept for backward compatibility - logs warning only
 */
async function handlePaymentFailure(invoice: any) {
  console.log('⚠️ DEPRECATED: Old subscription schedule failure handler called for invoice:', invoice.id);
}

// Handle direct payment success (e.g., "Pay in Full" from billing page)
async function handleDirectPaymentSuccess(paymentIntent: any) {
  try {
    console.log('💳 Processing direct payment success:', paymentIntent.id);
    console.log('🔍 Payment metadata:', paymentIntent.metadata);
    
    const parentEmail = paymentIntent.metadata.parentEmail;
    const enrollmentIds = paymentIntent.metadata.enrollmentIds;
    const paymentType = paymentIntent.metadata.paymentType;
    
    // Check for membership payment (metadata set at creation time, not updated)
    const hasMembership = paymentIntent.metadata.hasMembership === 'true';
    const membershipSchoolId = paymentIntent.metadata.membershipSchoolId ? parseInt(paymentIntent.metadata.membershipSchoolId) : null;
    const membershipAmount = paymentIntent.metadata.membershipAmount ? parseInt(paymentIntent.metadata.membershipAmount) : 0;
    const membershipYear = paymentIntent.metadata.membershipYear ? parseInt(paymentIntent.metadata.membershipYear) : new Date().getFullYear();
    // Use membershipParentUserId (set by payment plan service) for security
    const parentUserId = paymentIntent.metadata.membershipParentUserId ? parseInt(paymentIntent.metadata.membershipParentUserId) : null;
    
    // Check for membership discount info (set when discount was applied)
    const membershipDiscountId = paymentIntent.metadata.membershipDiscountId ? parseInt(paymentIntent.metadata.membershipDiscountId) : null;
    const membershipDiscountName = paymentIntent.metadata.membershipDiscountName || null;
    const membershipOriginalAmount = paymentIntent.metadata.membershipOriginalAmount ? parseInt(paymentIntent.metadata.membershipOriginalAmount) : null;
    const membershipDiscountAmount = paymentIntent.metadata.membershipDiscountAmount ? parseInt(paymentIntent.metadata.membershipDiscountAmount) : 0;
    
    // Handle membership payment - generate Member ID
    if (hasMembership && parentUserId && membershipSchoolId) {
      console.log('🎫 Processing membership payment:', {
        parentUserId,
        membershipSchoolId,
        membershipAmount,
        membershipYear
      });
      
      try {
        const db = await getDb();
        
        // Check if user already has a Member ID
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.id, parentUserId))
          .limit(1);
        
        if (existingUser.length > 0 && !existingUser[0].memberId) {
          // Generate and assign new Member ID
          const newMemberId = generateMemberId();
          
          await db
            .update(users)
            .set({ memberId: newMemberId })
            .where(eq(users.id, parentUserId));
          
          console.log(`🎫 ✅ Generated Member ID ${newMemberId} for user ${parentUserId}`);
          
          // Create or update membership enrollment record
          const startDate = new Date();
          const expirationDate = new Date(startDate);
          expirationDate.setFullYear(expirationDate.getFullYear() + 1);
          
          await storage.createMembershipEnrollment({
            schoolId: membershipSchoolId,
            parentUserId: parentUserId,
            membershipYear: membershipYear,
            membershipTier: 'basic',
            amount: membershipAmount,
            amountPaid: membershipAmount,
            remainingBalance: 0,
            totalAmount: membershipAmount, // Total membership amount in cents
            balanceDue: 0, // Fully paid via Stripe
            status: 'enrolled',
            stripeSubscriptionId: null,
            stripeCustomerId: paymentIntent.customer || null,
            startDate,
            renewalDate: expirationDate,
            dueDate: startDate,
            endDate: expirationDate, // End date same as expiration date
            expirationDate,
            gracePeriodEnd: null,
            paymentMethod: 'other', // Stripe payment via cart checkout
            notes: `Stripe payment via cart checkout (${paymentIntent.id})${membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''}`
          });
          
          console.log(`🎫 ✅ Created membership enrollment for user ${parentUserId}`);
          
          // Track membership discount application if a discount was used
          if (membershipDiscountId && membershipDiscountAmount > 0 && membershipSchoolId) {
            try {
              // SECURITY: Fetch discount using school-scoped query to ensure it belongs to this school
              const schoolDiscounts = await storage.getDiscountsBySchoolId(membershipSchoolId);
              const discount = schoolDiscounts.find(d => d.id === membershipDiscountId);
              
              if (!discount) {
                console.error(`⚠️ Discount ${membershipDiscountId} not found for school ${membershipSchoolId} - skipping tracking`);
              } else {
                // ATOMIC: Try to increment usage counter with limit check (prevents race conditions)
                const incrementSuccess = await storage.incrementDiscountUsageAtomic(membershipDiscountId);
                
                if (!incrementSuccess) {
                  console.log(`⚠️ Discount ${membershipDiscountName} has reached usage limit - atomic increment failed, skipping discount application record`);
                } else {
                  // Create discount application record for membership (only if increment succeeded)
                  await storage.createDiscountApplication({
                    discountId: membershipDiscountId,
                    parentEmail: parentEmail || '',
                    childId: null,
                    schoolEnrollmentId: null,
                    programEnrollmentId: null,
                    paymentId: paymentIntent.id,
                    classId: null,
                    originalAmount: membershipOriginalAmount || membershipAmount + membershipDiscountAmount,
                    discountAmount: membershipDiscountAmount,
                    finalAmount: membershipAmount,
                    applicationMethod: 'automatic',
                    appliedBy: null,
                  });
                  console.log(`🎫 ✅ Tracked membership discount usage: ${membershipDiscountName} (atomic increment succeeded)`);
                }
              }
            } catch (discountTrackError) {
              console.error('⚠️ Error tracking membership discount application:', discountTrackError);
              // Don't fail - discount tracking is secondary to membership creation
            }
          }
        } else if (existingUser.length > 0 && existingUser[0].memberId) {
          console.log(`🎫 User ${parentUserId} already has Member ID: ${existingUser[0].memberId}`);
        }
      } catch (membershipError) {
        console.error('❌ Error processing membership payment:', membershipError);
        // Don't fail the whole payment - membership can be manually assigned
      }
    }
    
    if (!parentEmail || !enrollmentIds) {
      console.log('⚠️ Missing required metadata for direct payment:', { parentEmail, enrollmentIds, paymentType });
      return;
    }
    
    const enrollmentIdList = JSON.parse(enrollmentIds);
    const totalAmount = paymentIntent.amount;
    
    // Calculate per-enrollment amount, excluding membership fee
    const enrollmentTotal = totalAmount - membershipAmount;
    const perEnrollmentAmount = Math.round(enrollmentTotal / enrollmentIdList.length);
    
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