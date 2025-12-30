import Stripe from 'stripe';
import { storage } from '../storage';
import { getDb } from '../db';
import { membershipEnrollments, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generateMemberId } from '../utils/membership';

/**
 * Consolidated Stripe Webhook Handlers Service
 * 
 * SECURITY: All handlers in this module are designed to be called ONLY from
 * the signature-verified webhook endpoint in webhook-handler.ts.
 * 
 * These handlers should NEVER be exposed to unauthenticated routes.
 */

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
 * Handle direct payment success (e.g., "Pay in Full" from billing page)
 * Processes membership payments and enrollment updates
 */
export async function handleDirectPaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  try {
    console.log('💳 Processing direct payment success:', paymentIntent.id);
    console.log('🔍 Payment metadata:', paymentIntent.metadata);
    
    const parentEmail = paymentIntent.metadata.parentEmail;
    const enrollmentIds = paymentIntent.metadata.enrollmentIds;
    const paymentType = paymentIntent.metadata.paymentType;
    
    const hasMembership = paymentIntent.metadata.hasMembership === 'true';
    const membershipSchoolId = paymentIntent.metadata.membershipSchoolId ? parseInt(paymentIntent.metadata.membershipSchoolId) : null;
    const membershipAmount = paymentIntent.metadata.membershipAmount ? parseInt(paymentIntent.metadata.membershipAmount) : 0;
    const membershipYear = paymentIntent.metadata.membershipYear ? parseInt(paymentIntent.metadata.membershipYear) : new Date().getFullYear();
    const parentUserId = paymentIntent.metadata.membershipParentUserId ? parseInt(paymentIntent.metadata.membershipParentUserId) : null;
    
    const membershipDiscountId = paymentIntent.metadata.membershipDiscountId ? parseInt(paymentIntent.metadata.membershipDiscountId) : null;
    const membershipDiscountName = paymentIntent.metadata.membershipDiscountName || null;
    const membershipOriginalAmount = paymentIntent.metadata.membershipOriginalAmount ? parseInt(paymentIntent.metadata.membershipOriginalAmount) : null;
    const membershipDiscountAmount = paymentIntent.metadata.membershipDiscountAmount ? parseInt(paymentIntent.metadata.membershipDiscountAmount) : 0;
    
    if (hasMembership && parentUserId && membershipSchoolId) {
      console.log('🎫 Processing membership payment:', {
        parentUserId,
        membershipSchoolId,
        membershipAmount,
        membershipYear
      });
      
      try {
        const db = await getDb();
        
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.id, parentUserId))
          .limit(1);
        
        if (existingUser.length > 0 && !existingUser[0].memberId) {
          const newMemberId = generateMemberId();
          
          await db
            .update(users)
            .set({ memberId: newMemberId })
            .where(eq(users.id, parentUserId));
          
          console.log(`🎫 ✅ Generated Member ID ${newMemberId} for user ${parentUserId}`);
          
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
            totalAmount: membershipAmount,
            balanceDue: 0,
            status: 'enrolled',
            stripeSubscriptionId: null,
            stripeCustomerId: (paymentIntent.customer as string) || null,
            startDate,
            renewalDate: expirationDate,
            dueDate: startDate,
            endDate: expirationDate,
            expirationDate,
            gracePeriodEnd: null,
            paymentMethod: 'other',
            notes: `Stripe payment via cart checkout (${paymentIntent.id})${membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''}`
          });
          
          console.log(`🎫 ✅ Created membership enrollment for user ${parentUserId}`);
          
          if (membershipDiscountId && membershipDiscountAmount > 0 && membershipSchoolId) {
            try {
              const schoolDiscounts = await storage.getDiscountsBySchoolId(membershipSchoolId);
              const discount = schoolDiscounts.find(d => d.id === membershipDiscountId);
              
              if (!discount) {
                console.error(`⚠️ Discount ${membershipDiscountId} not found for school ${membershipSchoolId} - skipping tracking`);
              } else {
                const incrementSuccess = await storage.incrementDiscountUsageAtomic(membershipDiscountId);
                
                if (!incrementSuccess) {
                  console.log(`⚠️ Discount ${membershipDiscountName} has reached usage limit - atomic increment failed`);
                } else {
                  await storage.createDiscountApplication({
                    discountId: membershipDiscountId,
                    parentEmail: parentEmail || '',
                    childId: null,
                    schoolEnrollmentId: null,
                    programEnrollmentId: null,
                    paymentId: null,
                    classId: null,
                    originalAmount: membershipOriginalAmount || membershipAmount + membershipDiscountAmount,
                    discountAmount: membershipDiscountAmount,
                    finalAmount: membershipAmount,
                    applicationMethod: 'automatic',
                    appliedBy: null,
                  });
                  console.log(`🎫 ✅ Tracked membership discount usage: ${membershipDiscountName}`);
                }
              }
            } catch (discountTrackError) {
              console.error('⚠️ Error tracking membership discount application:', discountTrackError);
            }
          }
        } else if (existingUser.length > 0 && existingUser[0].memberId) {
          console.log(`🎫 User ${parentUserId} already has Member ID: ${existingUser[0].memberId}`);
        }
      } catch (membershipError) {
        console.error('❌ Error processing membership payment:', membershipError);
      }
    }
    
    if (!parentEmail || !enrollmentIds) {
      console.log('⚠️ Missing required metadata for direct payment:', { parentEmail, enrollmentIds, paymentType });
      return;
    }
    
    const enrollmentIdList = JSON.parse(enrollmentIds);
    const totalAmount = paymentIntent.amount;
    
    const enrollmentTotal = totalAmount - membershipAmount;
    const perEnrollmentAmount = Math.round(enrollmentTotal / enrollmentIdList.length);
    
    console.log(`💰 Processing payment for ${enrollmentIdList.length} enrollments, ${perEnrollmentAmount} cents each`);
    
    const enrollments = [];
    
    for (const enrollmentId of enrollmentIdList) {
      try {
        const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
        if (enrollment) {
          enrollments.push(enrollment);
          
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
      schoolId = enrollments[0].schoolId || 0;
      
      childName = childNames.length === 1 ? childNames[0] : `${childNames.length} children`;
      className = classNames.length === 1 ? classNames[0] : `${classNames.length} classes`;
    }
    
    const payment = {
      schoolId,
      parentId: null,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      parentEmail: parentEmail,
      childName: childName,
      className: className,
      description: `Direct payment for ${className}`,
      amount: totalAmount,
      currency: paymentIntent.currency || 'usd',
      status: 'completed' as const,
      paymentDate: new Date(),
      enrollmentIds: enrollmentIdList,
      metadata: {
        paymentType: 'direct_payment',
        enrollmentCount: enrollmentIdList.length
      }
    };
    
    await storage.createPayment(payment);
    console.log('✅ Payment record created for direct payment:', paymentIntent.id);
    
    try {
      const parentUser = await storage.getUserByEmail(parentEmail);
      if (parentUser) {
        const discountSnapshotStr = paymentIntent.metadata.discountSnapshot;
        const subtotalAmount = paymentIntent.metadata.subtotalAmount ? parseInt(paymentIntent.metadata.subtotalAmount) : null;
        const discountTotal = paymentIntent.metadata.discountTotal ? parseInt(paymentIntent.metadata.discountTotal) : null;
        
        let discountSnapshot: any = null;
        if (discountSnapshotStr) {
          try {
            discountSnapshot = JSON.parse(discountSnapshotStr);
          } catch (e) {
            console.warn('⚠️ Failed to parse discount snapshot:', e);
          }
        }
        
        const stripePaymentRecord = await (storage as any).saveStripePayment({
          userId: parentUser.id,
          paymentIntentId: paymentIntent.id,
          customerId: paymentIntent.customer || `cus_unknown_${Date.now()}`,
          subscriptionId: null,
          amount: totalAmount,
          currency: paymentIntent.currency || 'usd',
          subtotalAmount: subtotalAmount || totalAmount,
          discountTotal: discountTotal || 0,
          discountSnapshot: discountSnapshot,
          status: 'succeeded',
          paymentMethod: paymentIntent.payment_method_types?.[0] || 'card',
          description: `Direct payment for ${className}`,
          stripeCreatedAt: new Date(paymentIntent.created * 1000)
        });
        
        console.log('✅ Stripe payment history saved with discount tracking:', stripePaymentRecord.id);
        
        if (discountSnapshot && discountSnapshot.appliedDiscounts && discountSnapshot.appliedDiscounts.length > 0) {
          for (const discount of discountSnapshot.appliedDiscounts) {
            try {
              await (storage as any).createPaymentDiscount({
                paymentHistoryId: stripePaymentRecord.id,
                discountId: discount.discountId || null,
                source: discount.source || 'automatic',
                codeSnapshot: discount.code || null,
                nameSnapshot: discount.name || 'Discount',
                typeSnapshot: discount.type || 'percentage',
                valueSnapshot: discount.value || 0,
                amount: discount.amount || 0,
                enrollmentId: null
              });
            } catch (discountInsertError) {
              console.warn('⚠️ Error saving payment discount entry:', discountInsertError);
            }
          }
          console.log(`✅ Created ${discountSnapshot.appliedDiscounts.length} payment_discounts entries`);
        }
      }
    } catch (paymentHistoryError) {
      console.error('⚠️ Error saving stripe payment history (non-blocking):', paymentHistoryError);
    }
    
    // Process credits consumption if applied (uses unified credit system)
    const creditsApplied = paymentIntent.metadata.volunteerCreditsApplied 
      ? parseInt(paymentIntent.metadata.volunteerCreditsApplied) 
      : 0;
    
    if (creditsApplied > 0 && parentEmail) {
      try {
        console.log('💰 Processing credits consumption (unified system):', { 
          creditsToConsume: creditsApplied, 
          parentEmail 
        });
        
        const parentUser = await storage.getUserByEmail(parentEmail);
        if (parentUser) {
          // Use unified credit system for atomic FIFO consumption
          const { usedCredits, totalUsed } = await storage.useCredits(
            parentUser.id, 
            creditsApplied, 
            null, // paymentHistoryId - could be populated if we want to link it
            `Applied to enrollment payment ${paymentIntent.id}`
          );
          
          console.log(`💰 Consumed ${totalUsed} cents across ${usedCredits.length} credits`);
          console.log('✅ Credits consumed successfully via unified system');
        }
      } catch (creditsError) {
        console.error('⚠️ Error consuming credits (non-blocking):', creditsError);
      }
    }
    
  } catch (error) {
    console.error('❌ Error handling direct payment success:', error);
  }
}

