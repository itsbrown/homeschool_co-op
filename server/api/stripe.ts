import { Router } from 'express';
import { storage } from '../storage';
import { sendPaymentReceipt } from '../lib/email-service';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { getStripeClient, getStripePublishableKey } from '../config/stripe';

const router = Router();

// Get Stripe publishable key from Replit connection API
router.get('/config', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('Failed to get Stripe publishable key:', error);
    res.status(500).json({ 
      error: 'Failed to get Stripe configuration',
      message: error.message 
    });
  }
});

// Create payment intent for cart checkout
router.post('/create-payment-intent', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💳 Creating payment intent for cart checkout');
    
    // Get the authenticated user's email from Supabase auth
    const userEmail = req.user.email;
    
    console.log('💳 Creating payment intent for authenticated user:', userEmail);

    const { items, subtotal, discounts, total, parentEmail, paymentPlan = 'full', paymentFrequency = 'one_time', membership } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'Cart items are required',
        error: 'MISSING_ITEMS'
      });
    }

    if (total < 0) {
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
    
    // Check for existing Stripe subscription for this user
    let existingSubscription: any = null;
    let hasActiveSubscription = false;
    const stripe = await getStripeClient();
    
    try {
      console.log('🔍 Checking for existing Stripe subscription for:', userEmail);
      
      // Search for customer in Stripe by email
      const customers = await stripe.customers.search({
        query: `email:'${userEmail}'`
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        console.log('✅ Found Stripe customer:', customer.id);
        
        // Get active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          existingSubscription = subscriptions.data[0];
          hasActiveSubscription = true;
          console.log('✅ Found active subscription:', existingSubscription.id);
          
          // Update user's Stripe customer ID if not already set
          if (parent.stripeCustomerId !== customer.id) {
            await storage.updateUser(parent.id, { stripeCustomerId: customer.id });
            console.log('✅ Updated user.stripeCustomerId to:', customer.id);
          }
          
          // Update or create membership enrollment if subscription exists
          if (parent.schoolId) {
            const existingMemberships = await storage.getMembershipEnrollmentsByParentId(parent.id);
            const currentYear = new Date().getFullYear();
            const activeMembership = existingMemberships.find(m => 
              m.membershipYear === currentYear && m.status === 'enrolled'
            );
            
            if (!activeMembership) {
              // Create active membership enrollment from Stripe subscription
              const subData = existingSubscription as any;
              
              // Safely parse Stripe timestamps to dates
              const safeStripeDate = (timestamp: number | undefined): Date => {
                if (!timestamp || typeof timestamp !== 'number') {
                  console.warn('⚠️ Invalid Stripe timestamp, using current date');
                  return new Date();
                }
                const date = new Date(timestamp * 1000);
                if (isNaN(date.getTime())) {
                  console.warn('⚠️ Stripe timestamp resulted in invalid date:', timestamp);
                  return new Date();
                }
                return date;
              };
              
              const startDate = safeStripeDate(subData.current_period_start);
              const endDate = safeStripeDate(subData.current_period_end);
              
              await storage.createMembershipEnrollment({
                schoolId: parent.schoolId,
                parentUserId: parent.id,
                membershipYear: currentYear,
                membershipTier: 'basic',
                amount: 17500, // $175 in cents
                amountPaid: 17500,
                remainingBalance: 0,
                status: 'enrolled',
                stripeSubscriptionId: existingSubscription.id,
                stripeCustomerId: customer.id,
                startDate,
                renewalDate: endDate,
                notes: 'Auto-synced from Stripe subscription',
                paymentMethod: 'other',
                dueDate: startDate,
                expirationDate: endDate,
                gracePeriodEnd: null
              });
              console.log('✅ Created active membership enrollment from Stripe subscription');
            }
          }
        } else {
          console.log('ℹ️ No active subscriptions found for customer:', customer.id);
        }
      } else {
        console.log('ℹ️ No Stripe customer found with email:', userEmail);
      }
    } catch (stripeError: any) {
      // Log error but don't fail the whole checkout - just proceed without Stripe sync
      console.error('⚠️ Error checking Stripe subscription (non-blocking):', stripeError.message);
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
      
      // Find or use existing pending enrollments (created when items were added to cart)
      const enrollmentIds = [];
      const allEnrollments = await storage.getAllEnrollments?.() || [];
      
      for (const item of items) {
        // Get the child to fetch schoolId
        const child = children.find(c => c.id === item.childId);
        if (!child) {
          throw new Error(`Child ${item.childId} not found`);
        }
        
        // Check if there's already a pending enrollment (from cart or existing)
        let enrollment = allEnrollments.find(e => 
          (item.enrollmentId && e.id === item.enrollmentId) || // Match by enrollmentId if available
          (e.childId === item.childId &&
           ((item.classType === 'marketplace' && e.marketplaceClassId === item.marketplaceClassId) ||
            (item.classType !== 'marketplace' && e.classId === item.classId)) &&
           e.status === 'pending_payment')
        );
        
        if (enrollment) {
          // SECURITY: Validate enrollment belongs to authenticated parent
          if (enrollment.parentEmail !== userEmail && enrollment.parentId !== parent.id) {
            console.error(`🚨 SECURITY: Enrollment ${enrollment.id} does not belong to parent ${userEmail}`);
            console.error(`   Enrollment parent: ${enrollment.parentEmail} (ID: ${enrollment.parentId})`);
            console.error(`   Authenticated parent: ${userEmail} (ID: ${parent.id})`);
            return res.status(403).json({
              message: 'You do not have permission to complete payment for this enrollment',
              error: 'UNAUTHORIZED_ENROLLMENT',
              details: 'This enrollment belongs to a different parent account'
            });
          }
          
          console.log(`✅ Found existing pending enrollment ${enrollment.id} for child ${item.childId}`);
          // Update the existing enrollment with payment plan details
          await storage.updateProgramEnrollment(enrollment.id, {
            paymentPlan: dbPaymentPlan,
            paymentFrequency: paymentFrequency,
            paymentSystemVersion: 'v2_stripe'
          });
          enrollmentIds.push(enrollment.id);
        } else {
          // Get class data for new enrollments
          // Use marketplaceClassId for marketplace enrollments, classId for regular enrollments
          const actualClassId = item.marketplaceClassId || item.classId;
          if (!actualClassId) {
            throw new Error(`No valid class ID found for ${item.className}`);
          }
          
          const classData = await storage.getClassById(actualClassId);
          if (!classData) {
            throw new Error(`Class ${actualClassId} not found for ${item.className}`);
          }
          
          // If no pending enrollment found (shouldn't happen in normal flow), create one
          console.log(`⚠️ No pending enrollment found for child ${item.childId} in class ${item.classId}, creating new one`);
          
          // Validate schoolId - NEVER allow fallback to hardcoded values
          const enrollmentSchoolId = child.schoolId || parent.schoolId;
          if (!enrollmentSchoolId) {
            throw new Error(`Cannot create enrollment: No valid school ID found for child ${item.childId} or parent ${parent.email}`);
          }
          
          // Helper to safely convert date to string
          const formatDate = (date: any): string | null => {
            if (!date) return null;
            if (typeof date === 'string') return date;
            if (date instanceof Date) return date.toISOString().split('T')[0];
            return String(date);
          };
          
          enrollment = await storage.createProgramEnrollment({
            schoolId: enrollmentSchoolId,
            classType: item.classType || 'regular',
            classId: item.classType === 'marketplace' ? null : item.classId,
            marketplaceClassId: item.marketplaceClassId || null,
            programId: item.marketplaceClassId || item.classId,
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
            paymentStatus: 'pending',
            paymentPlan: dbPaymentPlan,
            paymentSystemVersion: 'v2_stripe',
            paymentFrequency: paymentFrequency,
            programStartDate: formatDate(classData.startDate),
            programEndDate: formatDate(classData.endDate),
            stripeSubscriptionId: null,
            stripeCustomerId: null,
            notes: null,
            metadata: {},
            status: 'pending_payment', // Start as pending, will be enrolled after payment
            enrollmentDate: new Date()
          });
          enrollmentIds.push(enrollment.id);
        }
      }

      console.log('✅ Using enrollments with IDs:', enrollmentIds);

      // Validate membership request if present - use server-derived values only
      // SECURITY: Do not trust client-provided schoolId/parentUserId - derive from authenticated session
      const membershipAmount = membership?.amount || 0;
      const totalWithMembership = total + membershipAmount;
      
      // Build secure membership data from server-side validated parent info
      let serverMembership: { parentUserId: number; schoolId: number; amount: number; year: number } | undefined;
      
      if (membership && membershipAmount > 0 && parent.schoolId) {
        // Validate that the requested school matches the parent's school
        if (membership.schoolId !== parent.schoolId) {
          console.error('🚨 SECURITY: Membership schoolId mismatch. Request:', membership.schoolId, 'Parent:', parent.schoolId);
          return res.status(403).json({
            message: 'Cannot create membership for a different school',
            error: 'SCHOOL_MISMATCH'
          });
        }
        
        // Validate membership amount against school's configured fee
        const parentSchool = await storage.getSchoolById(parent.schoolId);
        if (parentSchool?.membershipFeeAmount && membershipAmount !== parentSchool.membershipFeeAmount) {
          console.error('🚨 SECURITY: Membership amount mismatch. Request:', membershipAmount, 'School config:', parentSchool.membershipFeeAmount);
          return res.status(403).json({
            message: 'Membership fee amount does not match school configuration',
            error: 'AMOUNT_MISMATCH'
          });
        }
        
        // Use server-derived parent info, not client-provided
        serverMembership = {
          parentUserId: parent.id, // Server-derived, not from client
          schoolId: parent.schoolId, // Server-derived, not from client
          amount: parentSchool?.membershipFeeAmount || membershipAmount, // Use server-configured amount
          year: membership.year || new Date().getFullYear()
        };
        
        console.log('🎫 Membership fee included in payment (server-validated):', {
          enrollmentTotal: total,
          membershipAmount,
          totalWithMembership,
          membershipYear: serverMembership.year,
          parentUserId: serverMembership.parentUserId,
          schoolId: serverMembership.schoolId
        });
      }

      // Use payment plan service for ALL payment plans
      // NOTE: CombinedStorage has all IStorage methods needed but doesn't formally implement the interface
      // See server/storage.ts TODO comment for full context on storage interface alignment
      const paymentPlanService = new StripePaymentPlanService(storage as any);
      const paymentPlanResult = await paymentPlanService.createEducationalPaymentPlan({
        parentEmail: userEmail,
        enrollmentIds,
        totalAmount: totalWithMembership, // Include membership fee in total
        paymentPlan: paymentPlan as 'deposit' | 'split' | 'biweekly' | 'full',
        paymentFrequency: paymentFrequency as 'weekly' | 'biweekly' | 'monthly' | 'one_time',
        membership: serverMembership // Pass server-validated membership data
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
        paymentPlan,
        // Include Stripe subscription info for UI display
        hasActiveSubscription,
        subscriptionInfo: existingSubscription ? {
          id: existingSubscription.id,
          status: existingSubscription.status,
          currentPeriodEnd: (() => {
            try {
              const ts = existingSubscription.current_period_end;
              if (!ts || typeof ts !== 'number') return null;
              const date = new Date(ts * 1000);
              return isNaN(date.getTime()) ? null : date.toISOString();
            } catch {
              return null;
            }
          })()
        } : null
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

// Create payment intent for product order
router.post('/create-product-payment', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💳 Creating payment intent for product order');
    
    // Get the authenticated user's email from Supabase auth
    const userEmail = req.user.email;

    const { submissionId, totalAmount, description } = req.body;

    if (!submissionId || !totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        message: 'Submission ID and valid total amount are required',
        error: 'INVALID_REQUEST'
      });
    }

    // Create payment intent
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount), // Amount in cents
      currency: 'usd',
      description: description || 'Product Order',
      metadata: {
        submissionId: submissionId.toString(),
        userEmail,
        type: 'product_order'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error: any) {
    console.error('❌ Error creating product payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// Get subscription schedules for authenticated parent
router.get('/subscription-schedules', supabaseAuth, async (req: any, res) => {
  try {
    const parentEmail = req.user.email;
    console.log('📅 Fetching subscription schedules for parent:', parentEmail);

    // Test mode: return empty schedules
    if (process.env.NODE_ENV === 'test') {
      console.log('🧪 Test mode: Returning empty subscription schedules');
      return res.json({
        success: true,
        schedules: []
      });
    }

    // Get unique Stripe customer IDs for this parent
    const customerIds = await storage.getStripeCustomerIdsByParentEmail(parentEmail);
    
    if (customerIds.length === 0) {
      return res.json({
        success: true,
        schedules: []
      });
    }

    console.log(`📅 Found ${customerIds.length} Stripe customer IDs`);

    // Fetch subscription schedules from Stripe for each customer ID
    const stripe = await getStripeClient();
    const allSchedules = [];
    for (const customerId of customerIds) {
      const schedules = await stripe.subscriptionSchedules.list({
        customer: customerId,
        limit: 100
      });
      allSchedules.push(...schedules.data);
    }

    console.log(`✅ Retrieved ${allSchedules.length} subscription schedules from Stripe`);

    // Transform to frontend format (camelCase top-level, snake_case for Stripe nested objects)
    const formattedSchedules = allSchedules.map(schedule => {
      // Find current phase index by matching phase start_date with current_phase
      let currentPhaseIndex = 0;
      if (schedule.current_phase && schedule.phases) {
        currentPhaseIndex = schedule.phases.findIndex((phase: any) => 
          phase.start_date === (schedule.current_phase as any)?.start_date
        );
        if (currentPhaseIndex === -1) currentPhaseIndex = 0;
      }

      return {
        id: schedule.id,
        status: schedule.status,
        created: schedule.created,
        customer: schedule.customer,
        metadata: schedule.metadata,
        phases: schedule.phases, // Keep snake_case as it's Stripe's format
        currentPhaseIndex: currentPhaseIndex, // Numeric index instead of object
        endBehavior: schedule.end_behavior,
        releasedAt: schedule.released_at,
        releasedSubscription: schedule.released_subscription
      };
    });

    res.json({
      success: true,
      schedules: formattedSchedules
    });

  } catch (error: any) {
    console.error('❌ Error fetching subscription schedules:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscription schedules'
    });
  }
});

// Get active subscriptions for authenticated parent
router.get('/subscriptions', supabaseAuth, async (req: any, res) => {
  try {
    const parentEmail = req.user.email;
    console.log('💳 Fetching subscriptions for parent:', parentEmail);

    // Test mode: return empty subscriptions
    if (process.env.NODE_ENV === 'test') {
      console.log('🧪 Test mode: Returning empty subscriptions');
      return res.json({
        success: true,
        subscriptions: []
      });
    }

    // Get unique Stripe customer IDs for this parent
    const customerIds = await storage.getStripeCustomerIdsByParentEmail(parentEmail);
    
    if (customerIds.length === 0) {
      return res.json({
        success: true,
        subscriptions: []
      });
    }

    console.log(`💳 Found ${customerIds.length} Stripe customer IDs`);

    // Fetch subscriptions from Stripe for each customer ID
    const stripe = await getStripeClient();
    const allSubscriptions = [];
    for (const customerId of customerIds) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all', // Get all statuses (active, past_due, canceled, etc.)
        limit: 100
      });
      allSubscriptions.push(...subscriptions.data);
    }

    console.log(`✅ Retrieved ${allSubscriptions.length} subscriptions from Stripe`);

    // Transform to frontend format (keep Stripe snake_case for nested properties)
    const formattedSubscriptions = allSubscriptions.map(sub => {
      const subData = sub as any;
      return {
        id: sub.id,
        status: sub.status,
        created: sub.created,
        current_period_start: subData.current_period_start,
        current_period_end: subData.current_period_end,
        customer: sub.customer,
        items: sub.items.data,
        metadata: sub.metadata,
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at,
        schedule: sub.schedule
      };
    });

    res.json({
      success: true,
      subscriptions: formattedSubscriptions
    });

  } catch (error: any) {
    console.error('❌ Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscriptions'
    });
  }
});

