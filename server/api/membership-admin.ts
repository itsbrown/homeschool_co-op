import { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../config/stripe";

// Schema for updating membership
const updateMembershipSchema = z.object({
  status: z.enum(["pending_payment", "active", "expired", "grace_period", "suspended"]).optional(),
  amountPaid: z.number().optional(),
  remainingBalance: z.number().optional(),
  expirationDate: z.string().or(z.date()).optional(),
  gracePeriodEnd: z.string().or(z.date()).optional(),
  paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "check", "other"]).optional(),
  notes: z.string().optional(),
});

// Schema for manual payment recording
const recordPaymentSchema = z.object({
  amount: z.number().min(0),
  paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "check", "other"]),
  paymentDate: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
});

/**
 * Get memberships for the authenticated admin's school (no schoolId param needed)
 */
export const getMySchoolMemberships = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is school admin or platform admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - school admin access required" });
    }

    // Get school ID from user
    if (!user.schoolId) {
      return res.status(400).json({ message: "User does not have a school assigned" });
    }

    // Get all memberships for this school
    const memberships = await storage.getMembershipEnrollmentsBySchoolId(user.schoolId);

    // Enhance with parent information
    const enhancedMemberships = await Promise.all(
      memberships.map(async (membership: any) => {
        try {
          const parent = await storage.getUser(membership.parentUserId);
          return {
            ...membership,
            parentName: parent?.name || 'Unknown',
            parentEmail: parent?.email || 'Unknown',
          };
        } catch (error) {
          return {
            ...membership,
            parentName: 'Unknown',
            parentEmail: 'Unknown',
          };
        }
      })
    );

    res.json(enhancedMemberships);
  } catch (error: any) {
    console.error('Error fetching school memberships:', error);
    res.status(500).json({ message: error.message || "Failed to fetch memberships" });
  }
};

/**
 * Get membership summary for the authenticated admin's school (no schoolId param needed)
 */
export const getMySchoolMembershipSummary = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is school admin or platform admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - school admin access required" });
    }

    // Get school ID from user
    if (!user.schoolId) {
      return res.status(400).json({ message: "User does not have a school assigned" });
    }

    // Get all memberships
    const memberships = await storage.getMembershipEnrollmentsBySchoolId(user.schoolId);

    // Calculate summary
    const total = memberships.length;
    const active = memberships.filter((m: any) => m.status === 'active').length;
    const pending = memberships.filter((m: any) => m.status === 'pending_payment').length;
    const expired = memberships.filter((m: any) => m.status === 'expired').length;
    const gracePeriod = memberships.filter((m: any) => m.status === 'grace_period').length;

    res.json({
      total,
      active,
      pending,
      expired,
      gracePeriod
    });
  } catch (error: any) {
    console.error('Error fetching membership summary:', error);
    res.status(500).json({ message: error.message || "Failed to fetch summary" });
  }
};

/**
 * Get all memberships for a school (admin only)
 */
export const getSchoolMemberships = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is school admin or platform admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - school admin access required" });
    }

    const schoolIdParam = req.params.schoolId || req.query.schoolId;
    if (!schoolIdParam) {
      return res.status(400).json({ message: "School ID required" });
    }

    const schoolId = parseInt(schoolIdParam.toString());
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Verify admin belongs to this school (unless platform admin)
    if (user.role === 'schoolAdmin') {
      if (!user.schoolId || user.schoolId !== schoolId) {
        return res.status(403).json({ message: "Not authorized for this school" });
      }
    }

    // Get all memberships for this school
    const memberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);

    // Enhance with parent information
    const enhancedMemberships = await Promise.all(
      memberships.map(async (membership: any) => {
        try {
          const parent = await storage.getUser(membership.parentUserId);
          return {
            ...membership,
            parentName: parent?.name || 'Unknown',
            parentEmail: parent?.email || 'Unknown',
          };
        } catch (error) {
          console.error(`Error fetching parent for membership ${membership.id}:`, error);
          return {
            ...membership,
            parentName: 'Unknown',
            parentEmail: 'Unknown',
          };
        }
      })
    );

    res.json(enhancedMemberships);
  } catch (error: any) {
    console.error("Error fetching school memberships:", error);
    res.status(500).json({ message: "Error fetching memberships", error: error.message });
  }
};