/**
 * Handle successful membership invoice payment
 */
export async function handleMembershipInvoicePaid(invoice: any): Promise<void> {
  try {
    console.log('✅ Processing successful membership payment for invoice:', invoice.id);
    
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) {
      console.log('⚠️ No subscription ID in invoice');
      return;
    }
    
    const db = await getDb();
    
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscriptionId));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership enrollment found for subscription:', subscriptionId);
      return;
    }
    
    const enrollment = enrollments[0];
    
    const amountPaid = invoice.amount_paid || 0;
    const currentAmountPaid = enrollment.amountPaid || 0;
    const newAmountPaid = currentAmountPaid + amountPaid;
    const totalAmount = enrollment.amount || 0;
    const remainingBalance = Math.max(0, totalAmount - newAmountPaid);
    
    let newStatus = enrollment.status;
    if (remainingBalance === 0 || amountPaid > 0) {
      newStatus = 'enrolled';
    }
    
    const startDate = enrollment.startDate || new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    
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

/**
 * Handle failed membership invoice payment
 */
export async function handleMembershipPaymentFailed(invoice: any): Promise<void> {
  try {
    console.log('❌ Processing failed membership payment for invoice:', invoice.id);
    
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) {
      console.log('⚠️ No subscription ID in invoice');
      return;
    }
    
    const db = await getDb();
    
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
    
    await db
      .update(membershipEnrollments)
      .set({
        status: 'pending_payment',
        notes: `Payment attempt ${attemptCount} failed for invoice ${invoice.id}`,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`⚠️ Membership ${enrollment.id} marked as pending_payment (attempt ${attemptCount})`);
    
  } catch (error) {
    console.error('❌ Error handling membership payment failure:', error);
  }
}

