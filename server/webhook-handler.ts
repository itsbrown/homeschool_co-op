import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { storage } from './storage';
import { sendPaymentReceipt } from './lib/email-service';
import { getStripeClient } from './config/stripe';
import { createReceiptFromPayment } from './services/receiptService';
import {
  handleDirectPaymentSuccess,
  handleMembershipInvoicePaid,
  handleMembershipPaymentFailed,
  handleMembershipSubscriptionCreated,
  handleMembershipSubscriptionUpdated,
  handleMembershipSubscriptionDeleted
} from './services/stripeWebhookHandlers';
import {
  isPaymentProcessorEnabled,
  processPayment,
  generateIdempotencyKey,
  checkSchemaReady,
  type PaymentSource,
} from './services/PaymentProcessorService';
import { recordTask219Skip } from './lib/task219SkipLog';
import { recordTask222Skip } from './lib/task222SkipLog';
import type { InsertRefundEvent, InsertPaymentAllocation } from '@shared/schema';
import { AUTOPAY_MAX_RETRIES } from './services/auto-pay-scheduler';
import { handleScheduledPaymentFailed } from './services/auto-pay-webhook-helpers';
import { processMembershipStripeEvent } from './api/stripe-webhook';
import { splitCentsEvenly } from './api/billing';
import { enrollmentPoolCentsForBalanceIntent, parseMetadataMembershipAmountCents } from './lib/balance-payment-metadata';
import { fulfillMembershipFromCartPaymentIntent } from './services/fulfill-membership-payment-intent';
import { findProgramEnrollmentForCartItem } from './lib/cart-checkout-enrollment-match';

// Stripe client will be lazily initialized within the webhook handler
const RECENT_WEBHOOK_EVENTS_MAX = 1000;
const RECENT_WEBHOOK_TTL_MS = 1000 * 60 * 60; // 1 hour
const recentWebhookEvents = new Map<string, number>();

function cleanupRecentWebhookEvents(now: number): void {
  for (const [eventId, seenAt] of recentWebhookEvents.entries()) {
    if (now - seenAt > RECENT_WEBHOOK_TTL_MS) {
      recentWebhookEvents.delete(eventId);
    }
  }
  // Keep memory bounded even under heavy event volume.
  if (recentWebhookEvents.size > RECENT_WEBHOOK_EVENTS_MAX) {
    const entries = Array.from(recentWebhookEvents.entries()).sort((a, b) => a[1] - b[1]);
    const toTrim = recentWebhookEvents.size - RECENT_WEBHOOK_EVENTS_MAX;
    for (let i = 0; i < toTrim; i++) {
      recentWebhookEvents.delete(entries[i][0]);
    }
  }
}

/** Shared cart line-item → enrollment updates for checkout.session.completed and payment_intent.succeeded. */
async function applyCartCheckoutItemsFromWebhook(
  items: any[],
  paymentIntent: Stripe.PaymentIntent
): Promise<any[]> {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const amountPerItem = Math.round(paymentIntent.amount / items.length);
  const updatedEnrollments: any[] = [];

  for (const item of items) {
    try {
      const allEnrollments = await storage.getAllEnrollments();
      const enrollment = findProgramEnrollmentForCartItem(allEnrollments as any, item);

      if (enrollment) {
        const currentAmount = enrollment.totalPaid || 0;
        const newAmount = currentAmount + amountPerItem;
        const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);

        const updatedEnrollment = await storage.updateProgramEnrollment(enrollment.id, {
          totalPaid: newAmount,
          remainingBalance,
          paymentStatus: remainingBalance <= 0 ? 'completed' : 'partial_payment',
          status: 'enrolled',
        });

        if (updatedEnrollment) {
          updatedEnrollments.push(updatedEnrollment);
          console.log(
            `✅ Updated enrollment ${enrollment.id} for ${item.childName} in ${item.className}: paid=${newAmount}, remaining=${remainingBalance}`
          );
        }
      } else {
        console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
      }
    } catch (error) {
      console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
    }
  }

  return updatedEnrollments;
}

async function applyBalancePaymentToEnrollmentsOnly(
  paymentIntent: Stripe.PaymentIntent,
  enrollmentIds: number[],
): Promise<void> {
  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    return;
  }

  const amountCents = typeof paymentIntent.amount === 'number' ? paymentIntent.amount : 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Payment intent amount must be a positive integer in cents');
  }

  const membershipCents = parseMetadataMembershipAmountCents(
    paymentIntent.metadata as Record<string, string | undefined>
  );
  const classPoolCents = enrollmentPoolCentsForBalanceIntent(amountCents, membershipCents);
  const allocation = splitCentsEvenly(classPoolCents, enrollmentIds.length);

  for (let i = 0; i < enrollmentIds.length; i++) {
    const enrollmentId = enrollmentIds[i];
    const amountPerEnrollment = allocation[i];
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;

    const currentAmountPaid = enrollment.totalPaid || 0;
    const newAmountPaid = currentAmountPaid + amountPerEnrollment;
    const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
    await storage.updateProgramEnrollment(enrollment.id, {
      totalPaid: newAmountPaid,
      remainingBalance,
      paymentStatus: 'stripe_managed',
      paymentSystemVersion: 'v2_stripe',
      status: 'enrolled',
    });
  }
}

/**
 * Standalone Stripe webhook handler that must be applied BEFORE any JSON body parsers.
 * This handler requires raw buffer access for signature verification.
 * 
 * Usage in server/index.ts:
 * app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);
 */