/**
 * Get a specific membership by ID (admin only)
 */
export const getMembershipById = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const membershipId = parseInt(req.params.id);
    if (isNaN(membershipId)) {
      return res.status(400).json({ message: "Invalid membership ID" });
    }

    const membership = await storage.getMembershipEnrollmentById(membershipId);
    if (!membership) {
      return res.status(404).json({ message: "Membership not found" });
    }

    // Verify admin has access to this membership's school
    if (user.role === 'schoolAdmin') {
      if (!user.schoolId || user.schoolId !== membership.schoolId) {
        return res.status(403).json({ message: "Not authorized for this school" });
      }
    } else if (user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - admin access required" });
    }

    // Enhance with parent information
    const parent = await storage.getUser(membership.parentUserId);
    const enhancedMembership = {
      ...membership,
      parentName: parent?.name || 'Unknown',
      parentEmail: parent?.email || 'Unknown',
    };

    res.json(enhancedMembership);
  } catch (error: any) {
    console.error("Error fetching membership:", error);
    res.status(500).json({ message: "Error fetching membership", error: error.message });
  }
};

/**
 * Update membership status and details (admin only)
 */
export const updateMembership = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const membershipId = parseInt(req.params.id);
    if (isNaN(membershipId)) {
      return res.status(400).json({ message: "Invalid membership ID" });
    }

    // Validate request body
    const validatedData = updateMembershipSchema.parse(req.body);

    // Get existing membership
    const membership = await storage.getMembershipEnrollmentById(membershipId);
    if (!membership) {
      return res.status(404).json({ message: "Membership not found" });
    }

    // Verify admin has access to this membership's school
    if (user.role === 'schoolAdmin') {
      if (!user.schoolId || user.schoolId !== membership.schoolId) {
        return res.status(403).json({ message: "Not authorized for this school" });
      }
    } else if (user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - admin access required" });
    }

    // Convert date strings to Date objects if needed
    const updateData: any = { ...validatedData };
    if (updateData.expirationDate && typeof updateData.expirationDate === 'string') {
      updateData.expirationDate = new Date(updateData.expirationDate);
    }
    if (updateData.gracePeriodEnd && typeof updateData.gracePeriodEnd === 'string') {
      updateData.gracePeriodEnd = new Date(updateData.gracePeriodEnd);
    }

    // Update membership
    const updatedMembership = await storage.updateMembershipEnrollment(membershipId, updateData);

    console.log(`✅ Admin ${userEmail} updated membership ${membershipId}`);
    res.json(updatedMembership);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data", 
        errors: error.errors 
      });
    }
    
    console.error("Error updating membership:", error);
    res.status(500).json({ message: "Error updating membership", error: error.message });
  }
};

/**
 * Record manual payment for membership (admin only)
 */
