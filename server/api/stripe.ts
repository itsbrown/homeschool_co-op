
import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';

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

    const { items, subtotal, discounts, total, parentEmail } = req.body;

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
    
    // Determine if this is a deposit or full payment
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
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('💳 Payment succeeded:', paymentIntent.id);
      
      try {
        // Check if this is a balance payment or new enrollment
        const paymentType = paymentIntent.metadata.paymentType;
        
        if (paymentType === 'balance_payment') {
          // Handle balance payment - update existing enrollments
          const enrollmentIds = JSON.parse(paymentIntent.metadata.enrollmentIds || '[]');
          console.log('💰 Processing balance payment for enrollments:', enrollmentIds);
          
          // Calculate payment per enrollment
          const paymentPerEnrollment = Math.round(paymentIntent.amount / enrollmentIds.length);
          
          // Update each enrollment with payment information
          const allEnrollments = await storage.getAllEnrollments();
          for (const enrollmentId of enrollmentIds) {
            const enrollment = allEnrollments.find(e => e.id === enrollmentId) as any;
            if (enrollment) {
              // Update enrollment with payment info
              const newAmountPaid = (enrollment.amountPaid || enrollment.amount || 0) + paymentPerEnrollment;
              const remainingBalance = (enrollment.totalCost || 0) - newAmountPaid;
              
              enrollment.paymentIntentId = paymentIntent.id;
              enrollment.amount = newAmountPaid;
              enrollment.amountPaid = newAmountPaid;
              enrollment.remainingBalance = Math.max(0, remainingBalance);
              enrollment.outstandingBalance = Math.max(0, remainingBalance);
              enrollment.status = 'enrolled'; // Always enrolled after any payment
              
              console.log(`💰 Updated balance payment for enrollment ${enrollmentId}: paid=${newAmountPaid}, remaining=${remainingBalance}`);
              await storage.updateEnrollment(enrollment);
            }
          }
          
          console.log('✅ Balance payment processed for:', paymentIntent.id);
        } else {
          // Handle new enrollment payments
          const itemsJson = paymentIntent.metadata.itemsJson;
          const paymentType = paymentIntent.metadata.paymentType;
          const parentEmail = paymentIntent.metadata.parentEmail;
          
          if (itemsJson) {
            const items = JSON.parse(itemsJson);
            
            // Create payment record
            const payment = {
              id: Date.now(),
              stripePaymentIntentId: paymentIntent.id,
              parentEmail: parentEmail,
              childName: items[0]?.childName || 'Unknown',
              className: items[0]?.className || 'Unknown',
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              status: 'completed' as const,
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date()
            };

            try {
              const { storage } = await import('../storage');
              await storage.createPayment(payment);
              console.log('✅ Payment record created:', payment.id);
            } catch (error) {
              console.error('❌ Failed to create payment record:', error);
            }

            // Send confirmation email
            try {
              const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
              
              const enrollmentDetails = items.map((item: any) => ({
                childName: item.childName,
                className: item.className,
                price: (item.totalCost || item.price), // Already in cents from cart checkout
                amountPaid: Math.round(paymentIntent.amount / items.length), // Already in cents
              }));

              const emailSent = await sendPaymentConfirmationEmail({
                parentEmail: parentEmail,
                parentName: 'Parent', // Could be enhanced to get actual name
                payment: payment,
                enrollmentDetails: enrollmentDetails,
                paymentPlan: paymentType,
              });

              console.log('📧 Payment confirmation email sent:', emailSent);
            } catch (emailError) {
              console.error('❌ Failed to send payment confirmation email:', emailError);
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

export default router;
