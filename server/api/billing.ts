import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

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
    const allClasses = await storage.getAllClasses();

    let totalBalance = 0;
    const enrollmentDetails = [];

    // Calculate balances for each enrollment
    for (const child of children) {
      const childEnrollments = allEnrollments.filter(e => e.childId === child.id);

      for (const enrollment of childEnrollments) {
        const classInfo = allClasses.find(c => c.id === enrollment.classId);
        const classPrice = classInfo ? (classInfo.price || 90000) : 90000; // Default $900

        // Check if payment was made (from payment history or enrollment data)
        const amountPaid = enrollment.amount || 0;
        const balance = classPrice - amountPaid;

        if (balance > 0) {
          totalBalance += balance;
          enrollmentDetails.push({
            enrollmentId: enrollment.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: enrollment.className || classInfo?.title || 'Unknown Class',
            classPrice: classPrice,
            amountPaid: amountPaid,
            balance: balance,
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

    const { enrollmentIds, totalAmount } = req.body;

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

    // Create Stripe payment intent
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      description: `Balance payment for ${selectedEnrollments.length} enrollment(s)`,
      metadata: {
        parentEmail: userEmail,
        enrollmentIds: JSON.stringify(enrollmentIds),
        paymentType: 'balance_payment'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created for balance payment:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
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