export const recordMembershipPayment = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const membershipId = parseInt(req.params.id);
    if (isNaN(membershipId)) {
      return res.status(400).json({ message: "Invalid membership ID" });
    }

    // Validate request body
    const validatedData = recordPaymentSchema.parse(req.body);

    // Get existing membership
    const membership = await storage.getMembershipEnrollmentById(membershipId);
    if (!membership) {
      return res.status(404).json({ message: "Membership not found" });
    }

    // Verify admin has access to this membership's school
    if (user.role === 'schoolAdmin') {
      if (!user.schoolId || user.schoolId !== membership.schoolId) {
        return res.status(403).json({ message: "Not authorized for this school" });
      }
    } else if (user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - admin access required" });
    }

    // Calculate new payment totals
    const newAmountPaid = membership.amountPaid + validatedData.amount;
    const newRemainingBalance = membership.amount - newAmountPaid;
    
    // Determine new status
    let newStatus = membership.status;
    if (newRemainingBalance <= 0) {
      newStatus = 'enrolled'; // Fully paid = enrolled status
    } else if (newAmountPaid > 0 && newRemainingBalance > 0) {
      newStatus = 'pending_payment'; // Partial payment = still pending
    }

    // Update membership
    const updateData = {
      amountPaid: newAmountPaid,
      remainingBalance: newRemainingBalance,
      status: newStatus,
      paymentMethod: validatedData.paymentMethod,
      notes: validatedData.notes || membership.notes
    };

    const updatedMembership = await storage.updateMembershipEnrollment(membershipId, updateData);

    // Also create a payment record for tracking
    const parent = await storage.getUser(membership.parentUserId);
    if (parent) {
      try {
        await storage.createPayment({
          schoolId: membership.schoolId,
          parentId: membership.parentUserId,
          parentEmail: parent.email,
          amount: validatedData.amount,
          currency: 'usd',
          status: 'completed',
          paymentMethod: validatedData.paymentMethod === 'credit_card' || validatedData.paymentMethod === 'paypal' ? 'stripe' : validatedData.paymentMethod,
          description: `Membership payment for ${membership.membershipYear}`,
          childName: null,
          className: null,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          stripeRefundId: null,
          originalPaymentId: null,
          enrollmentIds: [],
          metadata: {
            membershipId: membership.id,
            membershipYear: membership.membershipYear,
            recordedBy: user.id,
            recordedAt: new Date().toISOString(),
            notes: validatedData.notes
          },
          paymentDate: validatedData.paymentDate ? new Date(validatedData.paymentDate) : new Date()
        });
      } catch (error) {
        console.error('Error creating payment record:', error);
        // Don't fail the request if payment record creation fails
      }
    }

    console.log(`✅ Admin ${userEmail} recorded $${validatedData.amount/100} payment for membership ${membershipId}`);
    res.json(updatedMembership);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data", 
        errors: error.errors 
      });
    }
    
    console.error("Error recording membership payment:", error);
    res.status(500).json({ message: "Error recording payment", error: error.message });
  }
};

/**
 * Get membership summary/stats for a school (admin only)
 */
export const getMembershipSummary = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from Auth0 JWT
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is school admin or platform admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - school admin access required" });
    }

    const schoolIdParam = req.params.schoolId || req.query.schoolId;
    if (!schoolIdParam) {
      return res.status(400).json({ message: "School ID required" });
    }

    const schoolId = parseInt(schoolIdParam.toString());
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Verify admin belongs to this school (unless platform admin)
    if (user.role === 'schoolAdmin') {
      if (!user.schoolId || user.schoolId !== schoolId) {
        return res.status(403).json({ message: "Not authorized for this school" });
      }
    }

    // Get all memberships
    const memberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);

    // Calculate summary stats
    const summary = {
      total: memberships.length,
      active: 0,
      pending: 0,
      partial: 0,
      gracePeriod: 0,
      expired: 0,
      suspended: 0,
      totalRevenue: 0,
      totalPaid: 0,
      totalOutstanding: 0
    };

    memberships.forEach((membership: any) => {
      summary.totalRevenue += membership.amount;
      summary.totalPaid += membership.amountPaid;
      summary.totalOutstanding += membership.remainingBalance;

      switch (membership.status) {
        case 'active':
          summary.active++;
          break;
        case 'pending_payment':
          summary.pending++;
          break;
        case 'partial_payment':
          summary.partial++;
          break;
        case 'grace_period':
          summary.gracePeriod++;
          break;
        case 'expired':
          summary.expired++;
          break;
        case 'suspended':
          summary.suspended++;
          break;
      }
    });

    res.json(summary);
  } catch (error: any) {
    console.error("Error fetching membership summary:", error);
    res.status(500).json({ message: "Error fetching summary", error: error.message });
  }
};

/**
 * Create a new membership enrollment (admin only)
 */
