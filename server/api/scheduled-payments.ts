import { Router } from 'express';
import { storage } from '../storage';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-04-30.basil'
    })
  : null;

const router = Router();

// Get upcoming scheduled payments for a user
router.get('/upcoming', async (req, res) => {
  try {
    console.log('🚀 Upcoming payments API called');
    // Extract user email from Supabase token (same as billing summary)
    const authHeader = req.headers.authorization;
    console.log('🔑 Auth header present:', !!authHeader, authHeader ? 'Bearer token provided' : 'No auth header');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Missing or invalid authorization header');
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Simple token decode for email (same as billing.ts)
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Email not found in token'
        });
      }
    } catch (error) {
      console.log('❌ Token decode error:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    console.log('📅 Fetching scheduled payments for:', userEmail);
    
    // Get all scheduled payments for this parent
    console.log('🔍 Checking storage for scheduled payments...');
    const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    console.log(`📋 Found ${scheduledPayments.length} total scheduled payments for ${userEmail}:`, scheduledPayments);
    
    // Filter for pending payments and sort by due date
    const upcomingPayments = scheduledPayments
      .filter(payment => {
        const isUpcoming = payment.status === 'pending';
        console.log(`📅 Payment ${payment.id}: due ${new Date(payment.dueDate).toLocaleDateString()}, status: ${payment.status}, upcoming: ${isUpcoming}`);
        return isUpcoming;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    console.log(`📊 Found ${upcomingPayments.length} upcoming payments`);
    
    res.json({
      success: true,
      payments: upcomingPayments
    });
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch scheduled payments'
    });
  }
});

// Process a scheduled payment
router.post('/pay', async (req, res) => {
  try {
    const { paymentId, amount, description } = req.body;

    console.log('💳 Processing scheduled payment:', { paymentId, amount, description });

    if (!stripe) {
      return res.status(500).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    if (!paymentId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID and amount are required'
      });
    }

    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    let userEmail: string;

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Email not found in token'
        });
      }
    } catch (error) {
      console.log('❌ Token decode error:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    // Get the scheduled payment to verify it belongs to the user
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const scheduledPayment = allScheduledPayments.find(p => p.id === parseInt(paymentId));
    if (!scheduledPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }

    if (scheduledPayment.parentEmail !== userEmail) {
      return res.status(403).json({
        success: false,
        error: 'Payment does not belong to this user'
      });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Amount should be in cents
      currency: 'usd',
      metadata: {
        type: 'scheduled_payment',
        scheduledPaymentId: paymentId.toString(),
        parentEmail: userEmail,
        description: description || `Scheduled Payment ${scheduledPayment.installmentNumber}`
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    console.log('✅ Created payment intent for scheduled payment:', paymentIntent.id);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('❌ Error processing scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process scheduled payment'
    });
  }
});

// Mark a scheduled payment as paid (for when someone pays early)
router.patch('/:id/paid', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    
    // Extract user email from Supabase token (same as payment-history)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Scheduled payments auth error:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }
    
    // Update the scheduled payment status
    const updatedPayment = await storage.updateScheduledPaymentStatus(paymentId, 'paid');
    
    if (!updatedPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }
    
    res.json({
      success: true,
      payment: updatedPayment
    });
  } catch (error) {
    console.error('Error updating scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update scheduled payment'
    });
  }
});

export default router;