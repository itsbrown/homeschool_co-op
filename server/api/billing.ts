import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { insertPaymentSchema, type InsertPayment } from '@shared/schema';
import { sendPaymentConfirmationEmail } from '../lib/email-service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', parentEmail, enrollmentDetails } = req.body;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        parentEmail,
        enrollmentDetails: JSON.stringify(enrollmentDetails)
      }
    });

    // Store payment in database
    const paymentData: InsertPayment = {
      status: 'pending',
      parentEmail,
      stripePaymentIntentId: paymentIntent.id,
      amount,
      currency,
      enrollmentIds: enrollmentDetails,
      description: `Payment for ${enrollmentDetails.length} enrollment(s)`,
      metadata: {
        enrollmentDetails,
        clientSecret: paymentIntent.client_secret
      }
    };

    await storage.createPayment(paymentData);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
});

// Handle payment confirmation
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, parentEmail, enrollmentDetails } = req.body;

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update payment status in database
      const payment = await storage.getPaymentByStripeId(paymentIntentId);
      if (payment) {
        await storage.updatePaymentStatus(payment.id, 'succeeded');
      }

      // Send confirmation email
      const emailData = {
        parentEmail,
        payment: {
          ...payment!,
          status: 'succeeded' as const
        },
        enrollmentDetails: enrollmentDetails.map((detail: any) => ({
          childName: detail.childName,
          className: detail.className,
          price: detail.price,
          amountPaid: detail.amountPaid
        }))
      };

      await sendPaymentConfirmationEmail(emailData);

      res.json({
        success: true,
        message: 'Payment confirmed and email sent',
        payment: {
          id: payment?.id,
          status: 'succeeded',
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment not successful',
        status: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm payment'
    });
  }
});

// Get payment status
router.get('/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    
    const payment = await storage.getPaymentByStripeId(paymentIntentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Also check Stripe for the latest status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: paymentIntent.status,
        amount: payment.amount,
        currency: payment.currency,
        parentEmail: payment.parentEmail,
        createdAt: payment.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment status'
    });
  }
});

// Get billing summary for a parent
router.get('/summary', async (req, res) => {
  try {
    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    console.log('🔍 Getting billing summary for:', userEmail);

    // Get all children for this parent
    const children = await storage.getChildrenByParentEmail(userEmail);
    if (!children || children.length === 0) {
      console.log('📋 No children found for parent:', userEmail);
      return res.json({
        totalBalance: 0,
        totalBalanceFormatted: '$0.00',
        enrollmentCount: 0,
        enrollmentDetails: [],
        parentEmail: userEmail
      });
    }

    const childIds = children.map(child => child.id);
    console.log('👶 Found children:', childIds);

    // Get all class enrollments for these children
    const allEnrollments = [];
    for (const childId of childIds) {
      console.log(`🔍 Fetching enrollments for child ID: ${childId}`);
      const childEnrollments = await storage.getEnrollmentsByChildId(childId);
      console.log(`📋 Child ${childId} has ${childEnrollments.length} enrollments:`, childEnrollments);
      allEnrollments.push(...childEnrollments);
    }
    console.log('📋 Total enrollments found:', allEnrollments.length);
    console.log('📋 All enrollments:', allEnrollments);

    // Calculate enrollment details with balances
    const enrollmentDetails = [];
    let totalBalance = 0;

    for (const enrollment of allEnrollments) {
      // Get class details
      const classDetails = await storage.getClassById(enrollment.classId);
      if (!classDetails) continue;

      // Get child details
      const child = children.find(c => c.id === enrollment.childId);
      if (!child) continue;

      // Calculate balance based on enrollment data
      // Convert class price from cents to dollars if needed
      const classPrice = classDetails.price || 0;
      const totalAmount = enrollment.totalCost || (classPrice > 10000 ? classPrice / 100 : classPrice);
      const totalPaid = enrollment.amount || 0;
      const balance = totalAmount - totalPaid;

      if (balance > 0) {
        enrollmentDetails.push({
          enrollmentId: enrollment.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classDetails.title,
          classPrice: totalAmount,
          amountPaid: totalPaid,
          balance: balance,
          status: enrollment.status,
          enrollmentDate: enrollment.enrollmentDate,
          depositRequired: enrollment.depositRequired || Math.round(totalAmount * 0.1)
        });
        totalBalance += balance;
      }
    }

    const summary = {
      totalBalance: totalBalance,
      totalBalanceFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(totalBalance),
      enrollmentCount: enrollmentDetails.length,
      enrollmentDetails: enrollmentDetails,
      parentEmail: userEmail
    };

    console.log('✅ Billing summary generated:', {
      totalBalance,
      enrollmentCount: enrollmentDetails.length,
      parentEmail: userEmail
    });

    res.json(summary);
  } catch (error) {
    console.error('❌ Error getting billing summary:', error);
    res.status(500).json({ 
      error: 'Failed to get billing summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Pay balance endpoint
router.post('/pay-balance', async (req, res) => {
  try {
    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    const { enrollmentIds, totalAmount, paymentDetails, paymentPlan } = req.body;

    console.log('💳 Processing payment for:', userEmail, 'Amount:', totalAmount);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents for Stripe
      currency: 'usd',
      metadata: {
        parentEmail: userEmail,
        enrollmentIds: JSON.stringify(enrollmentIds),
        paymentPlan: paymentPlan
      }
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
});

export default router;