export const createMembershipEnrollment = async (req: any, res: Response) => {
  try {
    // Get authenticated user email from supabaseAuth
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is school admin or platform admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Not authorized - school admin access required" });
    }

    // Validate request body
    const { parentUserId, schoolId, membershipYear } = req.body;
    
    if (!parentUserId || !schoolId || !membershipYear) {
      return res.status(400).json({ 
        message: "Missing required fields: parentUserId, schoolId, and membershipYear are required" 
      });
    }

    // Verify school access - admins can only create memberships for their school (unless superAdmin)
    if (user.role === 'schoolAdmin' && user.schoolId !== schoolId) {
      return res.status(403).json({ message: "Not authorized to create memberships for this school" });
    }

    // Get school to fetch membership settings
    const school = await storage.getSchool(schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check if membership already exists for this parent/school/year
    const existingMembership = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentUserId,
      schoolId,
      membershipYear
    );

    if (existingMembership) {
      return res.status(409).json({ 
        message: "Membership already exists for this parent, school, and year",
        existingMembership 
      });
    }

    // Get membership fee from school settings
    const membershipFee = school.membershipFeeAmount || 0;
    
    if (membershipFee <= 0) {
      return res.status(400).json({ 
        message: "School does not have a membership fee configured" 
      });
    }

    // Calculate dates based on school settings
    const renewalMonth = school.membershipRenewalMonth || 9; // Default to September
    const renewalDay = school.membershipRenewalDay || 1; // Default to 1st
    const gracePeriodDays = school.membershipGracePeriodDays || 30; // Default to 30 days

    // Due date: renewal date of the membership year
    const dueDate = new Date(membershipYear, renewalMonth - 1, renewalDay);
    
    // Expiration date: one year from due date
    const expirationDate = new Date(membershipYear + 1, renewalMonth - 1, renewalDay);
    
    // Grace period end: expiration date + grace period days
    const gracePeriodEnd = new Date(expirationDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

    // Create membership enrollment
    const membershipData = {
      schoolId,
      parentUserId,
      membershipYear,
      amount: membershipFee,
      amountPaid: 0,
      remainingBalance: membershipFee,
      status: 'pending_payment' as const,
      dueDate,
      expirationDate,
      gracePeriodEnd,
      paymentMethod: null,
      notes: null,
      // Add required fields
      stripeCustomerId: null,
      startDate: null,
      stripeSubscriptionId: null,
      membershipTier: 'basic' as const, // Default tier
      renewalDate: null
    };

    const newMembership = await storage.createMembershipEnrollment(membershipData);

    console.log(`✅ Admin ${userEmail} created membership ${newMembership.id} for parent ${parentUserId}`);
    res.status(201).json(newMembership);
  } catch (error: any) {
    console.error("Error creating membership enrollment:", error);
    res.status(500).json({ message: "Failed to create membership", error: error.message });
  }
};

/**
 * Create Stripe Checkout Session for membership payment
 */