export const webhookHandler = async (req: Request, res: Response) => {
  // FIRST LOG - captures every webhook request immediately
  console.log('🚀 WEBHOOK ENDPOINT HIT:', new Date().toISOString(), {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });
  
  // Get Stripe client for webhook operations
  const stripe = await getStripeClient();
  
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('🔍 Webhook received:', {
    hasSignature: !!sig,
    hasEndpointSecret: !!endpointSecret,
    bodyType: typeof req.body,
    bodyLength: req.body?.length || 0,
    isBuffer: Buffer.isBuffer(req.body),
    signaturePrefix: sig ? (typeof sig === 'string' ? sig.substring(0, 20) + '...' : 'array') : 'none'
  });

  if (!sig || !endpointSecret) {
    console.error('❌ Missing webhook requirements:', { hasSignature: !!sig, hasEndpointSecret: !!endpointSecret });
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  // Ensure we have the raw body as a Buffer from express.raw() middleware
  let payload = req.body;
  
  console.log('🔍 Raw payload analysis:', {
    isBuffer: Buffer.isBuffer(payload),
    type: typeof payload,
    length: payload?.length,
    constructorName: payload?.constructor?.name
  });

  // For Stripe webhook verification, we need the raw body as received
  if (!Buffer.isBuffer(payload)) {
    console.error('❌ Payload is not a buffer. Middleware configuration issue.');
    return res.status(400).json({ error: 'Invalid payload format' });
  }

  let event;

  try {
    // Extract signature properly - handle both string and array cases
    const signature = Array.isArray(sig) ? sig[0] : sig;
    
    console.log('🔍 Processing signature verification:', {
      signature: signature.substring(0, 50) + '...',
      payloadLength: payload.length,
      secretLength: endpointSecret.length
    });

    // Use the raw buffer directly for signature verification
    event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    console.log('✅ Webhook signature verified successfully for event:', event.type);
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message);
    console.error('🔍 Detailed debug info:', {
      payloadType: typeof payload,
      payloadLength: payload?.length,
      signatureType: typeof sig,
      signatureValue: Array.isArray(sig) ? `Array[${sig.length}]` : sig?.substring(0, 50) + '...',
      secretExists: !!endpointSecret,
      secretPrefix: endpointSecret ? endpointSecret.substring(0, 15) + '...' : 'none',
      isBuffer: Buffer.isBuffer(payload),
      errorStack: err.stack
    });
    
    // Strict security - reject all invalid signatures in production
    // Only allow bypass in development with explicit flag for testing
    const allowDevBypass = process.env.STRIPE_WEBHOOK_DEV_BYPASS === 'true' && 
                          (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
    
    if (allowDevBypass) {
      console.log('⚠️ DEVELOPMENT BYPASS: Processing webhook despite signature verification failure');
      console.log('⚠️ This bypass should NEVER be enabled in production!');
      try {
        // Parse the raw body as JSON to get the event data
        const eventData = JSON.parse(payload.toString());
        event = eventData;
        console.log('✅ Parsed webhook event in development mode:', event.type);
      } catch (parseErr) {
        console.error('❌ Failed to parse webhook payload in development mode:', parseErr);
        return res.status(400).json({ error: 'Invalid payload format' });
      }
    } else {
      // Security: Always reject invalid signatures in production or when bypass is disabled
      console.error('🚨 Webhook signature verification failed - rejecting request for security');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }

  // Handle the event - process webhooks securely
  console.log('📥 Processing webhook event:', event.type);
  const now = Date.now();
  cleanupRecentWebhookEvents(now);
  // Task #219 + #222: events whose contract is "persistence-required" must
  // NEVER be acknowledged 200 unless a durable row exists for them. Task #219
  // covers payment_intent.succeeded (stripe_payment_history); Task #222 adds
  // the three refund events (refund_events).
  const REFUND_PERSISTENCE_EVENTS = new Set([
    'charge.refunded',
    'refund.updated',
    'refund.failed',
  ]);
  const isPersistenceRequiredEvent = (t: string): boolean =>
    t === 'payment_intent.succeeded' || REFUND_PERSISTENCE_EVENTS.has(t);

  if (event?.id && recentWebhookEvents.has(event.id)) {
    console.log('↩️ Duplicate webhook event received, acknowledging without reprocessing:', event.id);
    // Replay path: look up the persisted row by stripe_event_id. For
    // persistence-required events a missing row means the prior attempt failed
    // before persisting — we must NOT acknowledge; return 5xx so Stripe retries.
    let persistedRowId: number | null = null;
    try {
      if (REFUND_PERSISTENCE_EVENTS.has(event.type)) {
        const existing = await storage.getRefundEventByEventId(event.id);
        persistedRowId = existing?.id ?? null;
      } else {
        const existing = await storage.getStripePaymentByEventId(event.id);
        persistedRowId = existing?.id ?? null;
      }
    } catch (lookupErr) {
      console.warn('[Task#219][Webhook][replay] failed to look up persisted row by event id', {
        eventId: event.id,
        eventType: event.type,
        error: (lookupErr as Error).message,
      });
    }
    if (isPersistenceRequiredEvent(event.type) && persistedRowId === null) {
      // Eject from the in-memory dedup cache so a Stripe retry can re-enter
      // the full handler instead of re-hitting this same replay branch.
      recentWebhookEvents.delete(event.id);
      console.error('[Task#219][Webhook][replay] persistence-required event has no persisted row — refusing to ack', {
        eventId: event.id,
        eventType: event.type,
      });
      return res.status(500).json({
        error: 'Persistence row missing for persistence-required event',
        event_type: event.type,
        eventId: event.id,
      });
    }
    return res.json({
      received: true,
      event_type: event.type,
      handled: true,
      duplicate: true,
      persistedRowId,
    });
  }
  // Task #219: do NOT add to dedup cache yet. We add only after a successful
  // 2xx response is sent, so a 5xx (Stripe retry) is never suppressed by
  // an entry left over from a failed first attempt.

  // Task #219: Track the stripe_payment_history row id persisted for this event
  // so the 2xx response can return it. A persistence-required path that ends
  // with a null id throws to surface a 5xx (Stripe will retry).
  let persistedRowId: number | null = null;

  // Task #219: typed marker error for the persistence-claim path. The inner
  // case-level catch swallows generic errors but re-throws this one so the
  // outer handler can return 5xx. Replaces ad-hoc `(err as any).taskId = 219`.
  class PersistenceClaimError extends Error {
    readonly taskId = 219 as const;
    constructor(message: string, public override readonly cause?: unknown) {
      super(message);
      this.name = 'PersistenceClaimError';
    }
  }

  try {
    switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('🛒 Checkout session completed:', session.id);
      
      try {
        // Check if this is a fundraiser order (uses session metadata directly)
        if (session.metadata?.type === 'fundraiser_order') {
          console.log('🎁 Processing fundraiser order:', session.id);
          
          const campaignId = parseInt(session.metadata.campaignId);
          const familyLinkId = parseInt(session.metadata.familyLinkId);
          const userId = parseInt(session.metadata.userId);
          const customerName = session.metadata.customerName;
          const customerEmail = session.metadata.customerEmail;
          const customerPhone = session.metadata.customerPhone || null;
          const totalCents = parseInt(session.metadata.totalCents);
          const creditEarnedCents = parseInt(session.metadata.creditEarnedCents);
          const items = JSON.parse(session.metadata.items || '[]');
          
          // Get campaign and family link for school context
          const campaign = await storage.getFundraiserCampaignById(campaignId);
          const familyLink = await storage.getFundraiserFamilyLinkById(familyLinkId);
          
          if (!campaign || !familyLink) {
            console.error('❌ Fundraiser order error: Campaign or family link not found');
            break;
          }
          
          // Create the fundraiser order
          const order = await storage.createFundraiserOrder({
            campaignId,
            familyLinkId,
            sellerUserId: userId,
            customerName,
            customerEmail,
            customerPhone,
            totalCents,
            creditEarnedCents,
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent as string,
            status: 'paid',
          });
          
          console.log('✅ Created fundraiser order:', order.id);
          
          // Create order items
          for (const item of items) {
            await storage.createFundraiserOrderItem({
              orderId: order.id,
              productId: item.productId,
              quantity: item.quantity,
              priceCents: item.unitPriceCents,
              creditAmountCents: item.creditAmountCents,
            });
          }
          
          console.log(`✅ Created ${items.length} order items for order ${order.id}`);
          
          // Create credit for the seller
          if (creditEarnedCents > 0) {
            const credit = await storage.createCredit({
              schoolId: campaign.schoolId,
              userId: userId,
              creditType: 'fundraiser',
              creditAmountCents: creditEarnedCents,
              status: 'approved', // Auto-approve fundraiser credits
              title: `Fundraiser: ${campaign.name}`,
              notes: `Order #${order.id}`,
            });
            
            // Update the order with the linked credit
            await storage.updateFundraiserOrder(order.id, { creditId: credit.id });
            
            console.log(`✅ Created fundraiser credit ${credit.id} for ${creditEarnedCents} cents to user ${userId}`);
          }
          
          console.log(`✅ Fundraiser order ${order.id} processed successfully`);
          
          break;
        }
        
        // Get the payment intent from the session (for non-fundraiser orders)
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
        console.log('💳 Retrieved payment intent from session:', paymentIntent.id);

        // Durable idempotency guard:
        // checkout.session.completed and payment_intent.succeeded can both arrive for the same PI.
        // Payment records persist to DB/file storage, so this protects against duplicate enrollment updates
        // even across process restarts.
        const alreadyRecordedPayment = await storage.getPaymentByStripeId(paymentIntent.id);
        if (alreadyRecordedPayment) {
          console.log('↩️ Checkout session already reflected in payment history, skipping duplicate processing:', paymentIntent.id);
          break;
        }
        
        // Process the checkout session payment - same logic as payment_intent.succeeded
        const itemsJson = paymentIntent.metadata.itemsJson;
        const paymentType = paymentIntent.metadata.paymentType;
        const parentEmail = paymentIntent.metadata.parentEmail;
        
        console.log('🛒 Processing checkout session payment:', {
          paymentType,
          parentEmail,
          hasItemsJson: !!itemsJson,
          sessionId: session.id,
          paymentIntentId: paymentIntent.id
        });
        
        if (itemsJson && parentEmail) {
          const items = JSON.parse(itemsJson);
          console.log('💰 Processing checkout payment enrollments:', items.length, 'items for', parentEmail);
          
          // IDEMPOTENCY-FIRST: Attempt to claim this event by inserting into stripe_payment_history
          // with a unique idempotency_key before performing any side effects. If the insert fails
          // with a unique constraint violation, this event was already processed — exit immediately.
          // This is race-safe: two concurrent deliveries of the same event will compete on the DB insert,
          // and only one will win; the other gets a unique violation and skips.
          const idempotencyKey = `checkout:${session.id}`;
          const parentUserForSession = await storage.getUserByEmail(parentEmail);
          
          // Build description upfront (needed for stripe_payment_history insert)
          const allChildNamesEarly = [...new Set(items.map((i: any) => i.childName))].join(', ');
          const paymentDescriptionEarly = items.length > 1
            ? `Checkout payment for ${allChildNamesEarly}`
            : `Checkout payment for ${items[0]?.childName || 'student'}`;
          
          let stripeHistoryRecord: { id: number } | null = null;
          if (parentUserForSession) {
            try {
              stripeHistoryRecord = await storage.saveStripePayment({
                userId: parentUserForSession.id,
                paymentIntentId: paymentIntent.id,
                customerId: (paymentIntent.customer as string) || null,
                subscriptionId: null,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency || 'usd',
                status: 'succeeded',
                paymentMethod: null,
                description: paymentDescriptionEarly,
                idempotencyKey,
                source: 'stripe',
                snapshotJson: null,
                snapshotChecksum: null,
                subtotalAmount: null,
                discountTotal: null,
                discountSnapshot: null,
                stripeCreatedAt: new Date(),
              });
              console.log('🔒 Claimed checkout event via stripe_payment_history:', stripeHistoryRecord.id, 'key:', idempotencyKey);
            } catch (historyErr: any) {
              // Check for unique constraint violation (duplicate event)
              const isUniquenessViolation = 
                historyErr?.code === '23505' || // Postgres unique violation
                historyErr?.message?.includes('unique') ||
                historyErr?.message?.includes('duplicate');
              if (isUniquenessViolation) {
                console.log('⚠️ Duplicate checkout.session.completed detected via unique constraint — skipping event', session.id);
                break;
              }
              // Belt-and-suspenders: also check payments table for legacy records
              const alreadyInPayments = await storage.getPaymentByStripeId(paymentIntent.id);
              if (alreadyInPayments) {
                console.log('⚠️ checkout.session.completed already in payments table — skipping:', paymentIntent.id);
                break;
              }
              console.error('⚠️ stripe_payment_history insert failed (proceeding without allocation records):', historyErr);
            }
          } else {
            // No user found — fall back to payments-table idempotency check
            const alreadyInPayments = await storage.getPaymentByStripeId(paymentIntent.id);
            if (alreadyInPayments) {
              console.log('⚠️ checkout.session.completed already in payments table — skipping:', paymentIntent.id);
              break;
            }
          }
          
          // Check if membership was included in this payment
          const hasMembership = paymentIntent.metadata.hasMembership === 'true';
          const membershipAmount = hasMembership ? parseInt(paymentIntent.metadata.membershipAmount || '0') : 0;
          
          // CRITICAL FIX: Subtract membership from total before dividing among class enrollments
          const amountForClasses = paymentIntent.amount - membershipAmount;
          const amountPerItem = items.length > 0 ? Math.round(amountForClasses / items.length) : 0;
          
          console.log('💰 Payment allocation:', {
            totalPayment: paymentIntent.amount,
            membershipAmount,
            amountForClasses,
            amountPerItem,
            itemCount: items.length
          });
          
          // Process membership payment first (if included)
          if (hasMembership && membershipAmount > 0) {
            try {
              const membershipParentUserId = parseInt(paymentIntent.metadata.membershipParentUserId || '0');
              const membershipSchoolId = parseInt(paymentIntent.metadata.membershipSchoolId || '0');
              const membershipYear = parseInt(paymentIntent.metadata.membershipYear || new Date().getFullYear().toString());
              
              console.log('🎫 Processing membership payment:', {
                parentUserId: membershipParentUserId,
                schoolId: membershipSchoolId,
                amount: membershipAmount,
                year: membershipYear
              });
              
              // Find or create membership enrollment
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
              } else {
                // Create new membership enrollment
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
                  notes: `Checkout session payment (${paymentIntent.id})`,
                  startDate: now,
                  renewalDate: expirationDate
                });
                console.log(`✅ Created new membership enrollment for parent ${membershipParentUserId}`);
              }
            } catch (membershipError) {
              console.error('❌ Error processing membership payment:', membershipError);
            }
          }
          
          // Update each class enrollment in database
          // Shared with payment_intent.succeeded — see applyCartCheckoutItemsFromWebhook above.
          const updatedEnrollments = await applyCartCheckoutItemsFromWebhook(items, paymentIntent);

          console.log(`✅ Updated ${updatedEnrollments.length} enrollments for checkout session ${session.id}`);
          
          // Build all-children description for payment history
          // (reuse allChildNamesEarly/paymentDescriptionEarly computed above for the history record)
          const allChildNames = allChildNamesEarly;
          const paymentDescription = paymentDescriptionEarly;
          
          // Create payment record in database — full checkout total (not per-enrollment split)
          const schoolIdForSession = parentUserForSession?.schoolId || (updatedEnrollments[0] as any)?.schoolId || 1;
          
          const payment = {
            schoolId: schoolIdForSession,
            parentId: parentUserForSession?.id || null,
            parentEmail: parentEmail,
            childName: allChildNames || items[0]?.childName || 'Unknown',
            className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
            description: paymentDescription,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency || 'usd',
            status: 'completed' as const,
            stripePaymentIntentId: paymentIntent.id,
            stripeChargeId: null,
            stripeRefundId: null,
            originalPaymentId: null,
            enrollmentIds: updatedEnrollments.map((e: any) => e.id),
            metadata: {
              checkoutSessionId: session.id,
              itemCount: items.length
            },
            paymentDate: new Date()
          };

          await storage.createPayment(payment);
          console.log('✅ Payment record created in database for checkout session:', session.id);
          
          // Create payment_allocation records per enrollment
          // stripeHistoryRecord was created at the top of this block (idempotency-first insert);
          if (stripeHistoryRecord && updatedEnrollments.length > 0) {
            try {
              const allocations = updatedEnrollments.map((enrollment: any) => ({
                paymentHistoryId: stripeHistoryRecord!.id,
                enrollmentId: enrollment.id,
                membershipEnrollmentId: null,
                allocatedAmountCents: amountPerItem,
                allocationType: 'payment' as const,
                sourceAllocationId: null,
                adminComment: null,
                metadata: { checkoutSessionId: session.id, paymentIntentId: paymentIntent.id },
              }));
              await storage.createPaymentAllocations(allocations);
              console.log(`✅ Created ${allocations.length} payment_allocation records for checkout session ${session.id}`);
            } catch (allocErr) {
              console.error('⚠️ Failed to create payment_allocations (non-fatal):', allocErr);
            }
          }
          
          // Create payment receipt record for parent documents
          await createReceiptFromPayment({
            schoolId: schoolIdForSession,
            parentId: parentUserForSession?.id,
            parentEmail: parentEmail,
            amount: paymentIntent.amount,
            description: paymentDescription,
            childName: allChildNames || items[0]?.childName || 'Unknown',
            className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
            enrollmentIds: updatedEnrollments.map((e: any) => e.id)
          });
        }
        
      } catch (error) {
        console.error('❌ Error processing checkout session:', error);
      }
      break;

    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('💳 Payment succeeded:', paymentIntent.id);
      console.log('🔍 Payment metadata:', paymentIntent.metadata);
      
      try {
        // ============================================================
        // Task #219 — PERSISTENCE-FIRST IDEMPOTENCY CLAIM
        // ============================================================
        // ARCHITECTURAL_PATTERNS.md §9 + §16: a successful Stripe event MUST persist a
        // row to stripe_payment_history keyed by stripe_event_id BEFORE any side-effect
        // logic runs and BEFORE any skip branch can swallow the event. The unique
        // constraint on stripe_event_id is the race-safe enforcement point.
        //
        // Behavior:
        //   - INSERT-first; on 23505 unique violation lookup the existing row and
        //     return its id (idempotent replay).
        //   - On 23505 against payment_intent_id (e.g. checkout.session.completed
        //     already claimed this PI), reuse that row's id.
        //   - On any other DB error: throw → outer catch returns 500 → Stripe retries.
        //   - If parentEmail metadata is missing we cannot satisfy the FK to users;
        //     log WARN and proceed without persistence (these are legacy non-cart
        //     paths — scheduled-payment + cart paths always set parentEmail).
        const claimParentEmail = paymentIntent.metadata?.parentEmail;
        const claimParentUser = claimParentEmail
          ? await storage.getUserByEmail(claimParentEmail)
          : null;
        if (claimParentUser) {
          try {
            // Task #219 — fault injection hook for the regression test's
            // "persistence failure → 5xx" property. Gated to non-production
            // environments so a malicious header in prod cannot trigger it.
            if (
              process.env.NODE_ENV !== 'production' &&
              req.headers['x-task-219-fault-inject-persistence'] === 'true'
            ) {
              throw new PersistenceClaimError(
                'TASK_219_FAULT_INJECT_PERSISTENCE: synthetic DB failure (test header)',
              );
            }
            const claimed = await storage.saveStripePayment({
              userId: claimParentUser.id,
              paymentIntentId: paymentIntent.id,
              stripeEventId: event.id,
              customerId: (paymentIntent.customer as string) || null,
              subscriptionId: null,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'succeeded',
              paymentMethod: null,
              description: `payment_intent.succeeded ${paymentIntent.id}`,
              idempotencyKey: `pi_succeeded:${event.id}`,
              source: 'stripe',
              snapshotJson: null,
              snapshotChecksum: null,
              subtotalAmount: null,
              discountTotal: null,
              discountSnapshot: null,
              stripeCreatedAt: new Date(paymentIntent.created * 1000),
            });
            persistedRowId = claimed.id;
            console.log('🔒 [Task#219] claimed payment_intent.succeeded in stripe_payment_history', {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
              persistedRowId,
            });
          } catch (claimErr: unknown) {
            // PersistenceClaimError already carries `taskId = 219` — let it bubble.
            if (claimErr instanceof PersistenceClaimError) throw claimErr;
            const errObj = claimErr as { code?: string; message?: string } | null;
            const isUnique =
              errObj?.code === '23505' ||
              /unique|duplicate/i.test(errObj?.message || '');
            if (isUnique) {
              // Replay or sibling event already wrote a row. Find it.
              const byEvent = await storage.getStripePaymentByEventId(event.id);
              const existing = byEvent ?? await storage.getStripePaymentByIntentId(paymentIntent.id);
              if (!existing) {
                throw new PersistenceClaimError(
                  `[Task#219] unique violation on saveStripePayment but no existing row found for event=${event.id} pi=${paymentIntent.id}`,
                  claimErr,
                );
              }
              persistedRowId = existing.id;
              console.warn('[Task#219][Webhook][replay] event already persisted — reusing row', {
                eventId: event.id,
                eventType: event.type,
                paymentIntentId: paymentIntent.id,
                persistedRowId,
                reason: byEvent ? 'duplicate_event_id' : 'duplicate_payment_intent_id',
              });
              // Idempotent replay: do not re-run downstream side effects.
              break;
            }
            // Genuine DB failure → propagate to outer catch → 500 → Stripe retries.
            throw new PersistenceClaimError(
              `[Task#219] saveStripePayment failed for event=${event.id} pi=${paymentIntent.id}: ${errObj?.message ?? String(claimErr)}`,
              claimErr,
            );
          }
        } else {
          const skipMissing = {
            eventId: event.id,
            eventType: event.type,
            paymentIntentId: paymentIntent.id,
            reason: 'missing_parent_email',
            metadataKey: 'parentEmail',
            metadataValue: claimParentEmail ?? null,
            persistedRowId,
          };
          console.warn('[Task#219][Webhook][skip] payment_intent.succeeded missing parentEmail — cannot persist (no user FK)', skipMissing);
          recordTask219Skip(skipMissing);
        }
        // ============================================================

        // CRITICAL: Skip cart-checkout payments' DOWNSTREAM business logic —
        // checkout.session.completed is the single source of truth for cart side
        // effects (enrollment updates, allocations, receipts). Persistence above
        // already guaranteed exactly one stripe_payment_history row.
        //
        // Detection strategy (four independent signals, cheapest first):
        //   1. metadata.paymentType === 'cart_checkout'  (set by this app's checkout flow)
        //   2. metadata.itemsJson is present              (only set on cart checkout payment intents)
        //   3. Stripe API: checkout.sessions.list confirms an associated Checkout Session
        //      whose own metadata also indicates a cart checkout (explicit checkout_session_id signal)
        //   4. stripe_payment_history has a record with idempotency_key = 'checkout:<sessionId>'
        //      — i.e., checkout.session.completed already claimed this payment
        //
        // Signals 1 or 2 are checked first (cheap), then 3 (Stripe API), then 4 (DB lookup).
        const isCartCheckoutByMetadata = 
          paymentIntent.metadata?.paymentType === 'cart_checkout' ||
          !!paymentIntent.metadata?.itemsJson;
        
        if (isCartCheckoutByMetadata) {
          const skipCartMeta = {
            eventId: event.id,
            eventType: event.type,
            paymentIntentId: paymentIntent.id,
            reason: 'cart_checkout_metadata_signal',
            metadataKey: paymentIntent.metadata?.paymentType === 'cart_checkout' ? 'paymentType' : 'itemsJson',
            metadataValue: paymentIntent.metadata?.paymentType === 'cart_checkout'
              ? 'cart_checkout'
              : '<itemsJson present>',
            persistedRowId,
          };
          console.warn('[Task#219][Webhook][skip] payment_intent.succeeded — cart-checkout downstream owned by checkout.session.completed', skipCartMeta);
          recordTask219Skip(skipCartMeta);
          break;
        }

        // Signal 3: explicit checkout_session_id check via Stripe API
        // For PaymentIntents created through Checkout Sessions, list associated sessions.
        // If the session's own metadata confirms cart checkout, this PI is owned by checkout.session.completed.
        // Task #219 — fault-injection hook for the regression test's
        // `stripe_api_checkout_session_match` skip-branch coverage. Gated to
        // non-production so a malicious header in prod cannot trigger it.
        // When set, synthesize the same skip outcome the real
        // stripe.checkout.sessions.list match would produce.
        if (
          process.env.NODE_ENV !== 'production' &&
          req.headers['x-task-219-fake-stripe-checkout-session-match'] === 'true'
        ) {
          const skipApiMatch = {
            eventId: event.id,
            eventType: event.type,
            paymentIntentId: paymentIntent.id,
            reason: 'stripe_api_checkout_session_match',
            metadataKey: 'session.metadata.paymentType',
            metadataValue: 'cart_checkout',
            persistedRowId,
          };
          console.warn('[Task#219][Webhook][skip] payment_intent.succeeded — Stripe API confirms cart-checkout origin (fault-injected)', {
            ...skipApiMatch,
            checkoutSessionId: 'cs_test_fault_inject',
            checkoutStatus: 'complete',
          });
          recordTask219Skip(skipApiMatch);
          break;
        }
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntent.id,
            limit: 1,
          });
          if (sessions.data.length > 0) {
            const checkoutSession = sessions.data[0];
            const sessionIsCartCheckout =
              checkoutSession.metadata?.paymentType === 'cart_checkout' ||
              !!checkoutSession.metadata?.itemsJson;
            if (sessionIsCartCheckout) {
              const skipApiMatch = {
                eventId: event.id,
                eventType: event.type,
                paymentIntentId: paymentIntent.id,
                reason: 'stripe_api_checkout_session_match',
                metadataKey: checkoutSession.metadata?.paymentType === 'cart_checkout' ? 'session.metadata.paymentType' : 'session.metadata.itemsJson',
                metadataValue: checkoutSession.metadata?.paymentType ?? '<itemsJson present>',
                persistedRowId,
              };
              console.warn('[Task#219][Webhook][skip] payment_intent.succeeded — Stripe API confirms cart-checkout origin', {
                ...skipApiMatch,
                checkoutSessionId: checkoutSession.id,
                checkoutStatus: checkoutSession.status,
              });
              recordTask219Skip(skipApiMatch);
              break;
            }
          }
        } catch (listErr) {
          console.warn('⚠️ stripe.checkout.sessions.list lookup failed (non-fatal, continuing):', listErr);
        }
        
        // Signal 4: check if checkout.session.completed already processed this via stripe_payment_history.
        // Task #219: discriminate by idempotency_key prefix — our own pi_succeeded:* row (just
        // inserted at the top of this case) must not be misread as a checkout-owned row, otherwise
        // every non-cart event would skip its downstream business logic.
        const alreadyClaimedByCheckout = await storage.getStripePaymentByIntentId(paymentIntent.id);
        if (alreadyClaimedByCheckout && alreadyClaimedByCheckout.idempotencyKey?.startsWith('checkout:')) {
          persistedRowId = alreadyClaimedByCheckout.id;
          const skipCheckoutOwns = {
            eventId: event.id,
            eventType: event.type,
            paymentIntentId: paymentIntent.id,
            reason: 'checkout_session_completed_already_owns',
            metadataKey: 'idempotency_key',
            metadataValue: alreadyClaimedByCheckout.idempotencyKey,
            persistedRowId,
          };
          console.warn('[Task#219][Webhook][skip] payment_intent.succeeded — checkout.session.completed already owns this PI', {
            ...skipCheckoutOwns,
            historyId: alreadyClaimedByCheckout.id,
          });
          recordTask219Skip(skipCheckoutOwns);
          break;
        }
        
        // Check if this is a balance payment or new enrollment
        const paymentType = paymentIntent.metadata.paymentType || paymentIntent.metadata.type;
        console.log('🔍 Payment type:', paymentType);
        
        // Check if this payment was already processed (to avoid double processing).
        // We intentionally do NOT skip when the existing row is still pending:
        // create-payment-intent pre-inserts pending payments before Stripe confirms.
        // Skipping here caused "charged but balance unchanged" incidents.
        const existingPayment = await storage.getPaymentByStripeId(paymentIntent.id);
        let hadPreexistingPendingPayment = false;
        if (existingPayment) {
          if (existingPayment.status === 'pending') {
            console.log('ℹ️ Existing payment row is pending; continuing webhook processing:', paymentIntent.id);
            await storage.updatePaymentStatus(existingPayment.id, 'succeeded');
            hadPreexistingPendingPayment = true;
          } else {
            console.log('⚠️ Payment already processed, skipping:', paymentIntent.id, 'status:', existingPayment.status);
            break;
          }
        }
        
        // PaymentProcessor integration (dual-write mode during rollout)
        if (isPaymentProcessorEnabled() && await checkSchemaReady()) {
          const parentEmail = paymentIntent.metadata.parentEmail;
          const enrollmentIdsStr = paymentIntent.metadata.enrollmentIds;
          const parentUser = parentEmail ? await storage.getUserByEmail(parentEmail) : null;
          
          if (parentUser && enrollmentIdsStr) {
            try {
              const enrollmentIds = JSON.parse(enrollmentIdsStr);
              const idempotencyKey = generateIdempotencyKey('stripe', paymentIntent.id);
              
              console.log('💳 PaymentProcessor: Processing via unified service', {
                idempotencyKey,
                paymentIntentId: paymentIntent.id,
                enrollmentCount: enrollmentIds.length,
              });
              
              const result = await processPayment({
                idempotencyKey,
                source: 'stripe' as PaymentSource,
                userId: parentUser.id,
                stripePaymentIntentId: paymentIntent.id,
                stripeCustomerId: paymentIntent.customer as string | undefined,
                amountCents: paymentIntent.amount,
                currency: paymentIntent.currency || 'usd',
                enrollmentIds,
                description: `Stripe payment ${paymentIntent.id}`,
                paymentMethod: 'card',
                stripeCreatedAt: new Date(paymentIntent.created * 1000),
                metadata: paymentIntent.metadata,
              });
              
              if (result.success && !result.wasIdempotentHit) {
                console.log('✅ PaymentProcessor: Payment processed successfully - skipping legacy code', {
                  paymentId: result.paymentId,
                  allocations: result.allocations?.length,
                });
                
                // PaymentProcessor handled everything - skip legacy code to prevent duplication
                // Still send receipts and real-time updates (handled separately after the switch)
                break;
              } else if (result.success && result.wasIdempotentHit) {
                console.log('⚠️ PaymentProcessor: Idempotent hit - payment already processed, skipping', {
                  paymentId: result.paymentId,
                });
                break;
              } else {
                console.error('❌ PaymentProcessor: Payment processing failed - falling back to legacy code', {
                  error: result.error,
                  idempotencyKey,
                });
                // Fall through to legacy code on failure
              }
            } catch (processorError) {
              console.error('❌ PaymentProcessor: Exception during processing - falling back to legacy code', processorError);
              // Fall through to legacy code on error
            }
          }
        }
        
        if (paymentType === 'combined_scheduled_payment') {
          const scheduledPaymentIdsStr = paymentIntent.metadata.scheduledPaymentIds;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          console.log(`💰 Processing combined scheduled payment for ${parentEmail}: ${scheduledPaymentIdsStr}`);
          
          if (!scheduledPaymentIdsStr || !parentEmail) {
            console.error('❌ Combined payment missing scheduledPaymentIds or parentEmail metadata');
            break;
          }
          
          const scheduledPaymentIds = scheduledPaymentIdsStr.split(',').map((id: string) => parseInt(id.trim()));
          const creditsAppliedCents = parseInt(paymentIntent.metadata.creditsAppliedCents || '0');
          const originalAmountCents = parseInt(paymentIntent.metadata.originalAmountCents || '0') || paymentIntent.amount;
          const userId = parseInt(paymentIntent.metadata.userId || '0');
          
          let perPaymentAmounts: Record<string, number> = {};
          try {
            perPaymentAmounts = JSON.parse(paymentIntent.metadata.perPaymentAmounts || '{}');
          } catch { /* ignore parse errors */ }
          
          const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);
          const parentUser = await storage.getUserByEmail(parentEmail);
          
          for (const spId of scheduledPaymentIds) {
            const scheduledPayment = allScheduledPayments.find(p => p.id === spId);
            if (!scheduledPayment) {
              console.error(`❌ Combined: Scheduled payment ${spId} not found - skipping`);
              continue;
            }
            
            if (scheduledPayment.status === 'completed') {
              console.log(`✅ Combined: Payment ${spId} already completed (idempotent) - skipping`);
              continue;
            }
            
            await storage.updateScheduledPayment(spId, {
              status: 'completed',
              processedAt: new Date(),
              completionSource: 'stripe_checkout',
            });
            console.log(`✅ Combined webhook: Marked scheduled payment ${spId} as completed`);
            
            const paymentAmount = perPaymentAmounts[spId.toString()] || scheduledPayment.amount;
            
            if (scheduledPayment.enrollmentId) {
              try {
                const enrollment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
                if (enrollment) {
                  const currentAmountPaid = enrollment.totalPaid || 0;
                  const newAmountPaid = currentAmountPaid + paymentAmount;
                  const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid - (enrollment.compAmountCents ?? 0));
                  
                  await storage.updateProgramEnrollment(scheduledPayment.enrollmentId, {
                    totalPaid: newAmountPaid,
                    remainingBalance: newBalance,
                    paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment'
                  });
                  console.log(`✅ Combined webhook: Updated enrollment ${scheduledPayment.enrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);
                }
              } catch (enrollmentError) {
                console.error(`❌ Combined webhook: Error updating enrollment ${scheduledPayment.enrollmentId}:`, enrollmentError);
              }
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
              
              const schoolId = scheduledPayment.schoolId || parentUser?.schoolId || 1;
              
              await storage.createPayment({
                schoolId,
                parentId: parentUser?.id || null,
                parentEmail,
                childName,
                className,
                description: `Combined payment - installment ${scheduledPayment.installmentNumber}/${scheduledPayment.totalInstallments}`,
                amount: paymentAmount,
                currency: paymentIntent.currency || 'usd',
                status: 'completed' as const,
                stripePaymentIntentId: paymentIntent.id,
                stripeChargeId: null,
                stripeRefundId: null,
                originalPaymentId: null,
                enrollmentIds: scheduledPayment.enrollmentId ? [scheduledPayment.enrollmentId] : [],
                metadata: {
                  scheduledPaymentId: spId,
                  paymentType: 'combined_biweekly',
                  combinedPaymentIds: scheduledPaymentIds
                },
                paymentDate: new Date()
              });
              console.log(`✅ Combined webhook: Created payment record for scheduled payment ${spId}`);
            } catch (paymentRecordError) {
              console.error(`⚠️ Combined webhook: Failed to create payment record for ${spId}:`, paymentRecordError);
            }
          }
          
          if (creditsAppliedCents > 0 && userId > 0) {
            try {
              const { usedCredits, totalUsed } = await storage.useCredits(
                userId,
                creditsAppliedCents,
                undefined,
                `Combined payment for ${scheduledPaymentIds.length} installments`
              );
              console.log(`💰 ✅ Combined webhook: Consumed ${totalUsed} cents across ${usedCredits.length} credits`);
            } catch (creditError) {
              console.error('❌ Combined webhook: Failed to consume credits:', creditError);
            }
          }
          
          try {
            const { dataLayer } = await import('./services/dataLayer.js');
            dataLayer.broadcastBillingUpdate(parentEmail, {
              type: 'combined_payment_complete',
              paymentIds: scheduledPaymentIdsStr,
              amount: paymentIntent.amount,
              timestamp: new Date().toISOString()
            });
            dataLayer.broadcastPaymentComplete(parentEmail, {
              amount: paymentIntent.amount,
              paymentId: scheduledPaymentIdsStr,
              description: `Combined payment for ${scheduledPaymentIds.length} installments`,
              timestamp: new Date().toISOString()
            });
            await dataLayer.refreshUserData(parentEmail);
          } catch (rtError) {
            console.error('❌ Combined webhook: Failed to push real-time update:', rtError);
          }
          
          console.log(`✅ Combined scheduled payment processing complete: ${scheduledPaymentIds.length} payments`);
          break;
          
        } else if (paymentType === 'scheduled_payment') {
          // Handle scheduled payment completion
          const scheduledPaymentId = paymentIntent.metadata.scheduledPaymentId;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          console.log(`💰 Processing completed scheduled payment: ${scheduledPaymentId} for ${parentEmail}`);
          
          // Get the scheduled payment from storage
          const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);
          const scheduledPayment = allScheduledPayments.find(p => p.id === parseInt(scheduledPaymentId));
          
          if (!scheduledPayment) {
            console.error(`❌ Scheduled payment ${scheduledPaymentId} not found for parent ${parentEmail} - data anomaly requires manual reconciliation`);
            break;
          }
          
          // Update the scheduled payment status to completed (matches schema enum)
          // completionSource determination: use Stripe metadata 'autoPayInitiated=true' flag.
          // This is written when the PaymentIntent is created by the auto-pay scheduler (before charge),
          // so it is always present and deterministic — no race with chargedBy (which is written after).
          const completionSrc = paymentIntent.metadata.autoPayInitiated === 'true' ? 'stripe_autopay' : 'stripe_checkout';
          await storage.updateScheduledPayment(parseInt(scheduledPaymentId), {
            status: 'completed',
            processedAt: new Date(),
            completionSource: completionSrc,
          });
          console.log(`✅ Marked scheduled payment ${scheduledPaymentId} as completed (source: ${completionSrc})`);
          
          // CONSUME CREDITS if any were applied to this payment
          // If a credit hold session exists (partial-credit auto-pay path), finalize the hold.
          // This prevents double-consumption: the scheduler reserved credits via createCreditHolds;
          // the webhook finalizes them here. If no hold session, fall back to direct useCredits
          // (for backward compatibility with non-auto-pay credit payments).
          const creditsAppliedCents = parseInt(paymentIntent.metadata.creditsAppliedCents || '0');
          const userId = parseInt(paymentIntent.metadata.userId || '0');
          const creditHoldSessionId = paymentIntent.metadata.creditHoldSessionId || '';
          
          if (creditsAppliedCents > 0 && userId > 0) {
            try {
              if (creditHoldSessionId) {
                // Auto-pay partial-credit path: finalize the pre-existing hold
                console.log(`💰 Finalizing credit hold ${creditHoldSessionId} for scheduled payment ${scheduledPaymentId}`);
                const { totalFinalized } = await storage.finalizeCreditHolds(
                  creditHoldSessionId,
                  undefined,
                  `Scheduled payment ${scheduledPaymentId} — installment ${paymentIntent.metadata.installmentNumber}/${paymentIntent.metadata.totalInstallments}`
                );
                console.log(`💰 ✅ Finalized ${totalFinalized} cents via hold ${creditHoldSessionId}`);
              } else {
                // Non-auto-pay path (e.g. checkout with credits): consume directly
                console.log(`💰 Consuming ${creditsAppliedCents} cents of credits for user ${userId}`);
                const { usedCredits, totalUsed } = await storage.useCredits(
                  userId,
                  creditsAppliedCents,
                  undefined,
                  `Scheduled payment ${scheduledPaymentId} — installment ${paymentIntent.metadata.installmentNumber}/${paymentIntent.metadata.totalInstallments}`
                );
                console.log(`💰 ✅ Consumed ${totalUsed} cents across ${usedCredits.length} credit records`);
              }
            } catch (creditError) {
              console.error(`❌ Failed to consume/finalize credits for scheduled payment ${scheduledPaymentId}:`, creditError);
              // Don't fail the webhook - credits can be manually reconciled
            }
          }
            
          // UPDATE ENROLLMENT BALANCE
            console.log('💰 Updating enrollment balance for scheduled payment...');
            
            // CRITICAL: Each scheduled_payment row is for ONE enrollment with exact prorated amount
            // Apply the ENTIRE payment amount to the single enrollment (no division needed)
            const targetEnrollmentId = scheduledPayment.enrollmentId;
            
            if (!targetEnrollmentId) {
              console.error(`❌ Cannot process scheduled payment ${scheduledPaymentId}: no enrollmentId found`);
              console.error('⚠️ Payment recorded in Stripe but enrollment balance NOT updated - requires manual fix');
              break;
            }
            
            console.log('📋 Target enrollment for scheduled payment:', targetEnrollmentId);
            
            try {
              // Get program enrollment from database
              const enrollment = await storage.getProgramEnrollmentById(targetEnrollmentId);
              
              if (enrollment) {
                const currentAmountPaid = enrollment.totalPaid || 0;
                // Apply FULL payment amount to this single enrollment (already prorated when scheduled)
                // Use original amount (Stripe charge + credits applied) for enrollment balance
                const originalAmount = parseInt(paymentIntent.metadata.originalAmountCents || '0') || paymentIntent.amount;
                const totalPaymentAmount = creditsAppliedCents > 0 
                  ? originalAmount  // Use original full amount when credits were applied
                  : paymentIntent.amount;  // Use Stripe amount for non-credit payments
                const newAmountPaid = currentAmountPaid + totalPaymentAmount;
                const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid - (enrollment.compAmountCents ?? 0));
                
                // Update program enrollment in database
                const updatedEnrollment = await storage.updateProgramEnrollment(targetEnrollmentId, {
                  totalPaid: newAmountPaid,
                  remainingBalance: newBalance,
                  paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment'
                });
                
                if (updatedEnrollment) {
                  console.log(`✅ Updated enrollment ${targetEnrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);
                }
              } else {
                console.error(`❌ Enrollment ${targetEnrollmentId} not found for scheduled payment`);
              }
            } catch (error) {
              console.error(`❌ Error updating enrollment ${targetEnrollmentId}:`, error);
            }
            
            // For downstream compatibility, create enrollmentIds array from single target
            const enrollmentIds = [targetEnrollmentId];
            
            // Get enrollment details for payment record
            const enrollmentForPayment = await storage.getProgramEnrollmentById(targetEnrollmentId);
            const paymentChildName = enrollmentForPayment?.childName || 'Child';
            const paymentClassName = enrollmentForPayment?.className || 'Class';
            
            // Get parent user to get schoolId
            const parentUser = await storage.getUserByEmail(parentEmail);
            const schoolId = scheduledPayment.schoolId || parentUser?.schoolId || 1;
            
            const payment = {
              schoolId,
              parentId: parentUser?.id || null,
              parentEmail: parentEmail,
              childName: paymentChildName,
              className: paymentClassName,
              description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: null,
              stripeRefundId: null,
              originalPaymentId: null,
              enrollmentIds: enrollmentIds,
              metadata: {
                scheduledPaymentId: scheduledPaymentId,
                installmentNumber: scheduledPayment.installmentNumber,
                totalInstallments: scheduledPayment.totalInstallments
              },
              paymentDate: new Date()
            };

            await storage.createPayment(payment);
            console.log(`✅ Created payment history record for scheduled payment ${scheduledPaymentId}`);
            
            // Create payment receipt record for parent documents
            await createReceiptFromPayment({
              schoolId,
              parentId: parentUser?.id,
              parentEmail: parentEmail,
              amount: paymentIntent.amount,
              description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments} - ${paymentClassName}`,
              childName: paymentChildName,
              className: paymentClassName,
              enrollmentIds: enrollmentIds
            });
            
            // Send email receipt for scheduled payment
            try {
              const parentUser = await storage.getUserByEmail(parentEmail);
              const parentName = parentUser ? 
                parentUser.name : 
                parentEmail.split('@')[0];

              const formatCurrency = (amount: number) => {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(amount / 100);
              };

              const formatDate = (date: string) => {
                return new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(date));
              };

              await sendPaymentReceipt({
                parentEmail,
                parentName,
                receiptNumber: paymentIntent.id,
                paymentDate: formatDate(new Date().toISOString()),
                paymentMethod: 'Credit Card',
                amount: formatCurrency(paymentIntent.amount),
                childName: paymentChildName,
                className: paymentClassName,
                notes: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`
              });
              
              console.log('📧 Scheduled payment receipt email sent to:', parentEmail);
            } catch (emailError) {
              console.error('❌ Failed to send scheduled payment receipt email:', emailError);
            }
            
            // Add small delay to ensure all storage operations are committed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 🚀 PUSH REAL-TIME UPDATE TO FRONTEND for scheduled payments - AFTER all updates
            try {
              const { dataLayer } = await import('./services/dataLayer.js');
              
              // Send specific billing update with new data
              dataLayer.broadcastBillingUpdate(parentEmail, {
                type: 'scheduled_payment_complete',
                paymentId: scheduledPaymentId,
                amount: paymentIntent.amount,
                totalBalanceFormatted: `$${(paymentIntent.amount / 100).toFixed(2)}`,
                timestamp: new Date().toISOString()
              });
              
              // Also send payment complete notification
              dataLayer.broadcastPaymentComplete(parentEmail, {
                amount: paymentIntent.amount,
                paymentId: scheduledPaymentId,
                description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
                timestamp: new Date().toISOString()
              });
              
              await dataLayer.refreshUserData(parentEmail);
              console.log('📡 Pushed comprehensive real-time billing update to frontend for scheduled payment AFTER storage commit');
            } catch (error) {
              console.error('❌ Failed to push real-time update for scheduled payment:', error);
            }
            
          console.log(`✅ Scheduled payment ${scheduledPaymentId} processing complete`);
          
          // Break out of switch after processing scheduled payment
          break;
          
        } else if (paymentType === 'balance_payment' || paymentType === 'three_payments' || !paymentType) {
          console.log('🔍 Processing balance payment, three_payments plan, or fallback payment...');
          // Handle balance payment - update existing enrollments
          const enrollmentIds = JSON.parse(paymentIntent.metadata.enrollmentIds || '[]');
          const parentEmail = paymentIntent.metadata.parentEmail;
          console.log('💰 Processing payment for enrollments:', enrollmentIds, 'payment type:', paymentType);
          
          if (enrollmentIds.length > 0 && parentEmail) {
            if (hadPreexistingPendingPayment) {
              // Pre-existing pending payment records are authoritative for payment history.
              // Apply enrollment effects only to avoid duplicate financial side effects on replay.
              await applyBalancePaymentToEnrollmentsOnly(paymentIntent, enrollmentIds);
            } else {
              await fulfillMembershipFromCartPaymentIntent(paymentIntent);
              // Calculate payment amount in dollars (Stripe amount is in cents)
              const totalAmount = paymentIntent.amount / 100;

              const { processBalancePayment } = await import('./api/billing.js');
              await processBalancePayment(paymentIntent, parentEmail, enrollmentIds, totalAmount);
            }
            
            console.log('✅ Balance payment processed via webhook for payment type:', paymentType);
          } else {
            console.log('⚠️ Missing enrollment IDs or parent email in payment metadata');
          }
          
          console.log('✅ Balance payment processed for:', paymentIntent.id);
          
          // Note: Real-time update is already sent at the end of processBalancePayment function
          // No need to duplicate it here
          
          // Send email receipt for balance payment
          try {
            const parentEmail = paymentIntent.metadata.parentEmail;
            if (parentEmail) {
              const parentUser = await storage.getUserByEmail(parentEmail);
              const parentName = parentUser ? 
                parentUser.name : 
                parentEmail.split('@')[0];

              // Get first enrollment for display details
              const allEnrollments = await storage.getAllEnrollments();
              const firstEnrollment = allEnrollments.find(e => enrollmentIds.includes(e.id)) as any;
              
              const formatCurrency = (amount: number) => {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(amount / 100);
              };

              const formatDate = (date: string) => {
                return new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(date));
              };

              await sendPaymentReceipt({
                parentEmail,
                parentName,
                receiptNumber: paymentIntent.id,
                paymentDate: formatDate(new Date().toISOString()),
                paymentMethod: 'Credit Card',
                amount: formatCurrency(paymentIntent.amount),
                childName: firstEnrollment?.childName || 'Student',
                className: firstEnrollment?.className || 'Class',
                notes: `Balance payment for ${enrollmentIds.length} enrollment${enrollmentIds.length > 1 ? 's' : ''}`
              });
              
              console.log('📧 Balance payment receipt email sent to:', parentEmail);
              
              // Create payment receipt record for parent documents
              await createReceiptFromPayment({
                schoolId: parentUser?.schoolId || 1,
                parentId: parentUser?.id,
                parentEmail: parentEmail,
                amount: paymentIntent.amount,
                description: `Balance payment for ${enrollmentIds.length} enrollment${enrollmentIds.length > 1 ? 's' : ''}`,
                childName: firstEnrollment?.childName || 'Student',
                className: firstEnrollment?.className || 'Class',
                enrollmentIds
              });
            }
          } catch (emailError) {
            console.error('❌ Failed to send balance payment receipt email:', emailError);
          }
        } else {
          // Unknown payment type — log and skip. Cart-checkout payments are handled by
          // checkout.session.completed and are rejected above via the early-exit guard.
          const skipUnhandled = {
            eventId: event.id,
            eventType: event.type,
            paymentIntentId: paymentIntent.id,
            reason: 'unhandled_payment_type',
            metadataKey: 'paymentType',
            metadataValue: paymentType ?? null,
            persistedRowId,
          };
          console.warn('[Task#219][Webhook][skip] payment_intent.succeeded — unhandled paymentType', skipUnhandled);
          recordTask219Skip(skipUnhandled);
        }

        // AUTO-PAY: Capture payment method ID for future auto-pay charges
        // Only saves on the first successful payment — never overwrites an existing saved card
        try {
          const parentEmailForAutoPay = paymentIntent.metadata.parentEmail;
          if (parentEmailForAutoPay) {
            const parentUserForAutoPay = await storage.getUserByEmail(parentEmailForAutoPay);
            const paymentMethodId = typeof paymentIntent.payment_method === 'string'
              ? paymentIntent.payment_method
              : (paymentIntent.payment_method as any)?.id;

            if (paymentMethodId && parentUserForAutoPay?.stripeCustomerId && !parentUserForAutoPay?.stripeDefaultPaymentMethodId) {
              await stripe.paymentMethods.attach(paymentMethodId, { customer: parentUserForAutoPay.stripeCustomerId });
              await stripe.customers.update(parentUserForAutoPay.stripeCustomerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
              });
              await storage.updateUser(parentUserForAutoPay.id, { stripeDefaultPaymentMethodId: paymentMethodId });
              console.log(`[AutoPay] ✅ Saved payment method ${paymentMethodId} for user ${parentUserForAutoPay.id}`);
            }
          }
        } catch (autoPayErr: any) {
          console.error('[AutoPay] Failed to save payment method (non-fatal):', autoPayErr.message);
        }

      } catch (error: unknown) {
        // Task #219: persistence-claim failures MUST escape this case so the
        // outer handler returns 5xx (Stripe will retry). The PersistenceClaimError
        // class carries `taskId === 219`; we also accept any error tagged with
        // that marker to be defensive against re-thrown wrappers.
        const tagged = (error as { taskId?: number } | null)?.taskId === 219;
        if (error instanceof PersistenceClaimError || tagged) {
          throw error;
        }
        console.error('❌ Error processing payment:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      console.log('❌ Payment failed:', failedPayment.id);
      
      // Handle scheduled payment failure — enforce retry cap, then reset or permanently fail
      if (failedPayment.metadata.paymentType === 'scheduled_payment') {
        const failedScheduledPaymentId = failedPayment.metadata.scheduledPaymentId;
        if (failedScheduledPaymentId) {
          try {
            await handleScheduledPaymentFailed(parseInt(failedScheduledPaymentId), {
              parentEmail: failedPayment.metadata.parentEmail,
              creditHoldSessionId: failedPayment.metadata.creditHoldSessionId,
              lastPaymentErrorMessage: failedPayment.last_payment_error?.message,
            });
          } catch (resetError) {
            console.error(`❌ Failed to update scheduled payment ${failedScheduledPaymentId} after failure:`, resetError);
          }
        }
      }

      if (failedPayment.metadata.paymentType === 'combined_scheduled_payment') {
        const failedPaymentIdsStr = failedPayment.metadata.scheduledPaymentIds;
        if (failedPaymentIdsStr) {
          try {
            const failedIds = failedPaymentIdsStr.split(',').map((id: string) => parseInt(id.trim()));
            const parentEmail = failedPayment.metadata.parentEmail;
            console.log(`🔓 Handling ${failedIds.length} failed combined payments — applying retry cap`);

            // Release any credit hold created during the partial-credit combined auto-pay path
            const combinedCreditHoldSessionId = failedPayment.metadata.creditHoldSessionId;
            if (combinedCreditHoldSessionId) {
              try {
                await storage.releaseCreditHolds(combinedCreditHoldSessionId);
                console.log(`🔓 Released credit hold ${combinedCreditHoldSessionId} after async combined payment failure`);
              } catch (holdReleaseErr: any) {
                console.error(`❌ Could not release combined credit hold ${combinedCreditHoldSessionId}:`, holdReleaseErr.message);
              }
            }

            const existingPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);

            for (const spId of failedIds) {
              const existing = existingPayments.find(p => p.id === spId);
              if (existing && existing.status === 'processing') {
                const existingMeta = (existing.metadata as Record<string, any>) || {};
                const newRetryCount = (existing.retryCount ?? 0) + 1;
                const exhausted = newRetryCount >= AUTOPAY_MAX_RETRIES;
                await storage.updateScheduledPayment(spId, {
                  status: exhausted ? 'failed' : 'pending',
                  retryCount: newRetryCount,
                  failureReason: exhausted
                    ? `Exceeded ${AUTOPAY_MAX_RETRIES} auto-pay attempts. Manual payment required.`
                    : (failedPayment.last_payment_error?.message || 'Combined payment failed'),
                  metadata: {
                    ...existingMeta,
                    combinedPaymentGroup: undefined,
                    lastFailedAt: new Date().toISOString(),
                  },
                });
              }
            }
            console.log(`✅ Processed ${failedIds.length} combined scheduled payments after failure`);
          } catch (resetError) {
            console.error('❌ Failed to process combined scheduled payments after failure:', resetError);
          }
        }
      }
      break;

    case 'charge.refunded': {
      // ============================================================
      // Task #222 — Persistence-first refund webhook handler.
      //
      // Bug A (silent failure): the legacy handler called
      // storage.getPaymentByStripeId() which only checks the legacy
      // `payments` table. Unified-processor charges live ONLY in
      // `stripe_payment_history`, so refunds against unified payments
      // hit `if (!originalPayment) break;` and were silently dropped.
      //
      // Bug B (no event durability): the prior handler did all its
      // idempotency on the side-effect rows (payments table) — there
      // was no row representing "we received and acknowledged Stripe
      // event X". A crash between side effects + 200 ack would leave
      // partial state with no audit trail.
      //
      // Fix: INSERT-first into `refund_events` keyed on a UNIQUE
      // stripe_event_id (DB-level, race-safe). Side effects then
      // proceed and the row is updated to processing_status='processed'.
      // Lookups try BOTH `payments` AND `stripe_payment_history`.
      // ============================================================
      const refundEvent = event.data.object as Stripe.Charge;
      console.log('🔄 Refund processed:', refundEvent.id);

      const paymentIntentId = (refundEvent.payment_intent as string) || null;
      const stripeRefunds = refundEvent.refunds?.data || [];
      if (stripeRefunds.length === 0) {
        // Cannot persist a refund event without a refund id — surface a
        // structured skip and break (no 5xx; the event is malformed).
        const skip = {
          eventId: event.id,
          eventType: event.type,
          refundId: null,
          paymentIntentId,
          reason: 'no_refund_data_in_event',
          metadataKey: 'refunds.data',
          metadataValue: '[]',
          persistedRowId: null,
        };
        console.warn('[Task#222][Webhook][skip] charge.refunded carried no refunds.data', skip);
        recordTask222Skip(skip);
        break;
      }
      const latestRefund = stripeRefunds[stripeRefunds.length - 1];
      const refundAmountCents = latestRefund.amount;

      // ---- Persistence-first claim --------------------------------
      // Mirror Task #219's pattern: INSERT first; on 23505 unique
      // violation reuse the existing row. Anything else throws into
      // the outer catch → 500 → Stripe retries.
      let refundEventRow: { id: number; processingStatus: string } | null = null;
      let isReplay = false;
      try {
        if (
          process.env.NODE_ENV !== 'production' &&
          req.headers['x-task-222-fault-inject-persistence'] === 'true'
        ) {
          throw new PersistenceClaimError(
            'TASK_222_FAULT_INJECT_PERSISTENCE: synthetic DB failure (test header)',
          );
        }
        const insertPayload: InsertRefundEvent = {
          stripeEventId: event.id,
          stripeRefundId: latestRefund.id,
          stripeChargeId: (latestRefund.charge as string) || refundEvent.id || null,
          stripePaymentIntentId: paymentIntentId,
          eventType: 'charge.refunded',
          amountCents: refundAmountCents,
          currency: latestRefund.currency || refundEvent.currency || 'usd',
          refundStatus: latestRefund.status || null,
          reason: latestRefund.reason || null,
          failureReason: latestRefund.failure_reason ?? null,
          originalPaymentId: null,
          originalPaymentHistoryId: null,
          processingStatus: 'persisted',
          rawEvent: event,
        };
        const claimed = await storage.saveRefundEvent(insertPayload);
        refundEventRow = { id: claimed.id, processingStatus: claimed.processingStatus };
        persistedRowId = claimed.id;
        console.log('🔒 [Task#222] claimed charge.refunded in refund_events', {
          eventId: event.id,
          refundId: latestRefund.id,
          persistedRowId,
        });
      } catch (claimErr: unknown) {
        if (claimErr instanceof PersistenceClaimError) throw claimErr;
        const errObj = claimErr as { code?: string; message?: string } | null;
        const isUnique =
          errObj?.code === '23505' ||
          /unique|duplicate/i.test(errObj?.message || '');
        if (isUnique) {
          const existing = await storage.getRefundEventByEventId(event.id);
          if (!existing) {
            throw new PersistenceClaimError(
              `[Task#222] unique violation on saveRefundEvent but no existing row for event=${event.id}`,
              claimErr,
            );
          }
          refundEventRow = { id: existing.id, processingStatus: existing.processingStatus };
          persistedRowId = existing.id;
          isReplay = true;
          console.warn('[Task#222][Webhook][replay] charge.refunded already persisted — reusing row', {
            eventId: event.id,
            refundId: latestRefund.id,
            persistedRowId,
            previousProcessingStatus: existing.processingStatus,
          });
          if (existing.processingStatus === 'processed') {
            // Side effects already applied — true idempotent replay.
            break;
          }
          // Otherwise fall through and re-attempt side effects (the prior
          // attempt persisted but crashed before completing them).
        } else {
          throw new PersistenceClaimError(
            `[Task#222] saveRefundEvent failed for event=${event.id} refund=${latestRefund.id}: ${errObj?.message ?? String(claimErr)}`,
            claimErr,
          );
        }
      }

      // ---- Original payment lookup (Bug A fix) --------------------
      // Try BOTH the legacy `payments` table AND the unified
      // `stripe_payment_history` table. Either may carry the original
      // charge depending on which payment path created it.
      const originalPayment = paymentIntentId
        ? await storage.getPaymentByStripeId(paymentIntentId)
        : undefined;
      const originalPaymentHistory = paymentIntentId
        ? await storage.getStripePaymentByIntentId(paymentIntentId)
        : undefined;

      if (!originalPayment && !originalPaymentHistory) {
        // No matching payment in EITHER table — durably record this as a
        // failed lookup so ops can audit/replay later. Ack 200 (we have
        // a durable row); do not 5xx (Stripe shouldn't retry forever
        // for an unknown payment).
        const skip = {
          eventId: event.id,
          eventType: event.type,
          refundId: latestRefund.id,
          paymentIntentId,
          reason: 'original_payment_not_found_in_either_table',
          metadataKey: 'payment_intent_id',
          metadataValue: paymentIntentId,
          persistedRowId,
        };
        console.warn('[Task#222][Webhook][skip] charge.refunded — no original payment found in payments OR stripe_payment_history', skip);
        recordTask222Skip(skip);
        if (refundEventRow) {
          await storage.updateRefundEvent(refundEventRow.id, {
            processingStatus: 'failed_lookup',
          });
        }
        break;
      }

      // Backfill the refund_events row with the cross-references now
      // that we know which side(s) matched.
      if (refundEventRow) {
        await storage.updateRefundEvent(refundEventRow.id, {
          originalPaymentId: originalPayment?.id ?? null,
          originalPaymentHistoryId: originalPaymentHistory?.id ?? null,
        });
      }

      try {
        // The legacy `payments`-table side effects (create refund payment
        // row, update enrollments, send email, broadcast) only apply when
        // the legacy row exists. For unified-processor-only payments we
        // skip those — the negative payment_allocation below is the
        // unified source of truth — and surface a structured info skip.
        if (!originalPayment) {
          const skip = {
            eventId: event.id,
            eventType: event.type,
            refundId: latestRefund.id,
            paymentIntentId,
            reason: 'unified_processor_payment_no_legacy_row',
            metadataKey: 'stripe_payment_history.id',
            metadataValue: String(originalPaymentHistory!.id),
            persistedRowId,
          };
          console.warn('[Task#222][Webhook][skip] legacy `payments` row absent — using unified path only', skip);
          recordTask222Skip(skip);
        }
        if (!originalPayment) {
          // Unified-only path: roll back enrollment balances driven by the
          // POSITIVE payment_allocations rows that the unified processor
          // wrote for this stripe_payment_history. Each enrollment gets
          // its share refunded (totalPaid reduced, status transitioned)
          // and a matching NEGATIVE payment_allocation is written so the
          // ledger reflects the refund as the source of truth.
          const unifiedHistoryId = originalPaymentHistory!.id;
          const positiveAllocs = (
            await storage.getPaymentAllocationsByPaymentHistoryId(unifiedHistoryId)
          ).filter((a) => a.allocatedAmountCents > 0 && a.enrollmentId !== null);

          let remainingUnifiedRefund = refundAmountCents;
          for (let i = 0; i < positiveAllocs.length; i++) {
            const alloc = positiveAllocs[i];
            const enrollmentId = alloc.enrollmentId as number;
            const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
            if (!enrollment) continue;
            const currentPaid = enrollment.totalPaid || 0;
            const isLast = i === positiveAllocs.length - 1;
            const refundForEnrollment = isLast
              ? remainingUnifiedRefund
              : Math.min(remainingUnifiedRefund, alloc.allocatedAmountCents, currentPaid);
            if (refundForEnrollment <= 0) continue;

            const newPaid = Math.max(0, currentPaid - refundForEnrollment);
            const newRemaining = Math.max(0, (enrollment.totalCost || 0) - newPaid);
            const paymentStatus: 'pending' | 'completed' | 'partial_payment' | 'refunded' =
              newPaid === 0 ? 'refunded' : newRemaining > 0 ? 'partial_payment' : 'completed';
            await storage.updateProgramEnrollment(enrollment.id, {
              totalPaid: newPaid,
              remainingBalance: newRemaining,
              paymentStatus,
            });
            console.log(
              `✅ [Task#222 unified] Rolled back enrollment ${enrollment.id}: refunded=$${refundForEnrollment / 100}, paid=$${newPaid / 100}, remaining=$${newRemaining / 100}, status=${paymentStatus}`,
            );

            const negativeAlloc: InsertPaymentAllocation = {
              paymentHistoryId: unifiedHistoryId,
              enrollmentId: enrollment.id,
              membershipEnrollmentId: null,
              sourceAllocationId: alloc.id,
              allocatedAmountCents: -refundForEnrollment,
              allocationType: 'refund',
              adminComment: `Stripe refund ${latestRefund.id} (unified)`,
              metadata: {
                stripeRefundId: latestRefund.id,
                refundReason: latestRefund.reason || 'Refund processed',
                processedViaWebhook: true,
                stripeEventId: event.id,
              },
            };
            await storage.createPaymentAllocation(negativeAlloc);
            remainingUnifiedRefund -= refundForEnrollment;
          }

          if (positiveAllocs.length === 0) {
            // No positive allocations to anchor the rollback to — still
            // write a single membership/no-enrollment negative allocation
            // so the unified ledger is non-empty.
            const negativeAlloc: InsertPaymentAllocation = {
              paymentHistoryId: unifiedHistoryId,
              enrollmentId: null,
              membershipEnrollmentId: null,
              sourceAllocationId: null,
              allocatedAmountCents: -refundAmountCents,
              allocationType: 'refund',
              adminComment: `Stripe refund ${latestRefund.id} (unified, no enrollment alloc)`,
              metadata: {
                stripeRefundId: latestRefund.id,
                refundReason: latestRefund.reason || 'Refund processed',
                processedViaWebhook: true,
                stripeEventId: event.id,
              },
            };
            await storage.createPaymentAllocation(negativeAlloc);
          }

          if (refundEventRow) {
            await storage.updateRefundEvent(refundEventRow.id, {
              processingStatus: 'processed',
            });
          }
          break;
        }

        // ---- Legacy side-effects (unchanged from prior handler) ----
        console.log(`🔄 Processing refund of $${refundAmountCents / 100} for payment ${originalPayment.id}`);

        // Idempotency on the legacy `payments` row: if a refund payment
        // already exists for this stripe refund id, do not duplicate it.
        const allPayments = await storage.getAllPayments();
        const existingRefund = allPayments.find((p: any) =>
          p.stripePaymentIntentId === latestRefund.id
        );
        if (existingRefund) {
          console.log(`✅ Refund ${latestRefund.id} already processed in payments table, skipping`);
          if (refundEventRow) {
            await storage.updateRefundEvent(refundEventRow.id, {
              processingStatus: 'processed',
            });
          }
          break;
        }

        // Create refund payment record
        const refundPaymentData = {
          schoolId: originalPayment.schoolId || 1,
          parentId: originalPayment.parentId || null,
          stripePaymentIntentId: latestRefund.id,
          stripeChargeId: null,
          stripeRefundId: latestRefund.id,
          originalPaymentId: originalPayment.id,
          parentEmail: originalPayment.parentEmail,
          childName: originalPayment.childName,
          className: originalPayment.className,
          description: `Refund for payment ${originalPayment.id}`,
          amount: -refundAmountCents, // Negative amount for refund
          currency: originalPayment.currency || 'usd',
          status: 'completed' as const,
          enrollmentIds: [],
          paymentDate: new Date(),
          metadata: {
            paymentMethod: 'refund',
            originalPaymentId: originalPayment.id,
            refundReason: latestRefund.reason || 'Refund processed',
            stripeRefundId: latestRefund.id,
            stripeRefundStatus: latestRefund.status,
            refundType: 'stripe',
            processedViaWebhook: true
          }
        };
        
        const refundPayment = await storage.createPayment(refundPaymentData);
        console.log('✅ Refund payment record created via webhook:', refundPayment.id);
        
        // Update enrollment balances for ALL affected enrollments
        try {
          const allEnrollments = await storage.getAllEnrollments();
          
          // Find matching enrollments using enrollmentIds if available, otherwise match by details
          let matchingEnrollments = [];
          
          const enrollmentIdsArray = originalPayment.enrollmentIds as number[] | undefined;
          if (enrollmentIdsArray && Array.isArray(enrollmentIdsArray)) {
            // Use enrollmentIds from payment record for accurate matching
            matchingEnrollments = allEnrollments.filter((enrollment: any) => 
              enrollmentIdsArray.includes(enrollment.id)
            );
            console.log(`🔍 Found ${matchingEnrollments.length} enrollments via enrollmentIds for refund`);
          } else {
            // Fallback: match by parent email, child name, and class name
            matchingEnrollments = allEnrollments.filter((enrollment: any) => {
              return enrollment.parentEmail === originalPayment.parentEmail &&
                     enrollment.childName === originalPayment.childName &&
                     enrollment.className === originalPayment.className;
            });
            console.log(`🔍 Found ${matchingEnrollments.length} enrollments via detail matching for refund`);
          }
          
          if (matchingEnrollments.length > 0) {
            // Distribute refund across all matching enrollments proportionally
            let remainingRefund = refundAmountCents;
            
            for (const enrollment of matchingEnrollments) {
              const currentAmountPaid = enrollment.totalPaid || 0;
              
              // For last enrollment, use all remaining refund to avoid rounding errors
              const refundForThisEnrollment = matchingEnrollments.indexOf(enrollment) === matchingEnrollments.length - 1
                ? remainingRefund
                : Math.min(remainingRefund, currentAmountPaid);
              
              if (refundForThisEnrollment <= 0) continue;
              
              const newAmountPaid = Math.max(0, currentAmountPaid - refundForThisEnrollment);
              const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
              
              // Determine payment status based on remaining balance
              let paymentStatus: 'pending' | 'completed' | 'partial_payment' | 'refunded';
              if (newAmountPaid === 0) {
                paymentStatus = 'refunded'; // Full refund
              } else if (remainingBalance > 0) {
                paymentStatus = 'partial_payment'; // Partial refund, has balance
              } else {
                paymentStatus = 'completed'; // Still fully paid
              }
              
              // Update program enrollment in database
              await storage.updateProgramEnrollment(enrollment.id, {
                totalPaid: newAmountPaid,
                remainingBalance: remainingBalance,
                paymentStatus: paymentStatus
              });
              
              console.log(`✅ Updated enrollment ${enrollment.id} via webhook refund: refunded=$${refundForThisEnrollment/100}, paid=$${newAmountPaid/100}, remaining=$${remainingBalance/100}`);
              
              // Create negative payment allocation for refund (source of truth)
              try {
                // Find the original payment's stripe_payment_history record using proper storage method
                const originalPaymentHistory = await storage.getStripePaymentByIntentId(paymentIntentId);
                  
                if (originalPaymentHistory) {
                  await storage.createPaymentAllocation({
                    paymentHistoryId: originalPaymentHistory.id,
                    enrollmentId: enrollment.id,
                    allocatedAmountCents: -refundForThisEnrollment, // Negative for refund
                    allocationType: 'refund',
                    adminComment: `Stripe refund ${latestRefund.id}`,
                    metadata: {
                      stripeRefundId: latestRefund.id,
                      refundReason: latestRefund.reason || 'Refund processed',
                      processedViaWebhook: true
                    }
                  });
                  console.log(`✅ Created negative allocation for refund on enrollment ${enrollment.id}`);
                } else {
                  console.log(`⚠️ No payment history found for intent ${paymentIntentId}, cannot create allocation`);
                }
              } catch (allocationError) {
                console.error('❌ Error creating refund allocation:', allocationError);
                throw allocationError;
              }
              
              remainingRefund -= refundForThisEnrollment;
            }
            
            console.log(`✅ Processed refund across ${matchingEnrollments.length} enrollments`);
          } else {
            console.log('⚠️ No matching enrollments found for refund - payment may be for non-enrollment item');
          }
        } catch (enrollmentError) {
          console.error('❌ Failed to update enrollments for webhook refund:', enrollmentError);
          // Rethrow so the outer charge.refunded catch marks the
          // refund_event as failed_processing and returns 5xx for Stripe
          // retry. Enrollment rollback is the critical side effect; we
          // must NOT silently ack a refund whose enrollment state is wrong.
          throw enrollmentError;
        }
        
        // Send refund notification email
        try {
          const parentUser = await storage.getUserByEmail(originalPayment.parentEmail);
          const parentName = parentUser ? 
            parentUser.name || originalPayment.parentEmail.split('@')[0] : 
            originalPayment.parentEmail.split('@')[0];
          
          const formatCurrency = (amount: number) => {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(Math.abs(amount) / 100);
          };
          
          const formatDate = (date: string) => {
            return new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).format(new Date(date));
          };
          
          await sendPaymentReceipt({
            parentEmail: originalPayment.parentEmail,
            parentName,
            receiptNumber: latestRefund.id,
            paymentDate: formatDate(new Date().toISOString()),
            paymentMethod: 'Refund',
            amount: formatCurrency(refundAmountCents),
            childName: originalPayment.childName || 'Child',
            className: originalPayment.className || 'Class',
            notes: `Refund for payment ${originalPayment.id}. ${latestRefund.reason || 'Refund processed'}`
          });
          
          console.log('📧 Refund receipt email sent via webhook to:', originalPayment.parentEmail);
        } catch (emailError) {
          console.error('❌ Failed to send refund receipt email via webhook:', emailError);
        }
        
        // Push real-time update for refund
        try {
          const { dataLayer } = await import('./services/dataLayer.js');
          
          dataLayer.broadcastBillingUpdate(originalPayment.parentEmail, {
            type: 'refund_processed',
            refundId: latestRefund.id,
            amount: refundAmountCents,
            originalPaymentId: originalPayment.id,
            timestamp: new Date().toISOString()
          });
          
          await dataLayer.refreshUserData(originalPayment.parentEmail);
          console.log('📡 Pushed real-time refund update to frontend');
        } catch (error) {
          console.error('❌ Failed to push real-time refund update:', error);
        }

        // Mark the durable refund_events row as processed once side
        // effects complete. Used by the regression test (P5) and the
        // replay path to short-circuit duplicate Stripe deliveries.
        if (refundEventRow) {
          await storage.updateRefundEvent(refundEventRow.id, {
            processingStatus: 'processed',
          });
        }
        console.log('✅ Refund webhook processing complete', { isReplay, persistedRowId });
      } catch (error) {
        console.error('❌ Error processing refund webhook side effects:', error);
        // Side effects failed AFTER the durable row was claimed. Mark the
        // refund_event row as failed_processing for ops visibility, surface
        // a structured skip, then RETHROW so the outer handler returns 5xx
        // and Stripe retries the same event id. The unique constraint on
        // stripe_event_id makes the retry idempotent for the event row
        // while re-running the side effects.
        recordTask222Skip({
          eventId: event.id,
          eventType: event.type,
          refundId: latestRefund.id,
          paymentIntentId,
          reason: 'side_effects_failed_after_persistence',
          metadataKey: 'error.message',
          metadataValue: (error as Error)?.message ?? null,
          persistedRowId,
        });
        if (refundEventRow) {
          try {
            await storage.updateRefundEvent(refundEventRow.id, {
              processingStatus: 'failed_processing',
              failureReason: (error as Error)?.message ?? 'unknown',
            });
          } catch (updateErr) {
            console.error('❌ Could not mark refund_event as failed_processing:', updateErr);
          }
        }
        throw error;
      }
      break;
    }

    case 'refund.updated':
    case 'refund.failed': {
      // Task #222 — refund.updated / refund.failed are persistence-required
      // events: their job is to record state transitions of an existing
      // refund (pending → succeeded, → failed, → canceled) so reconciliation
      // can replay from refund_events. There are no side effects beyond the
      // durable row + structured skip log.
      const refundObj = event.data.object as Stripe.Refund;
      console.log(`🔄 ${event.type}:`, refundObj.id, refundObj.status);

      try {
        if (
          process.env.NODE_ENV !== 'production' &&
          req.headers['x-task-222-fault-inject-persistence'] === 'true'
        ) {
          throw new PersistenceClaimError(
            'TASK_222_FAULT_INJECT_PERSISTENCE: synthetic DB failure (test header)',
          );
        }
        const insertPayload: InsertRefundEvent = {
          stripeEventId: event.id,
          stripeRefundId: refundObj.id,
          stripeChargeId: (refundObj.charge as string) || null,
          stripePaymentIntentId: (refundObj.payment_intent as string) || null,
          eventType: event.type as 'refund.updated' | 'refund.failed',
          amountCents: refundObj.amount,
          currency: refundObj.currency || 'usd',
          refundStatus: refundObj.status || null,
          reason: refundObj.reason || null,
          failureReason: refundObj.failure_reason || null,
          originalPaymentId: null,
          originalPaymentHistoryId: null,
          processingStatus: 'persisted',
          rawEvent: event,
        };
        const claimed = await storage.saveRefundEvent(insertPayload);
        persistedRowId = claimed.id;
        console.log(`🔒 [Task#222] claimed ${event.type} in refund_events`, {
          eventId: event.id,
          refundId: refundObj.id,
          status: refundObj.status,
          persistedRowId,
        });
      } catch (claimErr: unknown) {
        if (claimErr instanceof PersistenceClaimError) throw claimErr;
        const errObj = claimErr as { code?: string; message?: string } | null;
        const isUnique =
          errObj?.code === '23505' ||
          /unique|duplicate/i.test(errObj?.message || '');
        if (isUnique) {
          const existing = await storage.getRefundEventByEventId(event.id);
          if (!existing) {
            throw new PersistenceClaimError(
              `[Task#222] unique violation on saveRefundEvent (${event.type}) but no existing row for event=${event.id}`,
              claimErr,
            );
          }
          persistedRowId = existing.id;
          console.warn(`[Task#222][Webhook][replay] ${event.type} already persisted — reusing row`, {
            eventId: event.id,
            refundId: refundObj.id,
            persistedRowId,
          });
        } else {
          throw new PersistenceClaimError(
            `[Task#222] saveRefundEvent failed for ${event.type} event=${event.id}: ${errObj?.message ?? String(claimErr)}`,
            claimErr,
          );
        }
      }
      break;
    }

    // ===== MEMBERSHIP SUBSCRIPTION EVENTS =====
    // These were previously handled by insecure /api/stripe-webhooks/* endpoints
    // Now consolidated here with proper signature verification
    
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
      console.log('📦 Unhandled event type:', event.type, '- responding with 200 OK');
      // Return 200 OK for unhandled events to prevent retries
      res.json({ received: true, event_type: event.type, handled: false });
      // Mark as duplicate AFTER successful ack so retries are suppressed.
      if (event?.id) {
        recentWebhookEvents.set(event.id, now);
      }
      return;
    }

    // Task #219: enforce the persistence invariant before acknowledging.
    // A persistence-required event that reaches the 2xx path without a
    // persisted row id is a contract violation — return 5xx so Stripe retries.
    if (isPersistenceRequiredEvent(event.type) && persistedRowId === null) {
      console.error('[Task#219][Webhook] persistence-required event reached success path with null persistedRowId — refusing to ack', {
        eventId: event?.id,
        eventType: event.type,
      });
      res.status(500).json({
        error: 'Persistence row missing for persistence-required event',
        event_type: event.type,
        eventId: event?.id,
      });
      return;
    }
    // Success response for handled events.
    // Task #219: include persistedRowId for callers (and the regression test)
    // to verify exactly-one-row idempotency in stripe_payment_history.
    res.json({ received: true, event_type: event.type, handled: true, persistedRowId });
    console.log('✅ Successfully processed webhook event:', event.type, { persistedRowId });
    // Only NOW is it safe to mark this event id as a duplicate to suppress
    // identical retries — a failed attempt above leaves the cache untouched.
    if (event?.id) {
      recentWebhookEvents.set(event.id, now);
    }
    
  } catch (eventError: any) {
    console.error('❌ Error processing webhook event:', event.type, eventError.message);
    console.error('Event processing stack:', eventError.stack);
    
    // For webhook processing errors, we should return 500 so Stripe retries
    res.status(500).json({ 
      error: 'Webhook processing failed', 
      event_type: event.type,
      message: eventError.message 
    });
    return;
  }
};