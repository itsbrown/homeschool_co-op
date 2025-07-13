import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { insertPaymentSchema, type InsertPayment } from '@shared/schema';
import { sendPaymentConfirmationEmail } from '../lib/email-service';

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
    const userEmail = req.auth?.payload?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    console.log('🔍 Getting billing summary for:', userEmail);

    // Get all enrollments for this parent
    const allEnrollments = await storage.getAllProgramEnrollments();
    const userEnrollments = allEnrollments.filter(enrollment => 
      enrollment.parentEmail === userEmail
    );

    console.log('📋 Found enrollments:', userEnrollments.length);

    // Calculate enrollment details with balances
    const enrollmentDetails = [];
    let totalBalance = 0;

    for (const enrollment of userEnrollments) {
      // Get program details
      const program = await storage.getProgramById(enrollment.programId);
      if (!program) continue;

      // Get child details
      const child = await storage.getChildById(enrollment.childId);
      if (!child) continue;

      const balance = (enrollment.totalAmount || 0) - (enrollment.totalPaid || 0);
      if (balance > 0) {
        enrollmentDetails.push({
          enrollmentId: enrollment.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: program.title,
          programId: program.id,
          totalAmount: enrollment.totalAmount || 0,
          totalPaid: enrollment.totalPaid || 0,
          balance: balance,
          status: enrollment.status,
          enrollmentDate: enrollment.createdAt
        });
        totalBalance += balance;
      }
    }

    const summary = {
      totalBalance: totalBalance,
      totalBalanceFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(totalBalance / 100),
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

export default router;