export const createMembershipCheckoutSession = async (req: any, res: Response) => {
  try {
    // Initialize Stripe with environment-based key selection
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

    const { membershipEnrollmentId, tier } = req.body;

    if (!membershipEnrollmentId) {
      return res.status(400).json({ message: "Membership enrollment ID is required" });
    }

    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get membership enrollment
    const membership = await storage.getMembershipEnrollmentById(membershipEnrollmentId);
    if (!membership) {
      return res.status(404).json({ message: "Membership enrollment not found" });
    }

    // Get parent user
    const parent = await storage.getUser(membership.parentUserId);
    if (!parent) {
      return res.status(404).json({ message: "Parent user not found" });
    }

    // Get school configuration
    const school = await storage.getSchool(membership.schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Get membership fee amount (in cents)
    const membershipFeeAmount = school.membershipFeeAmount || 0;
    if (membershipFeeAmount <= 0) {
      return res.status(400).json({ message: "School does not have a membership fee configured" });
    }

    // Determine tier pricing (all tiers same price for now, can be differentiated later)
    const selectedTier = tier || membership.membershipTier || 'basic';
    const priceInCents = membershipFeeAmount;

    // Create or retrieve Stripe customer
    let customerId = parent.stripeCustomerId;
    if (!customerId) {
      console.log(`Creating new Stripe customer for parent ${parent.email}`);
      const customer = await stripe.customers.create({
        email: parent.email,
        name: parent.name,
        metadata: {
          userId: parent.id.toString(),
          schoolId: membership.schoolId.toString(),
          membershipEnrollmentId: membershipEnrollmentId.toString()
        }
      });
      customerId = customer.id;

      // Update parent with customer ID
      await storage.updateUser(parent.id, { stripeCustomerId: customerId });
      console.log(`✅ Created Stripe customer ${customerId} for parent ${parent.email}`);
    }

    // Calculate anniversary dates for subscription
    const renewalMonth = school.membershipRenewalMonth || 9;
    const renewalDay = school.membershipRenewalDay || 1;
    const currentYear = new Date().getFullYear();
    const nextRenewalDate = new Date(currentYear + 1, renewalMonth - 1, renewalDay);
    
    // Create Stripe Checkout Session with subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${school.name} - Annual Membership (${selectedTier})`,
              description: school.membershipDescription || 'Annual family membership',
              metadata: {
                schoolId: membership.schoolId.toString(),
                tier: selectedTier
              }
            },
            unit_amount: priceInCents,
            recurring: {
              interval: 'year',
              interval_count: 1
            }
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          membershipEnrollmentId: membershipEnrollmentId.toString(),
          schoolId: membership.schoolId.toString(),
          parentUserId: parent.id.toString(),
          tier: selectedTier
        }
      },
      success_url: `${req.protocol}://${req.get('host')}/membership-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/parent-profile`,
      metadata: {
        membershipEnrollmentId: membershipEnrollmentId.toString(),
        schoolId: membership.schoolId.toString(),
        parentUserId: parent.id.toString(),
        tier: selectedTier
      }
    });

    console.log(`✅ Created Stripe Checkout Session ${session.id} for membership ${membershipEnrollmentId}`);
    res.status(200).json({ 
      sessionUrl: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error("Error creating membership checkout session:", error);
    res.status(500).json({ 
      message: "Failed to create checkout session", 
      error: error.message 
    });
  }
};

/**
 * Lookup and sync Stripe subscription data for a user by email
 */
export const syncStripeSubscription = async (req: any, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    // Initialize Stripe with environment-based key selection
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    
    // Search for customer in Stripe
    const customers = await stripe.customers.search({
      query: `email:'${email}'`
    });
    
    if (customers.data.length === 0) {
      return res.status(404).json({ message: "No Stripe customer found with this email" });
    }
    
    const customer = customers.data[0];
    
    // Get subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active'
    });
    
    // Check if user exists in database
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ 
        message: "User not found in database",
        stripeData: {
          customerId: customer.id,
          name: customer.name,
          email: customer.email,
          subscriptions: subscriptions.data.length
        }
      });
    }
    
    // Get existing memberships
    const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    
    // Prepare response
    const response: any = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        stripeCustomerId: user.stripeCustomerId
      },
      stripe: {
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        subscriptions: subscriptions.data.map((sub: any) => ({
          id: sub.id,
          status: sub.status,
          amount: sub.items.data[0]?.price?.unit_amount,
          interval: sub.items.data[0]?.price?.recurring?.interval,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000)
        }))
      },
      memberships: memberships.map((m: any) => ({
        id: m.id,
        schoolId: m.schoolId,
        amount: m.amount,
        status: m.status,
        stripeSubscriptionId: m.stripeSubscriptionId,
        stripeCustomerId: m.stripeCustomerId
      })),
      syncNeeded: {
        updateUserStripeId: user.stripeCustomerId !== customer.id,
        linkSubscriptions: subscriptions.data.length > 0 && memberships.length === 0,
        updateMembershipSubscriptionIds: memberships.some((m: any) => 
          subscriptions.data.some(sub => !m.stripeSubscriptionId || m.stripeSubscriptionId !== sub.id)
        )
      }
    };
    
    res.json(response);
    
  } catch (error: any) {
    console.error("Error syncing Stripe subscription:", error);
    res.status(500).json({ message: "Error syncing subscription", error: error.message });
  }
};
