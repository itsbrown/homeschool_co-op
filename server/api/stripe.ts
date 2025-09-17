import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { sendPaymentReceipt } from '../lib/email-service';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';
import { jwtCheck } from '../middleware/auth0-auth';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

// Create payment intent for cart checkout
router.post('/create-payment-intent', jwtCheck, async (req: any, res) => {
  try {
    console.log('💳 Creating payment intent for cart checkout');
    
    // Get the authenticated user's email from the JWT
    const userEmail = req.user?.email || req.auth?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }
    
    console.log('💳 Creating payment intent for authenticated user:', userEmail);

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
    
    console.log('💳 Processing payment plan enrollment with simplified approach:', paymentPlan);
    
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
          paymentStatus: paymentPlan === 'full' ? 'pending_payment' : 'payment_plan_active',
          paymentSystemVersion: 'v2_stripe_simplified',
          status: 'pending_payment',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        enrollmentIds.push(enrollment.id);
      }

      console.log('📝 Created enrollments with IDs:', enrollmentIds);

      // Use payment plan service for ALL payment plans
      const paymentPlanService = new StripePaymentPlanService(storage);
      const paymentPlanResult = await paymentPlanService.createEducationalPaymentPlan({
        parentEmail: userEmail,
        enrollmentIds,
        totalAmount: total,
        paymentPlan: paymentPlan as 'deposit' | 'split' | 'monthly' | 'full'
      });

      console.log('✅ Payment plan created successfully:', {
        paymentIntentId: paymentPlanResult.paymentIntent.id,
        scheduledPaymentsCount: paymentPlanResult.scheduledPayments.length,
        paymentPlan
      });

      // All payment plans now return clientSecret 🎉
      res.json({
        clientSecret: paymentPlanResult.paymentIntent.client_secret,
        paymentIntentId: paymentPlanResult.paymentIntent.id,
        enrollmentIds,
        scheduledPayments: paymentPlanResult.scheduledPayments,
        paymentPlan
      });

    } catch (error: any) {
      console.error('❌ Error in enrollment creation or payment plan:', error);
      res.status(500).json({
        message: 'Failed to create enrollment or payment plan',
        error: error.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// NOTE: Webhook handler has been moved to dedicated webhook-handler.ts 
// and is applied directly in server/index.ts BEFORE any JSON parsers
// to ensure proper raw buffer handling for signature verification.
// This prevents middleware order issues where JSON parsers would 
// corrupt the raw buffer needed for Stripe signature verification.

export default router;