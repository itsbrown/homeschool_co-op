import { Request, Response } from "express";
import { storage } from "../storage.js";
import { z } from "zod";

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
      newStatus = 'active';
    } else if (newAmountPaid > 0 && newRemainingBalance > 0) {
      newStatus = 'partial_payment';
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
          paymentMethod: validatedData.paymentMethod === 'credit_card' ? 'stripe' : validatedData.paymentMethod,
          description: `Membership payment for ${membership.membershipYear}`,
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