// Get payment history for authenticated user
router.get('/payment-history', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('💰 Fetching payment history for user:', userEmail);

    // Get user from database to get user ID
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Fetch payment history from database
    const paymentHistory = await storage.getPaymentsByParentEmail(userEmail);
    
    console.log(`✅ Retrieved ${paymentHistory.length} payment records from database`);

    // Format payment history for frontend
    const formattedPayments = paymentHistory.map((payment: any) => ({
      id: payment.id,
      paymentIntentId: payment.paymentIntentId,
      customerId: payment.customerId,
      amount: payment.amount,
      status: payment.status,
      subscriptionId: payment.subscriptionId,
      createdDate: payment.createdDate,
      paymentMethod: payment.paymentMethod,
      description: payment.description
    }));

    res.json({
      success: true,
      payments: formattedPayments
    });

  } catch (error: any) {
    console.error('❌ Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payment history'
    });
  }
});

// Admin endpoint for manual Stripe subscription sync
router.post('/admin/sync-stripe-subscription', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const { email } = req.body;
    const adminSchoolId = req.schoolId; // School ID from middleware
    console.log('🔄 Admin manually syncing Stripe subscription for email:', email, 'from school:', adminSchoolId);

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Security: First, get user from database and verify they exist
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User with email ${email} not found in database`
      });
    }

    // Security: Verify user belongs to the requesting admin's school BEFORE contacting Stripe
    if (!user.schoolId || String(user.schoolId) !== String(adminSchoolId)) {
      console.log(`❌ Authorization failed: user school ${user.schoolId} doesn't match admin school ${adminSchoolId}`);
      return res.status(403).json({
        success: false,
        message: `User with email ${email} does not belong to your school`
      });
    }

    console.log('✅ Authorization passed: user belongs to admin school');

    // Now proceed with Stripe lookup
    const stripe = await getStripeClient();
    const customers = await stripe.customers.search({
      query: `email:'${email}'`
    });

    if (customers.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No Stripe customer found with email: ${email}`
      });
    }

    const customer = customers.data[0];
    console.log('✅ Found Stripe customer:', customer.id);

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Stripe customer ${customer.id} exists but has no active subscriptions`
      });
    }

    const subscription = subscriptions.data[0];
    console.log('✅ Found active subscription:', subscription.id);

    // Update user's Stripe customer ID
    await storage.updateUser(user.id, { stripeCustomerId: customer.id });
    console.log('✅ Updated user.stripeCustomerId to:', customer.id);

    // Create or update membership enrollment
    // Note: We already verified user.schoolId === adminSchoolId above, but use adminSchoolId directly for clarity
    const existingMemberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    const currentYear = new Date().getFullYear();
    const activeMembership = existingMemberships.find(m => 
      m.membershipYear === currentYear && m.status === 'enrolled'
    );

    if (!activeMembership) {
      // Create active membership enrollment from Stripe subscription
      // Use adminSchoolId directly to ensure school ownership (already verified above)
      const subData = subscription as any;
      
      // Safely parse Stripe timestamps to dates
      const safeStripeDate = (timestamp: number | undefined): Date => {
        if (!timestamp || typeof timestamp !== 'number') {
          console.warn('⚠️ Invalid Stripe timestamp, using current date');
          return new Date();
        }
        const date = new Date(timestamp * 1000);
        if (isNaN(date.getTime())) {
          console.warn('⚠️ Stripe timestamp resulted in invalid date:', timestamp);
          return new Date();
        }
        return date;
      };
      
      const startDate = safeStripeDate(subData.current_period_start);
      const endDate = safeStripeDate(subData.current_period_end);
      
      await storage.createMembershipEnrollment({
        schoolId: Number(adminSchoolId),
        parentUserId: user.id,
        membershipYear: currentYear,
        membershipTier: 'basic',
        amount: 17500, // $175 in cents
        amountPaid: 17500,
        remainingBalance: 0,
        status: 'enrolled',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customer.id,
        startDate,
        renewalDate: endDate,
        notes: 'Admin-synced from Stripe subscription',
        paymentMethod: 'other',
        dueDate: startDate,
        expirationDate: endDate,
        gracePeriodEnd: null
      });
      console.log('✅ Created active membership enrollment from Stripe subscription');
    } else {
      console.log('ℹ️ User already has active membership for current year');
    }

    const subData = subscription as any;
    res.json({
      success: true,
      message: `Successfully synced Stripe subscription for ${email}`,
      data: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: (() => {
          try {
            const ts = subData.current_period_end;
            if (!ts || typeof ts !== 'number') return null;
            const date = new Date(ts * 1000);
            return isNaN(date.getTime()) ? null : date.toISOString();
          } catch {
            return null;
          }
        })()
      }
    });

  } catch (error: any) {
    console.error('❌ Error syncing Stripe subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync Stripe subscription'
    });
  }
});