/**
 * Handle new subscription creation
 */
export async function handleMembershipSubscriptionCreated(subscription: any): Promise<void> {
  try {
    console.log('🆕 Processing new membership subscription:', subscription.id);
    
    const membershipId = subscription.metadata?.membershipId;
    if (!membershipId) {
      console.log('⚠️ No membershipId in subscription metadata');
      return;
    }
    
    const db = await getDb();
    
    const enrollment = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.id, parseInt(membershipId)))
      .limit(1);
    
    if (enrollment.length === 0) {
      console.log('⚠️ No membership enrollment found for ID:', membershipId);
      return;
    }
    
    const startDate = safeStripeDate(subscription.current_period_start);
    const renewalDate = safeStripeDate(subscription.current_period_end);
    
    await db
      .update(membershipEnrollments)
      .set({
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
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

/**
 * Handle subscription updates (tier changes, cancellations)
 */
export async function handleMembershipSubscriptionUpdated(subscription: any): Promise<void> {
  try {
    console.log('🔄 Processing membership subscription update:', subscription.id);
    
    const db = await getDb();
    
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscription.id));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership found for subscription:', subscription.id);
      return;
    }
    
    const enrollment = enrollments[0];
    
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
    
    const renewalDate = safeStripeDate(subscription.current_period_end);
    
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

/**
 * Handle subscription deletion/cancellation
 */
export async function handleMembershipSubscriptionDeleted(subscription: any): Promise<void> {
  try {
    console.log('🗑️ Processing membership subscription cancellation:', subscription.id);
    
    const db = await getDb();
    
    const enrollments = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.stripeSubscriptionId, subscription.id));
    
    if (enrollments.length === 0) {
      console.log('⚠️ No membership found for subscription:', subscription.id);
      return;
    }
    
    const enrollment = enrollments[0];
    
    const expirationDate = safeStripeDate(subscription.current_period_end);
    
    await db
      .update(membershipEnrollments)
      .set({
        status: 'expired',
        expirationDate: expirationDate,
        notes: `Subscription cancelled on ${new Date().toISOString()}. Access until ${expirationDate.toISOString()}`,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, enrollment.id));
    
    console.log(`✅ Membership ${enrollment.id} marked as expired. Expires: ${expirationDate.toISOString()}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription deletion:', error);
  }
}
