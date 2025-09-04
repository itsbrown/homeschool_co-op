import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { insertPaymentSchema, type InsertPayment } from '@shared/schema';
import { sendPaymentConfirmationEmail } from '../lib/email-service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
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
      childName: 'Multiple Children',
      className: 'Multiple Classes',
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
        await storage.updatePaymentStatus(payment.id, 'completed');
      }

      // Send confirmation email
      const emailData = {
        parentEmail,
        payment: {
          ...payment!,
          status: 'completed' as const
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
          status: 'completed',
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

    // Get all enrollments for these children (using individual child lookups)
    const allEnrollments = [];
    for (const childId of childIds) {
      const childEnrollments = await storage.getEnrollmentsByChildId(childId);
      allEnrollments.push(...childEnrollments);
    }
    console.log('📋 Found enrollments:', allEnrollments.length);

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
      const totalAmount = enrollment.totalCost || classDetails.price || 0;
      const totalPaid = enrollment.amount || 0;
      // Use remainingBalance if available, otherwise calculate from totalCost - amount
      const balance = enrollment.remainingBalance !== undefined 
        ? enrollment.remainingBalance 
        : (totalAmount - totalPaid);

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
      amount: Math.round(totalAmount * 100), // Convert dollars to cents for Stripe
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

// Confirm payment and update enrollment statuses
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, enrollmentIds, amount, paymentDate } = req.body;
    console.log('💳 Confirming payment:', paymentIntentId, 'for enrollments:', enrollmentIds);

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

    // Update enrollment statuses
    const allEnrollments = await storage.getAllEnrollments();
    const updatedEnrollments = [];
    const amountPerEnrollment = Math.round(amount / enrollmentIds.length);

    console.log('🔍 All enrollment IDs in storage:', allEnrollments.map(e => e.id));
    console.log('🔍 Looking for enrollment IDs:', enrollmentIds);

    // Get user's children to verify ownership
    const userChildren = await storage.getChildrenByParentEmail(userEmail);
    const userChildIds = userChildren.map(child => child.id);

    for (const enrollmentId of enrollmentIds) {
      const enrollment = allEnrollments.find(e => e.id === enrollmentId);
      console.log(`🔍 Found enrollment ${enrollmentId}:`, enrollment ? 'YES' : 'NO');
      
      if (enrollment && userChildIds.includes(enrollment.childId)) {
        console.log(`🔄 Updating enrollment ${enrollmentId} from status '${enrollment.status}' to 'completed'`);
        
        // Update the enrollment with payment information
        const updatedEnrollment = {
          ...enrollment,
          status: 'completed' as const,
          totalPaid: (enrollment.totalPaid || 0) + amountPerEnrollment,
          notes: enrollment.notes ? `${enrollment.notes}\nPayment of $${amountPerEnrollment/100} received on ${new Date().toISOString()}` : `Payment of $${amountPerEnrollment/100} received on ${new Date().toISOString()}`
        };
        
        await storage.updateEnrollment(updatedEnrollment);
        updatedEnrollments.push(updatedEnrollment);
        console.log('✅ Updated enrollment:', enrollmentId, 'status to completed, amount paid:', amountPerEnrollment);
      } else if (enrollment && !userChildIds.includes(enrollment.childId)) {
        console.log(`❌ Enrollment ${enrollmentId} belongs to child ${enrollment.childId}, not authorized for user ${userEmail}`);
      } else {
        console.log(`❌ Enrollment ${enrollmentId} not found in storage`);
      }
    }

    // Get child and class details for payment record
    let childName = 'Multiple Children';
    let className = 'Multiple Classes';
    
    if (updatedEnrollments.length === 1) {
      const enrollment = updatedEnrollments[0];
      const child = await storage.getChildById(enrollment.childId);
      const classDetails = await storage.getClassById(enrollment.classId);
      childName = child ? `${child.firstName} ${child.lastName}` : 'Unknown Child';
      className = classDetails?.className || 'Unknown Class';
    }

    // Create payment record
    const payment = {
      stripePaymentIntentId: paymentIntentId,
      parentEmail: userEmail,
      childName: childName,
      className: className,
      amount: amount,
      currency: 'usd',
      status: 'completed' as const,
      metadata: {
        enrollmentIds: enrollmentIds,
        paymentDate: paymentDate
      }
    };

    try {
      await storage.createPayment(payment);
    } catch (error) {
      console.log('⚠️ Payment record creation failed, continuing with email...');
    }

    // Send confirmation email
    try {
      const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
      
      const enrollmentDetails = await Promise.all(updatedEnrollments.map(async (enrollment) => {
        const child = await storage.getChildById(enrollment.childId);
        const classDetails = await storage.getClassById(enrollment.classId);
        return {
          childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown Child',
          className: classDetails?.className || 'Unknown Class',
          price: classDetails?.price || 0,
          amountPaid: Math.round(amount / enrollmentIds.length),
        };
      }));

      const emailSent = await sendPaymentConfirmationEmail({
        parentEmail: userEmail,
        parentName: user.user_metadata?.full_name || 'Parent',
        payment: payment,
        enrollmentDetails: enrollmentDetails,
      });

      console.log('📧 Confirmation email sent:', emailSent);
    } catch (emailError) {
      console.error('❌ Error sending confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: 'Payment confirmed and enrollments updated',
      updatedEnrollments: updatedEnrollments.length,
      paymentId: payment.id
    });

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm payment'
    });
  }
});

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    const { parentEmail, parentName, enrollmentDetails } = req.body;
    
    const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
    
    const mockPayment = {
      id: Date.now(),
      stripePaymentIntentId: 'test_intent_123',
      parentEmail: parentEmail,
      childName: enrollmentDetails[0]?.childName || 'Test Child',
      className: enrollmentDetails[0]?.className || 'Test Class',
      amount: enrollmentDetails[0]?.amountPaid || 900,
      currency: 'usd',
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('🧪 Testing email service...');
    const emailSent = await sendPaymentConfirmationEmail({
      parentEmail: parentEmail,
      parentName: parentName || 'Parent',
      payment: mockPayment,
      enrollmentDetails: enrollmentDetails,
    });

    if (emailSent) {
      console.log('✅ Test email sent successfully');
      res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      console.log('❌ Test email failed to send');
      res.status(500).json({ success: false, error: 'Email failed to send' });
    }
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


export default router;