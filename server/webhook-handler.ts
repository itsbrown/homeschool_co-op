import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { storage } from './storage';
import { sendPaymentReceipt } from './lib/email-service';
import { STRIPE_SECRET_KEY } from './config/stripe';

// Initialize Stripe with environment-based key selection
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
});

/**
 * Standalone Stripe webhook handler that must be applied BEFORE any JSON body parsers.
 * This handler requires raw buffer access for signature verification.
 * 
 * Usage in server/index.ts:
 * app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);
 */
export const webhookHandler = async (req: Request, res: Response) => {
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
  
  try {
    switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('🛒 Checkout session completed:', session.id);
      
      try {
        // Get the payment intent from the session
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
        console.log('💳 Retrieved payment intent from session:', paymentIntent.id);
        
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
          
          // Calculate payment per item
          const amountPerItem = Math.round(paymentIntent.amount / items.length);
          
          // Update each enrollment in database
          const updatedEnrollments = [];
          for (const item of items) {
            try {
              // Get all program enrollments from database
              const allEnrollments = await storage.getAllEnrollments();
              const enrollment = allEnrollments.find((e: any) => 
                e.childId === item.childId && (e.programId === item.classId || e.classId === item.classId)
              );
              
              if (enrollment) {
                const currentAmount = enrollment.totalPaid || 0;
                const newAmount = currentAmount + amountPerItem;
                const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);
                
                // Update program enrollment in database
                const updatedEnrollment = await storage.updateProgramEnrollment(enrollment.id, {
                  totalPaid: newAmount,
                  remainingBalance: remainingBalance,
                  paymentStatus: remainingBalance <= 0 ? 'completed' : 'deposit_paid',
                  status: 'enrolled'
                });
                
                if (updatedEnrollment) {
                  updatedEnrollments.push(updatedEnrollment);
                  console.log(`✅ Updated enrollment ${enrollment.id} for ${item.childName} in ${item.className}: paid=${newAmount}, remaining=${remainingBalance}`);
                }
              } else {
                console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
              }
            } catch (error) {
              console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
            }
          }
          
          console.log(`✅ Updated ${updatedEnrollments.length} enrollments for checkout session ${session.id}`);
          
          // Create payment record in database
          const parentUserForSession = await storage.getUserByEmail(parentEmail);
          const schoolIdForSession = parentUserForSession?.schoolId || updatedEnrollments[0]?.schoolId || 1;
          
          const payment = {
            schoolId: schoolIdForSession,
            parentId: parentUserForSession?.id,
            parentEmail: parentEmail,
            childName: items[0]?.childName || 'Unknown',
            className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
            description: `Checkout payment for ${items.length} enrollment${items.length > 1 ? 's' : ''}`,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency || 'usd',
            status: 'completed' as const,
            stripePaymentIntentId: paymentIntent.id,
            enrollmentIds: updatedEnrollments.map((e: any) => e.id),
            metadata: {
              checkoutSessionId: session.id,
              itemCount: items.length
            },
            paymentDate: new Date()
          };

          await storage.createPayment(payment);
          console.log('✅ Payment record created in database for checkout session:', session.id);
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
        
        // Check if this payment was already processed (to avoid double processing)
        const existingPayment = await storage.getPaymentByStripeId(paymentIntent.id);
        if (existingPayment) {
          console.log('⚠️ Payment already processed, skipping:', paymentIntent.id);
          break;
        }
        
        if (paymentType === 'scheduled_payment') {
          // Handle scheduled payment completion
          const scheduledPaymentId = paymentIntent.metadata.scheduledPaymentId;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          console.log(`💰 Processing completed scheduled payment: ${scheduledPaymentId} for ${parentEmail}`);
          
          // Get the scheduled payment from storage
          const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parentEmail);
          const scheduledPayment = allScheduledPayments.find(p => p.id === parseInt(scheduledPaymentId));
          
          if (scheduledPayment) {
            // Update the scheduled payment status to completed
            await storage.updateScheduledPaymentStatus(parseInt(scheduledPaymentId), 'completed');
            console.log(`✅ Marked scheduled payment ${scheduledPaymentId} as completed`);
            
            // UPDATE ENROLLMENT BALANCES - This was missing!
            console.log('💰 Updating enrollment balances for scheduled payment...');
            const enrollmentIds = scheduledPayment.enrollmentIds || [];
            const paymentAmountPerEnrollment = Math.round(paymentIntent.amount / enrollmentIds.length);
            
            for (const enrollmentId of enrollmentIds) {
              try {
                // Get program enrollment from database
                const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
                
                if (enrollment) {
                  const currentAmountPaid = enrollment.totalPaid || 0;
                  const newAmountPaid = currentAmountPaid + paymentAmountPerEnrollment;
                  const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
                  
                  // Update program enrollment in database
                  const updatedEnrollment = await storage.updateProgramEnrollment(enrollmentId, {
                    totalPaid: newAmountPaid,
                    remainingBalance: newBalance,
                    paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment'
                  });
                  
                  if (updatedEnrollment) {
                    console.log(`✅ Updated enrollment ${enrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);
                  }
                } else {
                  console.error(`❌ Enrollment ${enrollmentId} not found for scheduled payment`);
                }
              } catch (error) {
                console.error(`❌ Error updating enrollment ${enrollmentId}:`, error);
              }
            }
            
            // Create payment record for history in database
            const description = scheduledPayment.description || 'Payment';
            
            // Get parent user to get schoolId
            const parentUser = await storage.getUserByEmail(parentEmail);
            const schoolId = scheduledPayment.schoolId || parentUser?.schoolId || 1;
            
            const payment = {
              schoolId,
              parentId: parentUser?.id,
              parentEmail: parentEmail,
              childName: description.includes(' - ') ? description.split(' - ')[0] : 'Child',
              className: description.includes(' - ') ? description.split(' - ')[1] : description,
              description: `Scheduled payment ${scheduledPayment.installmentNumber} of ${scheduledPayment.totalInstallments}`,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              stripePaymentIntentId: paymentIntent.id,
              enrollmentIds: scheduledPayment.enrollmentIds || [],
              metadata: {
                scheduledPaymentId: scheduledPaymentId,
                installmentNumber: scheduledPayment.installmentNumber,
                totalInstallments: scheduledPayment.totalInstallments
              },
              paymentDate: new Date()
            };

            await storage.createPayment(payment);
            console.log(`✅ Created payment history record for scheduled payment ${scheduledPaymentId}`);
            
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
                description: scheduledPayment.description,
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
            // Calculate payment amount in dollars (Stripe amount is in cents)
            const totalAmount = paymentIntent.amount / 100;
            
            // Import and call the processBalancePayment function
            const { processBalancePayment } = await import('./api/billing.js');
            await processBalancePayment(paymentIntent, parentEmail, enrollmentIds, totalAmount);
            
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
            const items = JSON.parse(itemsJson);
            console.log('💰 Processing cart payment enrollments:', items.length, 'items for', parentEmail);
            
            // Calculate payment per item
            const amountPerItem = Math.round(paymentIntent.amount / items.length);
            
            // Update each enrollment in database
            const updatedEnrollments = [];
            for (const item of items) {
              try {
                // Get program enrollments from database
                const allEnrollments = await storage.getAllEnrollments();
                const enrollment = allEnrollments.find((e: any) => 
                  e.childId === item.childId && (e.programId === item.classId || e.classId === item.classId)
                );
                
                if (enrollment) {
                  const currentAmount = enrollment.totalPaid || 0;
                  const newAmount = currentAmount + amountPerItem;
                  const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);
                  
                  // Update program enrollment in database
                  const updatedEnrollment = await storage.updateProgramEnrollment(enrollment.id, {
                    totalPaid: newAmount,
                    remainingBalance: remainingBalance,
                    paymentStatus: remainingBalance <= 0 ? 'completed' : 'partial_payment',
                    status: 'enrolled'
                  });
                  
                  if (updatedEnrollment) {
                    updatedEnrollments.push(updatedEnrollment);
                    console.log(`✅ Updated enrollment ${enrollment.id} for ${item.childName} in ${item.className}: paid=${newAmount}, remaining=${remainingBalance}`);
                  }
                } else {
                  console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
                }
              } catch (error) {
                console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
              }
            }
            
            console.log(`✅ Updated ${updatedEnrollments.length} enrollments in database for payment ${paymentIntent.id}`);
            
            // Create payment record
            // Get schoolId from enrollment or parent user
            const parentUserForPayment = await storage.getUserByEmail(parentEmail);
            const schoolIdForPayment = updatedEnrollments[0]?.schoolId || parentUserForPayment?.schoolId || 1;
            
            const payment = {
              schoolId: schoolIdForPayment,
              parentId: parentUserForPayment?.id,
              stripePaymentIntentId: paymentIntent.id,
              parentEmail: parentEmail,
              childName: items[0]?.childName || 'Unknown',
              className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
              description: `Cart payment for ${items.length} enrollment${items.length > 1 ? 's' : ''}`,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              enrollmentIds: updatedEnrollments.map((e: any) => e.id),
              metadata: {
                itemCount: items.length
              },
              paymentDate: new Date()
            };

            await storage.createPayment(payment);
            console.log('✅ Payment record created for payment:', paymentIntent.id);
            
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

          // NOTE: Enrollments are now created BEFORE payment in stripe.ts using createProgramEnrollment()
          // This legacy code path for creating enrollments AFTER payment has been removed to prevent
          // database divergence. All enrollments should exist before the payment intent succeeds.
        }
      } catch (error) {
        console.error('❌ Error processing payment:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      console.log('❌ Payment failed:', failedPayment.id);
      break;

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
        
        // Create refund payment record
        const refundPaymentData = {
          stripePaymentIntentId: latestRefund.id,
          parentEmail: originalPayment.parentEmail,
          childName: originalPayment.childName,
          className: originalPayment.className,
          amount: -refundAmountCents, // Negative amount for refund
          currency: originalPayment.currency || 'usd',
          status: 'completed' as const,
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
          
          if (originalPayment.enrollmentIds && Array.isArray(originalPayment.enrollmentIds)) {
            // Use enrollmentIds from payment record for accurate matching
            matchingEnrollments = allEnrollments.filter((enrollment: any) => 
              originalPayment.enrollmentIds.includes(enrollment.id)
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
              const currentAmountPaid = enrollment.totalPaid || enrollment.amountPaid || 0;
              
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
            childName: originalPayment.childName,
            className: originalPayment.className,
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