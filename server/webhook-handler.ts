import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { storage } from './storage';
import { sendPaymentReceipt } from './lib/email-service';
import { getStripeClient } from './config/stripe';
import { createReceiptFromPayment } from './services/receiptService';
import { processMembershipStripeEvent } from './api/stripe-webhook';
import { splitCentsEvenly } from './api/billing';
import {
  enrollmentPoolCentsForBalanceIntent,
  parseBalanceIntentCredits,
  parseMetadataMembershipAmountCents,
  totalCentsForBalanceAllocation,
} from './lib/balance-payment-metadata';
import { applyClassPoolToEnrollments } from './lib/apply-class-pool-to-enrollments';
import { findProgramEnrollmentForCartItem } from './lib/cart-checkout-enrollment-match';
import {
  consumeCreditsFromPaymentIntentMetadata,
  fulfillBalancePaymentIntent,
} from './lib/fulfill-balance-payment-intent';
import { resolveScheduledPaymentEnrollmentIds } from './lib/scheduled-payment-intent-metadata';
import { ensureScheduledPaymentCreditsConsumed } from './lib/ensure-scheduled-payment-credits-consumed';
import { schedulePostPaymentVerificationIfEnabled } from './services/post-payment-verification-schedule';

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

  const parentEmail =
    typeof paymentIntent.metadata?.parentEmail === 'string'
      ? paymentIntent.metadata.parentEmail
      : undefined;

  for (const item of items) {
    try {
      let enrollment: Awaited<ReturnType<typeof storage.getProgramEnrollmentById>>;
      const enrollmentId = Number(item.enrollmentId);
      if (Number.isFinite(enrollmentId) && enrollmentId > 0) {
        enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      }
      if (!enrollment) {
        const allEnrollments = await storage.getAllEnrollments();
        enrollment = findProgramEnrollmentForCartItem(
          allEnrollments as any,
          item,
          parentEmail,
        ) as typeof enrollment;
      }

      if (enrollment) {
        const currentAmount = enrollment.totalPaid || 0;
        const owed = Math.max(0, (enrollment.totalCost || 0) - currentAmount);
        const toApply = Math.min(amountPerItem, owed);
        if (toApply <= 0) {
          console.log(
            `ℹ️ Enrollment ${enrollment.id} already satisfied; skipping cart webhook apply (${amountPerItem}c offered)`,
          );
          updatedEnrollments.push(enrollment);
          continue;
        }
        const newAmount = currentAmount + toApply;
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
  const result = await applyClassPoolToEnrollments(paymentIntent, enrollmentIds);
  console.log('💰 applyClassPoolToEnrollments:', {
    paymentIntentId: paymentIntent.id,
    appliedCents: result.appliedCents,
    skippedCents: result.skippedCents,
    updatedEnrollmentIds: result.enrollmentIds,
  });
}

/**
 * Standalone Stripe webhook handler that must be applied BEFORE any JSON body parsers.
 * This handler requires raw buffer access for signature verification.
 * 
 * Usage in server/index.ts:
 * app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);
 */
export const webhookHandler = async (req: Request, res: Response) => {
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
    
    if (process.env.NODE_ENV !== 'test') {
      console.log('🔍 Processing signature verification:', {
        signature: signature.substring(0, 50) + '...',
        payloadLength: payload.length,
        secretLength: endpointSecret.length,
      });
    }

    // Use the raw buffer directly for signature verification
    event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    if (process.env.NODE_ENV !== 'test') {
      console.log('✅ Webhook signature verified successfully for event:', event.type);
    }
  } catch (err: any) {
    // Strict security - reject all invalid signatures in production
    // Only allow bypass in development with explicit flag for testing
    const allowDevBypass =
      process.env.STRIPE_WEBHOOK_DEV_BYPASS === 'true' &&
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');

    if (allowDevBypass) {
      if (process.env.NODE_ENV === 'test') {
        console.log('ℹ️ Webhook test/dev bypass (invalid signature):', err.message);
      } else {
        console.warn('⚠️ DEVELOPMENT BYPASS: Processing webhook despite signature verification failure');
        console.warn('⚠️ This bypass should NEVER be enabled in production!');
      }
      try {
        // Parse the raw body as JSON to get the event data
        const eventData = JSON.parse(payload.toString());
        event = eventData;
        if (process.env.NODE_ENV !== 'test') {
          console.log('✅ Parsed webhook event in development mode:', event.type);
        }
      } catch (parseErr) {
        console.error('❌ Failed to parse webhook payload in development mode:', parseErr);
        return res.status(400).json({ error: 'Invalid payload format' });
      }
    } else {
      console.error('❌ Webhook signature verification failed:', err.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('🔍 Detailed debug info:', {
          payloadType: typeof payload,
          payloadLength: payload?.length,
          signatureType: typeof sig,
          isBuffer: Buffer.isBuffer(payload),
          errorStack: err.stack,
        });
      }
      console.error('🚨 Webhook signature verification failed - rejecting request for security');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }

  // Handle the event - process webhooks securely
  if (process.env.NODE_ENV !== 'test') {
    console.log('📥 Processing webhook event:', event.type);
  }
  const now = Date.now();
  cleanupRecentWebhookEvents(now);
  if (event?.id && recentWebhookEvents.has(event.id)) {
    console.log('↩️ Duplicate webhook event received, acknowledging without reprocessing:', event.id);
    return res.json({ received: true, event_type: event.type, duplicate: true });
  }
  if (event?.id) {
    recentWebhookEvents.set(event.id, now);
  }
  
  try {
    switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('🛒 Checkout session completed:', session.id);
      
      try {
        // Get the payment intent from the session
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

          const updatedEnrollments = await applyCartCheckoutItemsFromWebhook(items, paymentIntent);

          console.log(`✅ Updated ${updatedEnrollments.length} enrollments for checkout session ${session.id}`);
          
          // Create payment record in database
          const parentUserForSession = await storage.getUserByEmail(parentEmail);
          const schoolIdForSession = parentUserForSession?.schoolId || updatedEnrollments[0]?.schoolId || 1;
          
          const payment = {
            schoolId: schoolIdForSession,
            parentId: parentUserForSession?.id ?? null,
            parentEmail: parentEmail,
            childName: items[0]?.childName || 'Unknown',
            className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
            description: `Checkout payment for ${items.length} enrollment${items.length > 1 ? 's' : ''}`,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency || 'usd',
            status: 'completed' as const,
            stripePaymentIntentId: paymentIntent.id,
            stripeChargeId: null as string | null,
            stripeRefundId: null as string | null,
            originalPaymentId: null as number | null,
            enrollmentIds: updatedEnrollments.map((e: any) => e.id),
            metadata: {
              checkoutSessionId: session.id,
              itemCount: items.length
            },
            paymentDate: new Date()
          };

          await storage.createPayment(payment);
          console.log('✅ Payment record created in database for checkout session:', session.id);
          
          // Create payment receipt record for parent documents
          await createReceiptFromPayment({
            schoolId: schoolIdForSession,
            parentId: parentUserForSession?.id,
            parentEmail: parentEmail,
            amount: paymentIntent.amount,
            description: payment.description,
            childName: payment.childName,
            className: payment.className,
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
        // Check if this is a balance payment or new enrollment
        const paymentType = paymentIntent.metadata.paymentType || paymentIntent.metadata.type;
        console.log('🔍 Payment type:', paymentType);
        
        // Check if this payment was already processed (to avoid double processing).
        // We intentionally do NOT skip when the existing row is still pending:
        // create-payment-intent pre-inserts pending payments before Stripe confirms.
        // Skipping here caused "charged but balance unchanged" incidents.
        const existingPayment = await storage.getPaymentByStripeId(paymentIntent.id);
        let hadPreexistingPendingPayment = false;
        let paymentLedgerAlreadySucceeded = false;
        if (existingPayment) {
          if (existingPayment.status === 'pending') {
            console.log('ℹ️ Existing payment row is pending; continuing webhook processing:', paymentIntent.id);
            await storage.updatePaymentStatus(existingPayment.id, 'succeeded');
            hadPreexistingPendingPayment = true;
          } else if (
            existingPayment.status === 'completed' ||
            existingPayment.status === 'succeeded'
          ) {
            console.log(
              'ℹ️ Payment row already succeeded; will still apply enrollment ledger if owed:',
              paymentIntent.id,
            );
            paymentLedgerAlreadySucceeded = true;
          } else {
            console.log('⚠️ Payment already processed, skipping:', paymentIntent.id, 'status:', existingPayment.status);
            break;
          }
        }
        
        if (paymentType === 'scheduled_payment') {
          // Handle scheduled payment completion
          const scheduledPaymentId = paymentIntent.metadata.scheduledPaymentId;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          console.log(`💰 Processing completed scheduled payment: ${scheduledPaymentId} for ${parentEmail}`);
          
          const spIdParsed = parseInt(String(scheduledPaymentId), 10);
          let scheduledPayment =
            Number.isFinite(spIdParsed) && spIdParsed > 0
              ? await storage.getScheduledPaymentById(spIdParsed)
              : undefined;
          if (!scheduledPayment && parentEmail) {
            const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);
            scheduledPayment = allScheduledPayments.find((p) => p.id === spIdParsed);
          }
          
          if (scheduledPayment) {
            const spId = parseInt(scheduledPaymentId, 10);
            const creditsAppliedCents =
              parseInt(String(paymentIntent.metadata.creditsAppliedCents || '0'), 10) || 0;
            const userIdForCredits = parseInt(String(paymentIntent.metadata.userId || '0'), 10) || 0;
            const creditHoldSessionId =
              (paymentIntent.metadata.creditHoldSessionId as string) ||
              (paymentIntent.metadata.holdSessionId as string) ||
              '';

            if (creditsAppliedCents > 0 && userIdForCredits > 0) {
              const creditResult = await ensureScheduledPaymentCreditsConsumed({
                scheduledPaymentId: spId,
                userId: userIdForCredits,
                creditsAppliedCents,
                creditHoldSessionId: creditHoldSessionId || undefined,
                installmentNumber: paymentIntent.metadata.installmentNumber,
                totalInstallments: paymentIntent.metadata.totalInstallments,
              });
              console.log(`💰 Scheduled payment ${scheduledPaymentId} credits:`, creditResult);
              if (
                creditResult.consumedCents < creditsAppliedCents &&
                !creditResult.skippedAlreadyApplied
              ) {
                throw new Error(
                  `Credit ledger incomplete for scheduled payment ${scheduledPaymentId}: ` +
                    `expected ${creditsAppliedCents}c, recorded ${creditResult.consumedCents}c`
                );
              }
            }

            if (String(scheduledPayment.status) === 'completed') {
              console.log(
                `ℹ️ Scheduled payment ${scheduledPaymentId} already completed; skipping duplicate ledger application for PI ${paymentIntent.id}`,
              );
              break;
            }
            const completionSrc =
              paymentIntent.metadata.autoPayInitiated === 'true' ? 'stripe_autopay' : 'stripe_checkout';
            await storage.updateScheduledPayment(spId, {
              status: 'completed',
              processedAt: new Date(),
              completionSource: completionSrc,
            });
            console.log(`✅ Marked scheduled payment ${scheduledPaymentId} as completed (${completionSrc})`);

            const enrollmentIds = resolveScheduledPaymentEnrollmentIds(
              scheduledPayment,
              paymentIntent.metadata as Record<string, string | undefined>,
            );

            const originalAmount =
              parseInt(String(paymentIntent.metadata.originalAmountCents || '0'), 10) ||
              paymentIntent.amount;
            const totalPaymentAmount =
              creditsAppliedCents > 0 ? originalAmount : paymentIntent.amount;
            const totalCents = Number.isInteger(totalPaymentAmount)
              ? totalPaymentAmount
              : Math.round(Number(totalPaymentAmount)) || paymentIntent.amount;

            let childNameForPayment = 'Child';
            let classNameForPayment = 'Class';
            let payerLine = `Installment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`;
            if (enrollmentIds.length === 1) {
              const enrollmentForLabel = await storage.getProgramEnrollmentById(enrollmentIds[0]!);
              if (enrollmentForLabel) {
                payerLine = `${enrollmentForLabel.childName} - ${enrollmentForLabel.className}`;
                childNameForPayment = enrollmentForLabel.childName || childNameForPayment;
                classNameForPayment = enrollmentForLabel.className || classNameForPayment;
              }
            } else if (enrollmentIds.length > 1) {
              const parts: string[] = [];
              for (const eid of enrollmentIds) {
                const e = await storage.getProgramEnrollmentById(eid);
                if (e?.childName && e?.className) {
                  parts.push(`${e.childName} - ${e.className}`);
                }
              }
              payerLine = parts.length > 0 ? parts.join('; ') : payerLine;
              childNameForPayment = 'Multiple children';
              classNameForPayment = `${enrollmentIds.length} enrollments`;
            }

            const parentUser = await storage.getUserByEmail(parentEmail);
            const schoolId = scheduledPayment.schoolId || parentUser?.schoolId || 1;

            const payment = {
              schoolId,
              parentId: parentUser?.id ?? null,
              parentEmail: parentEmail,
              childName: childNameForPayment,
              className: classNameForPayment,
              description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: null as string | null,
              stripeRefundId: null as string | null,
              originalPaymentId: null as number | null,
              enrollmentIds,
              metadata: {
                scheduledPaymentId: scheduledPaymentId,
                installmentNumber: scheduledPayment.installmentNumber,
                totalInstallments: scheduledPayment.totalInstallments,
                enrollmentIds: JSON.stringify(enrollmentIds),
              },
              paymentDate: new Date()
            };

            // Persist payments row before enrollment mutation so reconciliation cannot double-apply.
            if (!existingPayment) {
              await storage.createPayment(payment);
              console.log(`✅ Created payment history record for scheduled payment ${scheduledPaymentId}`);
            }

            console.log('💰 Updating enrollment balance for scheduled payment...', { enrollmentIds });

            if (enrollmentIds.length === 0) {
              console.error(`❌ Cannot process scheduled payment ${scheduledPaymentId}: no enrollment ids`);
            } else {
              const allocation = splitCentsEvenly(Math.max(0, totalCents), enrollmentIds.length);
              try {
                for (let i = 0; i < enrollmentIds.length; i++) {
                  const targetEnrollmentId = enrollmentIds[i];
                  const shareCents = allocation[i] ?? 0;
                  const enrollment = await storage.getProgramEnrollmentById(targetEnrollmentId);
                  if (!enrollment) {
                    console.error(`❌ Enrollment ${targetEnrollmentId} not found for scheduled payment`);
                    continue;
                  }
                  const currentAmountPaid = enrollment.totalPaid || 0;
                  const newAmountPaid = currentAmountPaid + shareCents;
                  const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
                  const updatedEnrollment = await storage.updateProgramEnrollment(targetEnrollmentId, {
                    totalPaid: newAmountPaid,
                    remainingBalance: newBalance,
                    paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
                  });
                  if (updatedEnrollment) {
                    console.log(
                      `✅ Updated enrollment ${targetEnrollmentId}: paid=${newAmountPaid}, balance=${newBalance} (share ${shareCents}c)`,
                    );
                  }
                }
              } catch (error) {
                console.error(`❌ Error updating enrollments for scheduled payment ${scheduledPaymentId}:`, error);
              }
            }
            
            // Create payment receipt record for parent documents
            await createReceiptFromPayment({
              schoolId,
              parentId: parentUser?.id,
              parentEmail: parentEmail,
              amount: paymentIntent.amount,
              description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments} - ${payment.className}`,
              childName: payment.childName,
              className: payment.className,
              enrollmentIds,
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
                childName: payment.childName,
                className: payment.className,
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
                description: payerLine,
                timestamp: new Date().toISOString()
              });
              
              await dataLayer.refreshUserData(parentEmail);
              console.log('📡 Pushed comprehensive real-time billing update to frontend for scheduled payment AFTER storage commit');
            } catch (error) {
              console.error('❌ Failed to push real-time update for scheduled payment:', error);
            }
            
            console.log(`✅ Scheduled payment ${scheduledPaymentId} processing complete`);
          } else {
            console.error(`❌ Scheduled payment ${scheduledPaymentId} not found`);
          }
          
          // Break out of switch after processing scheduled payment
          break;
          
        } else if (paymentType === 'balance_payment' || paymentType === 'three_payments' || !paymentType) {
          console.log('🔍 Processing balance payment, three_payments plan, or fallback payment...');
          // Handle balance payment - update existing enrollments
          const enrollmentIds = JSON.parse(paymentIntent.metadata.enrollmentIds || '[]');
          const parentEmail = paymentIntent.metadata.parentEmail;
          console.log('💰 Processing payment for enrollments:', enrollmentIds, 'payment type:', paymentType);
          
          if (enrollmentIds.length > 0 && parentEmail) {
            if (hadPreexistingPendingPayment || paymentLedgerAlreadySucceeded) {
              const replay = await fulfillBalancePaymentIntent(paymentIntent, enrollmentIds, {
                paymentHistoryId: existingPayment?.id,
              });
              console.log('💰 Balance payment replay fulfillment:', {
                paymentIntentId: paymentIntent.id,
                appliedCents: replay.enrollmentApply.appliedCents,
                creditsConsumedCents: replay.creditsConsumedCents,
                creditsSkipped: replay.creditsSkippedAlreadyApplied,
              });
              const { StripePaymentPlanService } = await import(
                './services/stripe-payment-plans.js'
              );
              const planService = new StripePaymentPlanService(storage as any);
              await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(
                paymentIntent,
              );
            } else {
              // processBalancePayment() already performs membership fulfillment.
              // Do not call it here as well, or the same PI can double-apply membership cents.
              // Calculate payment amount in dollars (Stripe amount is in cents)
              const totalAmount = paymentIntent.amount / 100;

              const { processBalancePayment } = await import('./api/billing.js');
              await processBalancePayment(paymentIntent, parentEmail, enrollmentIds, totalAmount);

              const { StripePaymentPlanService } = await import(
                './services/stripe-payment-plans.js'
              );
              const planService = new StripePaymentPlanService(storage as any);
              await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(
                paymentIntent,
              );
            }

            const shouldVaultCheckoutCard =
              paymentIntent.metadata?.savePaymentMethodForAutoPay === 'true' ||
              paymentIntent.metadata?.paymentPlan === 'biweekly';
            if (shouldVaultCheckoutCard) {
              try {
                const { syncParentPaymentMethodFromPaymentIntent } = await import(
                  './lib/sync-checkout-payment-method.js'
                );
                const syncResult = await syncParentPaymentMethodFromPaymentIntent(
                  parentEmail,
                  paymentIntent.id,
                  {
                    enableAutoPay:
                      paymentIntent.metadata?.enableAutoPayAfterCheckout === 'true',
                  },
                );
                if (!syncResult.ok) {
                  console.warn(
                    '[webhook] checkout payment method sync:',
                    syncResult.message,
                  );
                }
              } catch (syncErr) {
                console.error('[webhook] checkout payment method sync failed:', syncErr);
              }
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
          // Handle new enrollment payments (cart checkout)
          const itemsJson = paymentIntent.metadata.itemsJson;
          const paymentType = paymentIntent.metadata.paymentType;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          console.log('💰 Processing cart checkout payment:', {
            paymentType,
            parentEmail,
            hasItemsJson: !!itemsJson,
            paymentIntentId: paymentIntent.id
          });
          
          if (itemsJson && parentEmail) {
            if (paymentLedgerAlreadySucceeded) {
              console.log(
                '↩️ Cart checkout already recorded for PI; skipping duplicate enrollment/payment on payment_intent.succeeded:',
                paymentIntent.id,
              );
            } else {
              const items = JSON.parse(itemsJson);
              console.log('💰 Processing cart payment enrollments:', items.length, 'items for', parentEmail);

              // Enrollment matching is shared with checkout.session.completed (see findProgramEnrollmentForCartItem).
              const updatedEnrollments = await applyCartCheckoutItemsFromWebhook(items, paymentIntent);

              console.log(`✅ Updated ${updatedEnrollments.length} enrollments in database for payment ${paymentIntent.id}`);
              
              // Create payment record
              // Get schoolId from enrollment or parent user
              const parentUserForPayment = await storage.getUserByEmail(parentEmail);
              const schoolIdForPayment = updatedEnrollments[0]?.schoolId || parentUserForPayment?.schoolId || 1;
              
              const payment = {
                schoolId: schoolIdForPayment,
                parentId: parentUserForPayment?.id ?? null,
                stripePaymentIntentId: paymentIntent.id,
                parentEmail: parentEmail,
                childName: items[0]?.childName || 'Unknown',
                className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
                description: `Cart payment for ${items.length} enrollment${items.length > 1 ? 's' : ''}`,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency || 'usd',
                status: 'completed' as const,
                stripeChargeId: null as string | null,
                stripeRefundId: null as string | null,
                originalPaymentId: null as number | null,
                enrollmentIds: updatedEnrollments.map((e: any) => e.id),
                metadata: {
                  itemCount: items.length
                },
                paymentDate: new Date()
              };

              await storage.createPayment(payment);
              console.log('✅ Payment record created for payment:', paymentIntent.id);
              
              // Create payment receipt record for parent documents
              await createReceiptFromPayment({
                schoolId: schoolIdForPayment,
                parentId: parentUserForPayment?.id,
                parentEmail: parentEmail,
                amount: paymentIntent.amount,
                description: payment.description,
                childName: payment.childName,
                className: payment.className,
                enrollmentIds: updatedEnrollments.map((e: any) => e.id)
              });
              
              // Real-time update for cart payments
              try {
                const { dataLayer } = await import('./services/dataLayer.js');
                
                dataLayer.broadcastPaymentComplete(parentEmail, {
                  amount: paymentIntent.amount,
                  paymentId: paymentIntent.id,
                  description: `Payment for ${items.length} enrollment${items.length > 1 ? 's' : ''}`,
                  timestamp: new Date().toISOString()
                });
                
                await dataLayer.refreshUserData(parentEmail);
                console.log('📡 Pushed real-time update for cart payment');
              } catch (error) {
                console.error('❌ Failed to push real-time update for cart payment:', error);
              }
            }
          }

          // NOTE: Enrollments are now created BEFORE payment in stripe.ts using createProgramEnrollment()
          // This legacy code path for creating enrollments AFTER payment has been removed to prevent
          // database divergence. All enrollments should exist before the payment intent succeeds.
        }
      } catch (error) {
        console.error('❌ Error processing payment:', error);
      }
      schedulePostPaymentVerificationIfEnabled(paymentIntent, event.id);
      break;

    case 'payment_intent.payment_failed': {
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      console.log('❌ Payment failed:', failedPayment.id);
      try {
        const paymentType = failedPayment.metadata?.paymentType || failedPayment.metadata?.type;
        if (paymentType === 'scheduled_payment' && failedPayment.metadata?.scheduledPaymentId) {
          const scheduledPaymentId = parseInt(String(failedPayment.metadata.scheduledPaymentId), 10);
          const parentEmail = String(failedPayment.metadata.parentEmail || '');
          const creditHoldSessionId =
            (failedPayment.metadata.creditHoldSessionId as string) ||
            (failedPayment.metadata.holdSessionId as string) ||
            undefined;
          const lastPaymentErrorMessage =
            failedPayment.last_payment_error?.message ||
            (typeof failedPayment.metadata.lastPaymentErrorMessage === 'string'
              ? failedPayment.metadata.lastPaymentErrorMessage
              : undefined);
          if (parentEmail && !Number.isNaN(scheduledPaymentId)) {
            const { handleScheduledPaymentFailed } = await import('./services/auto-pay-webhook-helpers.js');
            await handleScheduledPaymentFailed(scheduledPaymentId, {
              parentEmail,
              creditHoldSessionId,
              lastPaymentErrorMessage,
            });
          }
        }
      } catch (e) {
        console.error('❌ Error handling payment_intent.payment_failed:', e);
      }
      break;
    }

    case 'charge.refunded':
      const refundEvent = event.data.object as Stripe.Charge;
      console.log('🔄 Refund processed:', refundEvent.id);
      
      try {
        // Get the payment intent ID from the charge
        const paymentIntentId = refundEvent.payment_intent as string;
        console.log('💳 Processing refund for payment intent:', paymentIntentId);
        
        // Find the original payment in our system
        const originalPayment = await storage.getPaymentByStripeId(paymentIntentId);
        
        if (!originalPayment) {
          console.log('⚠️ Original payment not found for refund:', paymentIntentId);
          break;
        }
        
        // Get refund details
        const refunds = refundEvent.refunds?.data || [];
        if (refunds.length === 0) {
          console.log('⚠️ No refund data found in charge.refunded event');
          break;
        }
        
        const latestRefund = refunds[refunds.length - 1]; // Get the most recent refund
        const refundAmountCents = latestRefund.amount;
        
        console.log(`🔄 Processing refund of $${refundAmountCents / 100} for payment ${originalPayment.id}`);
        
        // IDEMPOTENCY CHECK: Skip if this refund was already processed
        const allPayments = await storage.getAllPayments();
        const existingRefund = allPayments.find((p: any) => 
          p.stripePaymentIntentId === latestRefund.id
        );
        
        if (existingRefund) {
          console.log(`✅ Refund ${latestRefund.id} already processed, skipping duplicate webhook`);
          break;
        }
        
        const enrollmentIdsFromPayment: number[] = Array.isArray(originalPayment.enrollmentIds)
          ? originalPayment.enrollmentIds.filter((id): id is number => typeof id === 'number')
          : [];

        // Create refund payment record
        const refundPaymentData = {
          schoolId: originalPayment.schoolId,
          parentId: originalPayment.parentId,
          parentEmail: originalPayment.parentEmail,
          childName: originalPayment.childName,
          className: originalPayment.className,
          description: `Refund for payment ${originalPayment.id}`,
          amount: -refundAmountCents, // Negative amount for refund
          currency: originalPayment.currency || 'usd',
          status: 'completed' as const,
          stripePaymentIntentId: latestRefund.id,
          stripeChargeId: null as string | null,
          stripeRefundId: latestRefund.id,
          originalPaymentId: originalPayment.id,
          enrollmentIds: enrollmentIdsFromPayment,
          metadata: {
            paymentMethod: 'refund',
            originalPaymentId: originalPayment.id,
            refundReason: latestRefund.reason || 'Refund processed',
            stripeRefundId: latestRefund.id,
            stripeRefundStatus: latestRefund.status,
            refundType: 'stripe',
            processedViaWebhook: true
          },
          paymentDate: new Date()
        };
        
        const refundPayment = await storage.createPayment(refundPaymentData);
        console.log('✅ Refund payment record created via webhook:', refundPayment.id);
        
        // Update enrollment balances for ALL affected enrollments
        try {
          const allEnrollments = await storage.getAllEnrollments();
          
          // Find matching enrollments using enrollmentIds if available, otherwise match by details
          let matchingEnrollments = [];
          
          if (enrollmentIdsFromPayment.length > 0) {
            // Use enrollmentIds from payment record for accurate matching
            matchingEnrollments = allEnrollments.filter((enrollment: any) =>
              enrollmentIdsFromPayment.includes(enrollment.id)
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
              
              remainingRefund -= refundForThisEnrollment;
            }
            
            console.log(`✅ Processed refund across ${matchingEnrollments.length} enrollments`);
          } else {
            console.log('⚠️ No matching enrollments found for refund - payment may be for non-enrollment item');
          }
        } catch (enrollmentError) {
          console.error('❌ Failed to update enrollments for webhook refund:', enrollmentError);
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
            childName: originalPayment.childName ?? 'Student',
            className: originalPayment.className ?? 'Class',
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
        
        console.log('✅ Refund webhook processing complete');
      } catch (error) {
        console.error('❌ Error processing refund webhook:', error);
      }
      break;

    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await processMembershipStripeEvent(event);
      break;

      default:
        console.log('📦 Unhandled event type:', event.type, '- responding with 200 OK');
        // Return 200 OK for unhandled events to prevent retries
        res.json({ received: true, event_type: event.type, handled: false });
        return;
    }

    // Success response for handled events
    res.json({ received: true, event_type: event.type, handled: true });
    console.log('✅ Successfully processed webhook event:', event.type);
    
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