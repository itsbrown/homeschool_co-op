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

    const { items, subtotal, discounts, total, parentEmail, paymentPlan = 'full', paymentFrequency = 'one_time' } = req.body;

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
    
    // Validate payment frequency
    const validFrequencies = ['weekly', 'biweekly', 'monthly', 'one_time'];
    if (!validFrequencies.includes(paymentFrequency)) {
      return res.status(400).json({
        message: 'Invalid payment frequency',
        error: 'INVALID_FREQUENCY'
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
    
    console.log('💳 Processing payment plan enrollment with database storage:', paymentPlan);
    
    // Get parent user to get schoolId and parentId
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      return res.status(404).json({
        message: 'Parent user not found',
        error: 'USER_NOT_FOUND'
      });
    }
    
    try {
      // Map frontend payment plan values to database enum values
      const paymentPlanMapping: Record<string, string> = {
        'full': 'full_payment',
        'deposit': 'deposit_only',
        'split': 'custom',
        'biweekly': 'biweekly'
      };
      
      const dbPaymentPlan = (paymentPlanMapping[paymentPlan] || 'full_payment') as 'full_payment' | 'deposit_only' | 'biweekly' | 'custom';
      
      // Create enrollments in database
      const enrollmentIds = [];
      for (const item of items) {
        // Get the child to fetch schoolId
        const child = children.find(c => c.id === item.childId);
        if (!child) {
          throw new Error(`Child ${item.childId} not found`);
        }
        
        // Get the class to fetch program start/end dates for payment calculations
        const classData = await storage.getClassById(item.classId);
        if (!classData) {
          throw new Error(`Class ${item.classId} not found`);
        }
        
        // Helper to safely convert date to string
        const formatDate = (date: any): string | null => {
          if (!date) return null;
          if (typeof date === 'string') return date;
          if (date instanceof Date) return date.toISOString().split('T')[0];
          return String(date);
        };
        
        const enrollment = await storage.createProgramEnrollment({
          schoolId: child.schoolId || parent.schoolId || 1, // Fallback to parent's school or default
          classId: item.classId,
          programId: item.classId, // For backward compatibility
          childId: item.childId,
          childName: item.childName,
          className: item.className,
          variantId: null,
          parentId: parent.id,
          parentEmail: userEmail,
          totalCost: item.totalCost,
          totalPaid: 0,
          remainingBalance: item.totalCost,
          depositRequired: 0,
          paymentStatus: paymentPlan === 'full' ? 'pending' : 'deposit_paid',
          paymentPlan: dbPaymentPlan,
          paymentSystemVersion: 'v2_stripe',
          paymentFrequency: paymentFrequency,
          programStartDate: formatDate(classData.startDate),
          programEndDate: formatDate(classData.endDate),
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          notes: null,
          metadata: {},
          status: 'enrolled',
          enrollmentDate: new Date()
        });
        enrollmentIds.push(enrollment.id);
      }

      console.log('✅ Created database enrollments with IDs:', enrollmentIds);

      // Use payment plan service for ALL payment plans
      const paymentPlanService = new StripePaymentPlanService(storage);
      const paymentPlanResult = await paymentPlanService.createEducationalPaymentPlan({
        parentEmail: userEmail,
        enrollmentIds,
        totalAmount: total,
        paymentPlan: paymentPlan as 'deposit' | 'split' | 'biweekly' | 'full',
        paymentFrequency: paymentFrequency as 'weekly' | 'biweekly' | 'monthly' | 'one_time'
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