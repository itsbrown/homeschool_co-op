
import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { sendPaymentReceipt } from '../lib/email-service';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil',
});

// Create payment intent for cart checkout
router.post('/create-payment-intent', async (req, res) => {
  try {
    console.log('💳 Creating payment intent for cart checkout');
    
    // Get the authenticated user's email from the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_AUTH_HEADER'
      });
    }

    const token = authHeader.split(' ')[1];
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      console.log('💳 Creating payment intent for user:', userEmail);
    } catch (error) {
      console.error('❌ Error decoding token:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR'
      });
    }

    const { items, subtotal, discounts, total, parentEmail, paymentPlan = 'full' } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'Cart items are required',
        error: 'MISSING_ITEMS'
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({
        message: 'Invalid total amount',
        error: 'INVALID_TOTAL'
      });
    }

    // Verify user owns the children in the cart
    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);
    
    const invalidItems = items.filter((item: any) => !childIds.includes(item.childId));
    if (invalidItems.length > 0) {
      return res.status(403).json({
        message: 'Unauthorized: Cannot enroll children not owned by this parent',
        error: 'UNAUTHORIZED_CHILDREN'
      });
    }

    // Create detailed description for payment
    const uniqueChildren = [...new Set(items.map((item: any) => item.childName))];
    const classNames = items.map((item: any) => item.className);
    
    // Handle payment plans using Stripe subscription schedules
    if (paymentPlan !== 'full') {
      console.log('💳 Processing payment plan enrollment with Stripe subscription schedules:', paymentPlan);
      
      try {
        // Create enrollments first
        const enrollmentIds = [];
        for (const item of items) {
          const enrollment = await storage.createEnrollment({
            programId: item.classId,
            parentId: 0, // Will be updated later
            parentEmail: userEmail,
            childId: item.childId,
            childName: item.childName,
            className: item.className,
            totalCost: item.totalCost,
            remainingBalance: item.totalCost,
            paymentStatus: 'stripe_managed',
            paymentSystemVersion: 'v2_stripe',
            status: 'enrolled',
            createdAt: new Date(),
            updatedAt: new Date()
          });
          enrollmentIds.push(enrollment.id);
        }

        // Create Stripe subscription schedule for payment plan
        const paymentPlanService = new StripePaymentPlanService(storage);
        const schedule = await paymentPlanService.createEducationalPaymentPlan({
          parentEmail: userEmail,
          enrollmentIds,
          totalAmount: total,
          paymentPlan: paymentPlan as 'deposit' | 'split' | 'monthly' | 'full'
        });

        return res.json({
          success: true,
          subscriptionScheduleId: schedule.id,
          enrollmentIds,
          message: `Payment plan created successfully. Stripe will handle the payment schedule.`
        });

      } catch (error) {
        console.error('❌ Error creating subscription schedule:', error);
        return res.status(500).json({
          message: 'Failed to create payment plan',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // For full payments, use the existing payment intent flow
    const isDepositPayment = items.some((item: any) => item.paymentType === 'deposit');
    const paymentTypeDescription = isDepositPayment ? 'Deposit Payment' : 'Class Enrollment Payment';
    
    const description = `${paymentTypeDescription} for ${uniqueChildren.join(', ')}: ${classNames.join(', ')}`;

    // Calculate fees (you can add processing fees here if needed)
    const applicationFeeAmount = Math.round(total * 0.03); // 3% processing fee

    console.log('💳 Payment details:', {
      amount: total,
      amountInCents: total + ' cents',
      expectedInDollars: (total / 100).toFixed(2),
      description,
      parentEmail: userEmail,
      itemCount: items.length,
      childrenCount: uniqueChildren.length,
      hasDiscounts: discounts.siblingDiscount > 0 || discounts.freeAfterThree > 0,
      rawItems: items
    });

    // Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total, // Amount in cents
      currency: 'usd',
      description,
      metadata: {
        parentEmail: userEmail,
        itemCount: items.length.toString(),
        childrenCount: uniqueChildren.length.toString(),
        subtotal: subtotal.toString(),
        siblingDiscount: discounts.siblingDiscount.toString(),
        freeAfterThreeDiscount: discounts.freeAfterThree.toString(),
        appliedDiscountsCount: discounts.appliedDiscounts?.length.toString() || '0',
        totalDiscountAmount: discounts.totalDiscountAmount?.toString() || '0',
        appliedDiscountsJson: JSON.stringify(discounts.appliedDiscounts || []),
        paymentType: isDepositPayment ? 'deposit' : 'full_payment',
        itemsJson: JSON.stringify(items.map((item: any) => ({
          classId: item.classId,
          className: item.className,
          childId: item.childId,
          childName: item.childName,
          price: item.price,
          paymentType: item.paymentType || 'deposit',
          depositRequired: item.depositRequired,
          totalCost: item.totalCost
        })))
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error: any) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// Webhook to handle successful payments
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('🔍 Webhook received:', {
    hasSignature: !!sig,
    hasEndpointSecret: !!endpointSecret,
    bodyType: typeof req.body,
    bodyLength: req.body?.length || 0,
    isBuffer: Buffer.isBuffer(req.body),
    signaturePrefix: sig ? (typeof sig === 'string' ? sig.substring(0, 20) + '...' : 'array') : 'none',
    secretPrefix: endpointSecret ? endpointSecret.substring(0, 10) + '...' : 'none'
  });

  if (!sig || !endpointSecret) {
    console.error('❌ Missing webhook requirements:', { hasSignature: !!sig, hasEndpointSecret: !!endpointSecret });
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  // The raw body should be a Buffer from express.raw() middleware
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
    // Use the raw buffer directly for signature verification
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    console.log('✅ Webhook signature verified successfully');
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message);
    console.error('Debug info:', {
      payloadType: typeof payload,
      payloadLength: payload?.length,
      signatureType: typeof sig,
      secretExists: !!endpointSecret,
      isBuffer: Buffer.isBuffer(payload)
    });
    
    // In development, allow webhook processing even with signature failure for testing
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('🔧 Development mode: Processing webhook despite signature verification failure');
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
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  // Handle the event
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
          
          // Update each enrollment
          const updatedEnrollments = [];
          for (const item of items) {
            try {
              // Find enrollment by child and class
              const allEnrollments = await storage.getAllEnrollments();
              const enrollment = allEnrollments.find(e => 
                e.childId === item.childId && e.classId === item.classId
              ) as any;
              
              if (enrollment) {
                const currentAmount = enrollment.amount || 0;
                const newAmount = currentAmount + amountPerItem;
                const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);
                
                const updatedEnrollment = {
                  ...enrollment,
                  amount: newAmount,
                  remainingBalance: remainingBalance,
                  status: 'enrolled' as const,
                  paymentIntentId: paymentIntent.id
                };
                
                await storage.updateEnrollment(updatedEnrollment);
                updatedEnrollments.push(updatedEnrollment);
                console.log(`✅ Updated enrollment for ${item.childName} in ${item.className}: amount=${newAmount}, remaining=${remainingBalance}`);
              } else {
                console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
              }
            } catch (error) {
              console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
            }
          }
          
          console.log(`✅ Updated ${updatedEnrollments.length} enrollments for checkout session ${session.id}`);
          
          // Create payment record
          const payment = {
            stripePaymentIntentId: paymentIntent.id,
            parentEmail: parentEmail,
            childName: items[0]?.childName || 'Unknown',
            className: items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown'),
            amount: paymentIntent.amount,
            currency: paymentIntent.currency || 'usd',
            status: 'completed' as const,
            metadata: {
              checkoutSessionId: session.id,
              itemCount: items.length
            }
          };

          await storage.createPayment(payment);
          console.log('✅ Payment record created for checkout session:', session.id);
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
            // Update the scheduled payment status to paid
            await storage.updateScheduledPaymentStatus(parseInt(scheduledPaymentId), 'paid');
            console.log(`✅ Marked scheduled payment ${scheduledPaymentId} as paid`);
            
            // UPDATE ENROLLMENT BALANCES - This was missing!
            console.log('💰 Updating enrollment balances for scheduled payment...');
            const enrollmentIds = scheduledPayment.enrollmentIds || [];
            const paymentAmountPerEnrollment = Math.round(paymentIntent.amount / enrollmentIds.length);
            
            for (const enrollmentId of enrollmentIds) {
              try {
                // Use specific enrollment lookup instead of getting all enrollments
                const enrollment = await storage.getEnrollmentById(enrollmentId);
                
                if (enrollment) {
                  const currentAmountPaid = enrollment.totalPaid || enrollment.amountPaid || enrollment.amount || 0;
                  const newAmountPaid = currentAmountPaid + paymentAmountPerEnrollment;
                  const newBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
                  
                  // Update enrollment with new payment and installment tracking
                  const currentInstallmentsPaid = (enrollment.installmentsPaid || 0) + 1;
                  const totalInstallments = enrollment.totalInstallments || scheduledPayment.totalInstallments || 3;
                  
                  const updatedEnrollment = {
                    ...enrollment,
                    amount: newAmountPaid,
                    amountPaid: newAmountPaid,
                    totalPaid: newAmountPaid,
                    remainingBalance: newBalance,
                    paymentIntentId: paymentIntent.id,
                    installmentsPaid: currentInstallmentsPaid,
                    totalInstallments: totalInstallments,
                    paymentPlanStatus: newBalance <= 0 ? 'completed' : 'in_progress',
                    // Update payment status based on remaining balance
                    paymentStatus: newBalance <= 0 ? 'completed' : 'payment_plan_active'
                  };
                  
                  await storage.updateEnrollment(updatedEnrollment);
                  console.log(`✅ Updated enrollment ${enrollmentId}: paid=${newAmountPaid}, balance=${newBalance}`);
                } else {
                  console.error(`❌ Enrollment ${enrollmentId} not found for scheduled payment`);
                }
              } catch (error) {
                console.error(`❌ Error updating enrollment ${enrollmentId}:`, error);
              }
            }
            
            // Create payment record for history
            const description = scheduledPayment.description || 'Payment';
            const payment = {
              stripePaymentIntentId: paymentIntent.id,
              parentEmail: parentEmail,
              childName: description.includes(' - ') ? description.split(' - ')[0] : 'Child',
              className: description.includes(' - ') ? description.split(' - ')[1] : description,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              metadata: {
                scheduledPaymentId: scheduledPaymentId,
                installmentNumber: scheduledPayment.installmentNumber,
                totalInstallments: scheduledPayment.totalInstallments
              }
            };

            await storage.createPayment(payment);
            console.log(`✅ Created payment history record for scheduled payment ${scheduledPaymentId}`);
            
            // Send email receipt for scheduled payment
            try {
              const parentUser = await storage.getUserByEmail(parentEmail);
              const parentName = parentUser ? 
                `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() : 
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
              const { dataLayer } = await import('../services/dataLayer.js');
              
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
            const { processBalancePayment } = await import('../api/billing.js');
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
                `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() : 
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
            
            // Update each enrollment
            const updatedEnrollments = [];
            for (const item of items) {
              try {
                // Find enrollment by child and class
                const allEnrollments = await storage.getAllEnrollments();
                const enrollment = allEnrollments.find(e => 
                  e.childId === item.childId && e.classId === item.classId
                ) as any;
                
                if (enrollment) {
                  const currentAmount = enrollment.amount || 0;
                  const newAmount = currentAmount + amountPerItem;
                  const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);
                  
                  const updatedEnrollment = {
                    ...enrollment,
                    amount: newAmount,
                    remainingBalance: remainingBalance,
                    status: 'enrolled' as const,
                    paymentIntentId: paymentIntent.id
                  };
                  
                  await storage.updateEnrollment(updatedEnrollment);
                  updatedEnrollments.push(updatedEnrollment);
                  console.log(`✅ Updated enrollment for ${item.childName} in ${item.className}: amount=${newAmount}, remaining=${remainingBalance}`);
                } else {
                  console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
                }
              } catch (error) {
                console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
              }
            }
            
            console.log(`✅ Updated ${updatedEnrollments.length} enrollments for payment ${paymentIntent.id}`);
            
            // Create payment record
            const payment = {
              stripePaymentIntentId: paymentIntent.id,
              parentEmail: parentEmail,
              childName: items[0]?.childName || 'Unknown',
              className: items[0]?.className || 'Unknown',
              amount: paymentIntent.amount,
              currency: paymentIntent.currency || 'usd',
              status: 'completed' as const,
              metadata: {}
            };

            let createdPayment;
            try {
              const { storage } = await import('../storage');
              createdPayment = await storage.createPayment(payment);
              console.log('✅ Payment record created:', createdPayment.id);
            } catch (error) {
              console.error('❌ Failed to create payment record:', error);
              return; // Exit early if payment creation fails
            }

            // Send confirmation email receipt
            try {
              const parentUser = await storage.getUserByEmail(parentEmail);
              const parentName = parentUser ? 
                `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() : 
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
                notes: paymentType ? `Payment plan: ${paymentType}` : undefined
              });

              console.log('📧 New enrollment payment receipt email sent to:', parentEmail);
            } catch (emailError) {
              console.error('❌ Failed to send enrollment payment receipt email:', emailError);
            }

            // Handle scheduled payments for 3-payment plans
            if (paymentType === 'three_payments') {
              try {
                console.log('🗓️ Creating scheduled payments for 3-payment plan...');
                
                // Get enrollment IDs from items
                const enrollmentIds = items.map((item: any) => item.enrollmentId || item.classId);
                const remainingAmount = Math.round(paymentIntent.amount * 2); // Remaining 2/3 of total amount
                const installmentAmount = Math.round(remainingAmount / 2); // Split remaining into 2 payments
                
                // Create 2 scheduled payments (1 month and 2 months from now)
                const scheduledPayments = [
                  {
                    parentEmail: parentEmail,
                    enrollmentIds: enrollmentIds,
                    paymentPlan: 'three_payments',
                    installmentNumber: 2,
                    totalInstallments: 3,
                    amount: installmentAmount,
                    currency: 'usd',
                    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                    status: 'pending' as const,
                    originalPaymentId: createdPayment?.id || null,
                    description: `Payment 2 of 3 for ${items.map((i: any) => i.className).join(', ')}`
                  },
                  {
                    parentEmail: parentEmail,
                    enrollmentIds: enrollmentIds,
                    paymentPlan: 'three_payments',
                    installmentNumber: 3,
                    totalInstallments: 3,
                    amount: installmentAmount,
                    currency: 'usd',
                    dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
                    status: 'pending' as const,
                    originalPaymentId: createdPayment?.id || null,
                    description: `Payment 3 of 3 for ${items.map((i: any) => i.className).join(', ')}`
                  }
                ];

                // Create the scheduled payments
                for (const scheduledPayment of scheduledPayments) {
                  await storage.createScheduledPayment(scheduledPayment);
                  console.log(`✅ Created scheduled payment ${scheduledPayment.installmentNumber}/3 due ${scheduledPayment.dueDate.toLocaleDateString()}`);
                }
              } catch (error) {
                console.error('❌ Failed to create scheduled payments:', error);
              }
            }
            
            if (paymentType === 'deposit') {
              // Handle deposit payments - update existing enrollments or create new ones
              const enrollmentPromises = items.map(async (item: any) => {
                // Check if enrollment already exists
                const allEnrollments = await storage.getAllEnrollments();
                const existingEnrollment = allEnrollments.find(e => 
                  (e as any).classId === item.classId && e.childId === item.childId
                ) as any;
                
                if (existingEnrollment) {
                  // Update existing enrollment with deposit payment
                  const newAmountPaid = (existingEnrollment.amount || 0) + item.price;
                  const remainingBalance = item.totalCost - newAmountPaid;
                  
                  // For payment plans: even a 10% payment makes them enrolled with remaining balance
                  const status = 'enrolled'; // Always enrolled after any payment
                  
                  existingEnrollment.amount = newAmountPaid;
                  existingEnrollment.amountPaid = newAmountPaid;
                  existingEnrollment.status = status;
                  existingEnrollment.paymentIntentId = paymentIntent.id;
                  existingEnrollment.remainingBalance = Math.max(0, remainingBalance);
                  existingEnrollment.outstandingBalance = Math.max(0, remainingBalance);
                  
                  console.log(`💰 Updated enrollment ${existingEnrollment.id}: paid=${newAmountPaid}, remaining=${remainingBalance}, status=${status}`);
                  return storage.updateEnrollment(existingEnrollment);
                } else {
                  // Create new enrollment - any payment makes them enrolled with payment plan if not full amount
                  const remainingBalance = item.totalCost - item.price;
                  const status = 'enrolled'; // Always enrolled after payment, even if partial
                  
                  const newEnrollment = {
                    classId: item.classId,
                    childId: item.childId,
                    status: status,
                    paymentIntentId: paymentIntent.id,
                    amount: item.price,
                    amountPaid: item.price,
                    totalCost: item.totalCost,
                    depositRequired: item.depositRequired,
                    remainingBalance: Math.max(0, remainingBalance),
                    outstandingBalance: Math.max(0, remainingBalance),
                    enrollmentDate: new Date().toISOString()
                  } as any;
                  
                  console.log(`💰 Created new enrollment: paid=${item.price}, remaining=${remainingBalance}, status=${status}`);
                  return storage.createEnrollment(newEnrollment);
                }
              });
              
              await Promise.all(enrollmentPromises);
              console.log('✅ All deposit payments processed for payment:', paymentIntent.id);
            } else if (paymentType === 'three_payments') {
              // Handle 3-payment plan first payment - create enrollments with remaining balance
              const enrollmentPromises = items.map(async (item: any) => {
                const totalCost = item.totalCost || (item.price * 3); // Calculate total if not provided
                const remainingBalance = totalCost - item.price; // Amount still owed after first payment
                
                return storage.createEnrollment({
                  classId: item.classId,
                  childId: item.childId,
                  status: 'enrolled', // Enrolled after first payment
                  paymentIntentId: paymentIntent.id,
                  amount: item.price,
                  amountPaid: item.price,
                  totalCost: totalCost,
                  remainingBalance: remainingBalance,
                  outstandingBalance: remainingBalance,
                  enrollmentDate: new Date().toISOString()
                } as any);
              });

              await Promise.all(enrollmentPromises);
              console.log('✅ All 3-payment plan enrollments processed for payment:', paymentIntent.id);
              
              // Create scheduled payments for the remaining 2 installments
              const amountPerPayment = Math.round(paymentIntent.amount); // Same amount as first payment
              const schedulePromises = items.map(async (item: any, index: number) => {
                // Create 2nd payment (due in 30 days)
                const payment2DueDate = new Date();
                payment2DueDate.setDate(payment2DueDate.getDate() + 30);
                
                const scheduledPayment2 = {
                  parentEmail: parentEmail,
                  enrollmentIds: [item.classId], // Use classId as placeholder
                  amount: amountPerPayment,
                  paymentPlan: 'three_payments',
                  installmentNumber: 2,
                  totalInstallments: 3,
                  dueDate: payment2DueDate,
                  description: `${item.childName} - ${item.className}`,
                  status: 'pending' as const
                };
                
                // Create 3rd payment (due in 60 days)  
                const payment3DueDate = new Date();
                payment3DueDate.setDate(payment3DueDate.getDate() + 60);
                
                const scheduledPayment3 = {
                  parentEmail: parentEmail,
                  enrollmentIds: [item.classId], // Use classId as placeholder
                  amount: amountPerPayment,
                  paymentPlan: 'three_payments',
                  installmentNumber: 3,
                  totalInstallments: 3,
                  dueDate: payment3DueDate,
                  description: `${item.childName} - ${item.className}`,
                  status: 'pending' as const
                };
                
                // Create both scheduled payments
                await storage.createScheduledPayment(scheduledPayment2);
                await storage.createScheduledPayment(scheduledPayment3);
                
                console.log(`📅 Created scheduled payments for ${item.childName} - ${item.className}: Payment 2 due ${payment2DueDate.toDateString()}, Payment 3 due ${payment3DueDate.toDateString()}`);
              });
              
              await Promise.all(schedulePromises);
              console.log('✅ Created scheduled payments for 3-payment plan');
            } else {
              // Handle full payments - create enrollments or update to fully paid
              const enrollmentPromises = items.map(async (item: any) => {
                return storage.createEnrollment({
                  classId: item.classId,
                  childId: item.childId,
                  status: 'enrolled',
                  paymentIntentId: paymentIntent.id,
                  amount: item.price,
                  totalCost: item.totalCost,
                  remainingBalance: 0,
                  enrollmentDate: new Date().toISOString()
                });
              });

              await Promise.all(enrollmentPromises);
              console.log('✅ All full payments processed for payment:', paymentIntent.id);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error processing payment:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      console.log('❌ Payment failed:', failedPayment.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});


// Test endpoint to verify email service (temporary)
router.post('/test-email', async (req, res) => {
  try {
    console.log('🧪 Starting email service test...');
    console.log('🔧 Environment check:', {
      hasBrevoSender: !!process.env.BREVO_SENDER_EMAIL,
      senderEmail: process.env.BREVO_SENDER_EMAIL
    });
    
    const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
    console.log('📧 Email service imported successfully');
    
    const testPayment = {
      id: Date.now(),
      stripePaymentIntentId: 'pi_test_' + Date.now(),
      parentEmail: 'jocimarie@gmail.com',
      childName: 'Test Child',
      className: 'Test Class',
      amount: 1400, // $14.00 in cents
      currency: 'usd',
      status: 'completed' as const,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const enrollmentDetails = [{
      childName: 'Test Child',
      className: 'Elementary Math Fundamentals',
      price: 140,
      amountPaid: 14,
    }];

    console.log('📤 Attempting to send test email to: jocimarie@gmail.com');
    const emailSent = await sendPaymentConfirmationEmail({
      parentEmail: 'jocimarie@gmail.com',
      parentName: 'Test Parent',
      payment: testPayment,
      enrollmentDetails: enrollmentDetails,
      paymentPlan: 'deposit',
    });

    console.log('✅ Test email function completed. Result:', emailSent);
    
    if (emailSent) {
      console.log('🎉 EMAIL SERVICE WORKING! Check your email at jocimarie@gmail.com');
    } else {
      console.log('❌ Email service returned false - check Brevo configuration');
    }
    
    res.json({ 
      success: true, 
      message: emailSent ? 'Test email sent successfully!' : 'Email service failed',
      result: emailSent,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Test email failed with error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

// Backup payment processing endpoint - processes any successful payment by payment intent ID
router.post('/process-payment/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    console.log('🔄 Manual payment processing requested for:', paymentIntentId);

    // Get the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: 'Payment has not succeeded'
      });
    }

    // Extract metadata
    const itemsJson = paymentIntent.metadata.itemsJson;
    const parentEmail = paymentIntent.metadata.parentEmail;
    const paymentType = paymentIntent.metadata.paymentType;

    if (!itemsJson || !parentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment metadata'
      });
    }

    const items = JSON.parse(itemsJson);
    console.log('💰 Processing manual payment for', items.length, 'items for', parentEmail);

    // Calculate payment per item
    const amountPerItem = Math.round(paymentIntent.amount / items.length);
    
    // Update each enrollment
    const updatedEnrollments = [];
    for (const item of items) {
      try {
        // Find enrollment by child and class
        const allEnrollments = await storage.getAllEnrollments();
        const enrollment = allEnrollments.find(e => 
          e.childId === item.childId && e.classId === item.classId
        ) as any;
        
        if (enrollment) {
          const currentAmount = enrollment.amount || 0;
          const newAmount = currentAmount + amountPerItem;
          const remainingBalance = Math.max(0, (enrollment.totalCost || item.totalCost || 0) - newAmount);
          
          const updatedEnrollment = {
            ...enrollment,
            amount: newAmount,
            remainingBalance: remainingBalance,
            status: 'enrolled' as const,
            paymentIntentId: paymentIntent.id
          };
          
          await storage.updateEnrollment(updatedEnrollment);
          updatedEnrollments.push(updatedEnrollment);
          console.log(`✅ Updated enrollment for ${item.childName} in ${item.className}: amount=${newAmount}, remaining=${remainingBalance}`);
        } else {
          console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
        }
      } catch (error) {
        console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
      }
    }

    // Create payment record for history
    const payment = {
      stripePaymentIntentId: paymentIntent.id,
      parentEmail: parentEmail,
      childName: items[0]?.childName || 'Student',
      className: items.length > 1 ? `${items.length} classes` : items[0]?.className || 'Class',
      amount: paymentIntent.amount,
      currency: paymentIntent.currency || 'usd',
      status: 'completed' as const,
      metadata: {
        itemCount: items.length,
        paymentType: paymentType,
        manuallyProcessed: true
      }
    };

    await storage.createPayment(payment);
    console.log('✅ Created payment history record for manual processing');

    res.json({
      success: true,
      message: `Successfully processed payment for ${updatedEnrollments.length} enrollments`,
      updatedEnrollments: updatedEnrollments.length,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('❌ Error processing manual payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment'
    });
  }
});

// Get subscription schedules for a parent
router.get('/subscription-schedules', async (req, res) => {
  try {
    // Get the authenticated user's email from the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_AUTH_HEADER'
      });
    }

    const token = authHeader.split(' ')[1];
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
    } catch (error) {
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR'
      });
    }

    // Get subscription schedules from storage
    const schedules = await storage.getStripeSubscriptionSchedules(userEmail);
    
    // Fetch current status from Stripe for each schedule
    const enrichedSchedules = await Promise.all(
      schedules.map(async (schedule) => {
        try {
          const stripeSchedule = await stripe.subscriptionSchedules.retrieve(schedule.stripeScheduleId);
          return {
            ...schedule,
            stripeStatus: stripeSchedule.status,
            currentPhase: stripeSchedule.current_phase,
            phases: stripeSchedule.phases,
            nextInvoice: stripeSchedule.subscription ? 
              await stripe.invoices.retrieveUpcoming({ 
                subscription: stripeSchedule.subscription as string 
              }).catch(() => null) : null
          };
        } catch (error) {
          console.error('Error fetching Stripe schedule:', error);
          return {
            ...schedule,
            stripeStatus: 'unknown',
            error: 'Failed to fetch from Stripe'
          };
        }
      })
    );

    res.json({
      success: true,
      schedules: enrichedSchedules
    });

  } catch (error) {
    console.error('Error fetching subscription schedules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
