import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { verifySupabaseToken } from '../middleware/unified-auth';

const router = Router();

// Initialize Stripe with validation
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is not set');
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

console.log('🔑 Stripe server-side validation:');
console.log('✅ Secret key starts with:', process.env.STRIPE_SECRET_KEY.substring(0, 15) + '...');
console.log('ℹ️  Publishable key validation is handled client-side');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

// Get billing summary for authenticated parent
router.get('/summary', async (req, res) => {
  try {
    console.log('💰 Billing summary API called');

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
      console.log('💰 Getting billing summary for:', userEmail);
    } catch (error) {
      console.error('❌ Error decoding token:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR'
      });
    }

    // Get children and their enrollments
    const children = await storage.getChildrenByParentEmail(userEmail);
    if (!children || children.length === 0) {
      console.log(`💰 No children found for parent ${userEmail}`);
      return res.status(200).json({
        totalBalance: 0,
        totalBalanceFormatted: '0.00',
        enrollmentCount: 0,
        enrollmentDetails: [],
        parentEmail: userEmail
      });
    }

    const allEnrollments = await storage.getAllEnrollments();
    const allClasses = await storage.getClasses({ page: 1, limit: 1000 });

    let totalBalance = 0;
    const enrollmentDetails = [];

    // Calculate balances for each enrollment
    for (const child of children) {
      const childEnrollments = allEnrollments.filter(e => e.childId === child.id);

      for (const enrollment of childEnrollments) {
        const classInfo = allClasses.find(c => c.id === enrollment.classId);
        let classPrice = classInfo ? (classInfo.price || 90000) : 90000; // Default $900

        // Ensure price is in cents - if it's a small number, it's likely in dollars
        if (classPrice < 10000) {
          classPrice = classPrice * 100; // Convert dollars to cents
        }

        // Calculate deposit and payment status
        const depositRequired = Math.round(classPrice * 0.1); // 10% deposit
        const amountPaid = enrollment.amount || 0;
        const balance = classPrice - amountPaid;
        
        if (balance > 0) {
          // Provide multiple payment options
          const paymentOptions = [];
          
          if (amountPaid < depositRequired) {
            // Haven't paid deposit yet - offer deposit or full payment
            paymentOptions.push({
              type: 'deposit',
              amount: depositRequired - amountPaid,
              description: '10% Deposit'
            });
            paymentOptions.push({
              type: 'full_payment',
              amount: balance,
              description: 'Pay in Full',
              discount: balance > 50000 ? 500 : 0 // $5 discount for full payment over $500
            });
          } else {
            // Deposit already paid - remaining balance only
            paymentOptions.push({
              type: 'remaining_balance',
              amount: balance,
              description: 'Remaining Balance'
            });
          }

          // For the total balance calculation, use the minimum payment option (usually deposit)
          const minPaymentAmount = Math.min(...paymentOptions.map(opt => opt.amount - (opt.discount || 0)));
          totalBalance += minPaymentAmount;
          
          enrollmentDetails.push({
            enrollmentId: enrollment.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: enrollment.className || classInfo?.title || 'Unknown Class',
            classPrice: classPrice,
            depositRequired: depositRequired,
            amountPaid: amountPaid,
            balance: balance,
            paymentOptions: paymentOptions,
            // Keep legacy fields for backward compatibility
            paymentType: paymentOptions[0]?.type || 'deposit',
            nextPaymentAmount: paymentOptions[0]?.amount || depositRequired,
            enrollmentDate: enrollment.enrollmentDate || new Date().toISOString(),
            status: enrollment.status || 'enrolled'
          });
        }
      }
    }

    console.log(`💰 Found total balance of $${totalBalance / 100} for ${userEmail}`);

    return res.status(200).json({
      totalBalance: totalBalance,
      totalBalanceFormatted: (totalBalance / 100).toFixed(2),
      enrollmentCount: enrollmentDetails.length,
      enrollmentDetails: enrollmentDetails,
      parentEmail: userEmail
    });

  } catch (error) {
    console.error('❌ Error getting billing summary:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'BILLING_SUMMARY_ERROR'
    });
  }
});

// Create payment intent for outstanding balance
router.post('/pay-balance', async (req, res) => {
  try {
    console.log('💳 Creating payment intent for outstanding balance');

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { enrollmentIds, totalAmount, paymentPlan } = req.body;

    if (!enrollmentIds || !Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ message: 'Enrollment IDs are required' });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ message: 'Invalid total amount' });
    }

    // Verify enrollments belong to this parent
    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);
    const allEnrollments = await storage.getAllEnrollments();

    const selectedEnrollments = allEnrollments.filter(e => 
      enrollmentIds.includes(e.id) && childIds.includes(e.childId)
    );

    if (selectedEnrollments.length !== enrollmentIds.length) {
      return res.status(403).json({ message: 'Unauthorized enrollments detected' });
    }

    // Create payment intent
    console.log('💳 Creating Stripe payment intent with data:', {
      amount: totalAmount,
      currency: 'usd',
      enrollmentIds,
      parentEmail: userEmail,
      stripeKeyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 15)
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      metadata: {
        paymentType: 'balance_payment',
        enrollmentIds: JSON.stringify(enrollmentIds),
        parentEmail: userEmail,
        enrollmentCount: enrollmentIds.length.toString(),
        paymentPlan: paymentPlan || 'full_payment',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created successfully:', {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      status: paymentIntent.status,
      clientSecretPrefix: paymentIntent.client_secret?.substring(0, 20) + '...'
    });

    // Validate the client secret format
    if (!paymentIntent.client_secret) {
      console.error('❌ No client secret returned from Stripe');
      throw new Error('No client secret returned from Stripe');
    }

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error: any) {
    console.error('❌ Error creating balance payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

export default router;