// Test endpoint for Stripe account lookup debugging
router.post('/test-account-lookup', supabaseAuth, async (req: any, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log('🧪 Testing Stripe account lookup for email:', email);
    
    const result: any = {
      email,
      timestamp: new Date().toISOString(),
      stripeCustomer: null,
      activeSubscriptions: [],
      databaseUser: null,
      membershipEnrollments: [],
      summary: {
        hasStripeCustomer: false,
        hasActiveSubscription: false,
        hasDatabaseRecord: false,
        hasActiveMembership: false
      }
    };

    // Step 1: Check database for user
    try {
      const user = await storage.getUserByEmail(email);
      if (user) {
        result.databaseUser = {
          id: user.id,
          email: user.email,
          schoolId: user.schoolId,
          stripeCustomerId: user.stripeCustomerId,
          role: user.role
        };
        result.summary.hasDatabaseRecord = true;
        console.log('✅ Found database user:', user.id);

        // Check for membership enrollments
        const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
        result.membershipEnrollments = memberships.map(m => ({
          id: m.id,
          membershipYear: m.membershipYear,
          status: m.status,
          amount: m.amount,
          amountPaid: m.amountPaid,
          stripeSubscriptionId: m.stripeSubscriptionId,
          startDate: m.startDate,
          renewalDate: m.renewalDate
        }));
        
        const activeMembership = memberships.find(m => 
          m.status === 'enrolled' && m.membershipYear === new Date().getFullYear()
        );
        result.summary.hasActiveMembership = !!activeMembership;
        console.log(`📋 Found ${memberships.length} membership enrollments`);
      } else {
        console.log('ℹ️ No database user found');
      }
    } catch (dbError: any) {
      console.error('⚠️ Database lookup error:', dbError.message);
      result.databaseError = dbError.message;
    }

    // Step 2: Search Stripe for customer
    try {
      const stripe = await getStripeClient();
      const customers = await stripe.customers.search({
        query: `email:'${email}'`
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        result.stripeCustomer = {
          id: customer.id,
          email: customer.email,
          created: customer.created,
          metadata: customer.metadata
        };
        result.summary.hasStripeCustomer = true;
        console.log('✅ Found Stripe customer:', customer.id);

        // Step 3: Get active subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 10
        });
        
        result.activeSubscriptions = subscriptions.data.map(sub => {
          const subData = sub as any;
          return {
            id: sub.id,
            status: sub.status,
            created: sub.created,
            current_period_start: subData.current_period_start,
            current_period_end: subData.current_period_end,
            items: sub.items.data.map(item => ({
              id: item.id,
              price: item.price,
              quantity: item.quantity
            })),
            metadata: sub.metadata
          };
        });
        
        result.summary.hasActiveSubscription = subscriptions.data.length > 0;
        console.log(`✅ Found ${subscriptions.data.length} active subscriptions`);
      } else {
        console.log('ℹ️ No Stripe customer found');
      }
    } catch (stripeError: any) {
      console.error('⚠️ Stripe lookup error:', stripeError.message);
      result.stripeError = stripeError.message;
    }

    // Summary and recommendations
    if (result.summary.hasStripeCustomer && !result.summary.hasDatabaseRecord) {
      result.recommendation = 'Stripe customer exists but no database user. User may need to register.';
    } else if (result.summary.hasActiveSubscription && !result.summary.hasActiveMembership) {
      result.recommendation = 'Active Stripe subscription found but no active membership enrollment. Consider syncing.';
    } else if (result.summary.hasStripeCustomer && result.databaseUser?.stripeCustomerId !== result.stripeCustomer.id) {
      result.recommendation = 'Stripe customer ID mismatch. Database should be updated.';
    } else if (result.summary.hasActiveSubscription && result.summary.hasActiveMembership) {
      result.recommendation = 'Everything is in sync! ✅';
    } else {
      result.recommendation = 'No issues detected or user has no Stripe account.';
    }

    res.json({
      success: true,
      result
    });

  } catch (error: any) {
    console.error('❌ Test account lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test account lookup'
    });
  }
});

