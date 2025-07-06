
import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
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
    
    const description = `Class enrollments for ${uniqueChildren.join(', ')}: ${classNames.join(', ')}`;

    // Calculate fees (you can add processing fees here if needed)
    const applicationFeeAmount = Math.round(total * 0.03); // 3% processing fee

    console.log('💳 Payment details:', {
      amount: total,
      description,
      parentEmail: userEmail,
      itemCount: items.length,
      childrenCount: uniqueChildren.length,
      hasDiscounts: discounts.siblingDiscount > 0 || discounts.freeAfterThree > 0
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
        itemsJson: JSON.stringify(items.map((item: any) => ({
          classId: item.classId,
          className: item.className,
          childId: item.childId,
          childName: item.childName,
          price: item.price
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

  if (!sig || !endpointSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message);
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
          
          // Update each enrollment with payment information
          const allEnrollments = await storage.getAllEnrollments();
          for (const enrollmentId of enrollmentIds) {
            const enrollment = allEnrollments.find(e => e.id === enrollmentId);
            if (enrollment) {
              // Update enrollment with payment info
              enrollment.paymentIntentId = paymentIntent.id;
              enrollment.amount = paymentIntent.amount; // This should be split properly in production
              enrollment.status = 'enrolled';
              await storage.updateEnrollment(enrollment);
            }
          }
          
          console.log('✅ Balance payment processed for:', paymentIntent.id);
        } else {
          // Handle new enrollment payments
          const itemsJson = paymentIntent.metadata.itemsJson;
          if (itemsJson) {
            const items = JSON.parse(itemsJson);
            
            // Create enrollments for each item
            const enrollmentPromises = items.map(async (item: any) => {
              return storage.createEnrollment({
                classId: item.classId,
                childId: item.childId,
                status: 'enrolled',
                paymentIntentId: paymentIntent.id,
                amount: item.price,
                enrollmentDate: new Date().toISOString()
              });
            });

            await Promise.all(enrollmentPromises);
            console.log('✅ All enrollments processed for payment:', paymentIntent.id);
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

export default router;