// NOTE: Webhook handler has been moved to dedicated webhook-handler.ts 
// and is applied directly in server/index.ts BEFORE any JSON parsers
// to ensure proper raw buffer handling for signature verification.
// This prevents middleware order issues where JSON parsers would 
// corrupt the raw buffer needed for Stripe signature verification.

// Request free enrollment (100% discount) - requires admin approval
router.post('/request-free-enrollment', supabaseAuth, async (req: any, res) => {
  try {
    console.log('🆓 Processing free enrollment request (100% discount)');
    
    const userEmail = req.user.email;
    const { items, subtotal, discounts, total, discountCode } = req.body;

    // Validate this is actually a free enrollment
    if (total !== 0) {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for free enrollments (100% discount)',
        error: 'NOT_FREE_ENROLLMENT'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart items are required',
        error: 'MISSING_ITEMS'
      });
    }

    // Get parent user
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent user not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Verify user owns the children in the cart
    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);
    
    const invalidItems = items.filter((item: any) => !childIds.includes(item.childId));
    if (invalidItems.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot enroll children not owned by this parent',
        error: 'UNAUTHORIZED_CHILDREN'
      });
    }

    // Find or update existing pending enrollments to pending_admin_approval
    const enrollmentIds = [];
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    
    for (const item of items) {
      const child = children.find(c => c.id === item.childId);
      if (!child) {
        throw new Error(`Child ${item.childId} not found`);
      }

      // Find existing pending enrollment
      let enrollment = allEnrollments.find(e => 
        (item.enrollmentId && e.id === item.enrollmentId) ||
        (e.childId === item.childId &&
         ((item.classType === 'marketplace' && e.marketplaceClassId === item.marketplaceClassId) ||
          (item.classType !== 'marketplace' && e.classId === item.classId)) &&
         e.status === 'pending_payment')
      );

      if (enrollment) {
        // Update to pending_admin_approval status
        await storage.updateEnrollment(enrollment.id, {
          status: 'pending_admin_approval',
          totalCost: 0,
          remainingBalance: 0,
          paymentStatus: 'completed', // No payment needed
          notes: `Free enrollment - 100% discount applied (${discountCode || 'unknown code'}). Awaiting admin approval.`,
          metadata: {
            ...((enrollment.metadata as any) || {}),
            discountCode: discountCode,
            discountAmount: subtotal,
            originalTotal: subtotal,
            discountedTotal: 0,
            requestedAt: new Date().toISOString(),
            requestedBy: userEmail
          }
        });
        enrollmentIds.push(enrollment.id);
        console.log(`✅ Updated enrollment ${enrollment.id} to pending_admin_approval`);
      } else {
        // Create new enrollment with pending_admin_approval status
        const schoolId = parent.schoolId || child.schoolId || 1;
        const newEnrollment = await storage.createEnrollment({
          schoolId,
          classType: item.classType || 'marketplace',
          classId: item.classType !== 'marketplace' ? item.classId : null,
          marketplaceClassId: item.classType === 'marketplace' ? item.marketplaceClassId : null,
          programId: null,
          childId: item.childId,
          childName: item.childName,
          className: item.className,
          variantId: item.variantId || null,
          parentId: parent.id,
          parentEmail: userEmail,
          totalCost: 0,
          totalPaid: 0,
          remainingBalance: 0,
          depositRequired: 0,
          paymentStatus: 'completed',
          paymentPlan: 'full_payment',
          paymentFrequency: 'one_time',
          paymentSystemVersion: 'v2_stripe',
          programStartDate: item.startDate || null,
          programEndDate: item.endDate || null,
          status: 'pending_admin_approval',
          enrollmentDate: new Date(),
          notes: `Free enrollment - 100% discount applied (${discountCode || 'unknown code'}). Awaiting admin approval.`,
          metadata: {
            discountCode: discountCode,
            discountAmount: subtotal,
            originalTotal: subtotal,
            discountedTotal: 0,
            requestedAt: new Date().toISOString(),
            requestedBy: userEmail
          }
        });
        enrollmentIds.push(newEnrollment.id);
        console.log(`✅ Created new enrollment ${newEnrollment.id} with pending_admin_approval`);
      }
    }

    // Create notification for school admin
    try {
      const schoolId = parent.schoolId || 1;
      const childNames = items.map((item: any) => item.childName).join(', ');
      const classNames = items.map((item: any) => item.className).join(', ');
      
      // Find school admins to notify - get all staff and filter by role
      const allSchoolStaff = await storage.getSchoolStaffBySchoolId(schoolId);
      const schoolAdmins = allSchoolStaff.filter((s: any) => s.role === 'school_admin');
      
      for (const admin of schoolAdmins) {
        if (!admin.userId) continue;
        
        // Create notification with required fields
        const notification = await storage.createNotification({
          senderId: parent.id,
          type: 'in_app',
          priority: 'high',
          subject: 'Free Enrollment Pending Approval',
          content: `${parent.email} has requested a free enrollment (100% discount) for ${childNames} in ${classNames}. Please review and approve or reject this request.`,
          targetType: 'individual',
          targetData: { userId: admin.userId, enrollmentIds, discountCode },
          scheduledFor: null
        });
        
        // Create recipient for the notification
        await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId: admin.userId,
          deliveryType: 'in_app',
          status: 'pending'
        });
      }
      console.log(`📧 Sent notification to ${schoolAdmins.length} school admins`);
    } catch (notifyError) {
      console.error('⚠️ Error sending admin notification (non-blocking):', notifyError);
    }

    res.json({
      success: true,
      message: 'Free enrollment request submitted. Awaiting admin approval.',
      enrollmentIds,
      status: 'pending_admin_approval'
    });

  } catch (error: any) {
    console.error('❌ Free enrollment request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process free enrollment request',
      error: error.message
    });
  }
});

// Admin: Get pending approval enrollments
router.get('/pending-approvals', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user is a school admin (check role from user object or staff records)
    const isSchoolAdmin = user.role === 'schoolAdmin' || user.role === 'admin' || user.role === 'superAdmin';
    
    if (!isSchoolAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only school administrators can view pending approvals' 
      });
    }

    // Get all pending_admin_approval enrollments for this school
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    const pendingApprovals = allEnrollments.filter(e => 
      e.status === 'pending_admin_approval' && 
      e.schoolId === user.schoolId
    );

    res.json({
      success: true,
      pendingApprovals: pendingApprovals.map(e => ({
        id: e.id,
        childName: e.childName,
        className: e.className,
        parentEmail: e.parentEmail,
        discountCode: (e.metadata as any)?.discountCode || 'Unknown',
        originalTotal: (e.metadata as any)?.originalTotal || 0,
        requestedAt: (e.metadata as any)?.requestedAt || e.createdAt,
        status: e.status
      }))
    });

  } catch (error: any) {
    console.error('❌ Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Approve or reject free enrollment
router.post('/approve-enrollment/:enrollmentId', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const enrollmentId = parseInt(req.params.enrollmentId);
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user is a school admin
    const isSchoolAdmin = user.role === 'schoolAdmin' || user.role === 'admin' || user.role === 'superAdmin';
    
    if (!isSchoolAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only school administrators can approve enrollments' 
      });
    }

    // Get the enrollment
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    const enrollment = allEnrollments.find(e => e.id === enrollmentId);

    if (!enrollment) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    if (enrollment.status !== 'pending_admin_approval') {
      return res.status(400).json({ 
        success: false, 
        error: 'Enrollment is not pending approval' 
      });
    }

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot approve enrollments from other schools' 
      });
    }

    if (action === 'approve') {
      // Approve the enrollment
      await storage.updateEnrollment(enrollmentId, {
        status: 'enrolled',
        notes: `${enrollment.notes || ''}\n\nApproved by ${userEmail} on ${new Date().toISOString()}`,
        metadata: {
          ...((enrollment.metadata as any) || {}),
          approvedAt: new Date().toISOString(),
          approvedBy: userEmail
        }
      });

      // Notify parent of approval
      try {
        const parentUser = await storage.getUserByEmail(enrollment.parentEmail);
        if (parentUser) {
          const notification = await storage.createNotification({
            senderId: user.id,
            type: 'in_app',
            priority: 'normal',
            subject: 'Enrollment Approved!',
            content: `Your free enrollment request for ${enrollment.childName} in ${enrollment.className} has been approved. The enrollment is now active.`,
            targetType: 'individual',
            targetData: { userId: parentUser.id, enrollmentId },
            scheduledFor: null
          });
          
          await storage.createNotificationRecipient({
            notificationId: notification.id,
            recipientId: parentUser.id,
            deliveryType: 'in_app',
            status: 'pending'
          });
        }
      } catch (notifyError) {
        console.error('⚠️ Error sending approval notification:', notifyError);
      }

      console.log(`✅ Enrollment ${enrollmentId} approved by ${userEmail}`);
      res.json({
        success: true,
        message: 'Enrollment approved successfully',
        enrollmentId,
        newStatus: 'enrolled'
      });

    } else {
      // Reject the enrollment
      await storage.updateEnrollment(enrollmentId, {
        status: 'cancelled',
        notes: `${enrollment.notes || ''}\n\nRejected by ${userEmail} on ${new Date().toISOString()}. Reason: ${reason || 'Not specified'}`,
        metadata: {
          ...((enrollment.metadata as any) || {}),
          rejectedAt: new Date().toISOString(),
          rejectedBy: userEmail,
          rejectionReason: reason || 'Not specified'
        }
      });

      // Notify parent of rejection
      try {
        const parentUser = await storage.getUserByEmail(enrollment.parentEmail);
        if (parentUser) {
          const notification = await storage.createNotification({
            senderId: user.id,
            type: 'in_app',
            priority: 'normal',
            subject: 'Enrollment Request Not Approved',
            content: `Your free enrollment request for ${enrollment.childName} in ${enrollment.className} was not approved. ${reason ? `Reason: ${reason}` : 'Please contact the school for more information.'}`,
            targetType: 'individual',
            targetData: { userId: parentUser.id, enrollmentId, reason },
            scheduledFor: null
          });
          
          await storage.createNotificationRecipient({
            notificationId: notification.id,
            recipientId: parentUser.id,
            deliveryType: 'in_app',
            status: 'pending'
          });
        }
      } catch (notifyError) {
        console.error('⚠️ Error sending rejection notification:', notifyError);
      }

      console.log(`❌ Enrollment ${enrollmentId} rejected by ${userEmail}`);
      res.json({
        success: true,
        message: 'Enrollment rejected',
        enrollmentId,
        newStatus: 'cancelled'
      });
    }

  } catch (error: any) {
    console.error('❌ Error processing enrollment approval:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;