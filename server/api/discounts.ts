import { Router } from 'express';
import { storage } from '../storage';
import type { Discount } from '@shared/schema';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Helper function to get all roles for a user
async function getUserRoles(userId: number): Promise<string[]> {
  try {
    const db = await getDb();
    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return roles.map((r: { role: string }) => r.role);
  } catch (error) {
    console.error('Error getting user roles:', error);
    return [];
  }
}

// Helper function to check if user meets role requirements for a discount
function checkRoleEligibility(
  userRolesList: string[], 
  requiredRoles: string[] | null | undefined, 
  matchLogic: string | null | undefined
): { eligible: boolean; reason?: string } {
  // If no required roles specified, discount is available to everyone
  if (!requiredRoles || requiredRoles.length === 0) {
    return { eligible: true };
  }

  const logic = matchLogic || 'or';
  
  if (logic === 'and') {
    // User must have ALL required roles
    const hasAllRoles = requiredRoles.every(role => userRolesList.includes(role));
    if (!hasAllRoles) {
      const missingRoles = requiredRoles.filter(role => !userRolesList.includes(role));
      return { 
        eligible: false, 
        reason: `This discount requires you to have ALL of these roles: ${requiredRoles.join(', ')}. You are missing: ${missingRoles.join(', ')}`
      };
    }
    return { eligible: true };
  } else {
    // User must have ANY of the required roles (OR logic)
    const hasAnyRole = requiredRoles.some(role => userRolesList.includes(role));
    if (!hasAnyRole) {
      return { 
        eligible: false, 
        reason: `This discount is only available to users with one of these roles: ${requiredRoles.join(', ')}`
      };
    }
    return { eligible: true };
  }
}

// Apply authentication middleware to all discount endpoints
router.use(supabaseAuth);

/**
 * POST /api/discounts/validate
 * Validate a discount code without applying it
 * Used in cart to check if a code is valid before user submits
 */
router.post('/validate', requireSchoolContext, async (req: any, res) => {
  try {
    const { code, cartTotal, items } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Discount code is required',
      });
    }

    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    console.log(`🔐 Validating discount code for school ${schoolId}`);

    // [FIX:v3.0] Find discount by code AND school_id (tenant isolation)
    const allDiscounts = await storage.getAllDiscounts();
    const discount = allDiscounts.find(
      (d) => d.code?.toLowerCase() === code.toLowerCase() && 
             d.isActive && 
             String(d.schoolId) === schoolId // CRITICAL: Filter by school - normalize DB value
    );

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Invalid discount code',
        valid: false,
      });
    }

    // Check if discount is currently valid (time constraints)
    const now = new Date();
    if (discount.validFrom && new Date(discount.validFrom) > now) {
      return res.status(400).json({
        success: false,
        error: 'This discount is not yet active',
        valid: false,
        discount: {
          name: discount.name,
          validFrom: discount.validFrom,
        },
      });
    }

    if (discount.validUntil && new Date(discount.validUntil) < now) {
      return res.status(400).json({
        success: false,
        error: 'This discount has expired',
        valid: false,
        discount: {
          name: discount.name,
          validUntil: discount.validUntil,
        },
      });
    }

    // Check usage limits
    const currentUsage = discount.currentUsageCount ?? 0;
    if (discount.usageLimit && currentUsage >= discount.usageLimit) {
      return res.status(400).json({
        success: false,
        error: 'This discount has reached its usage limit',
        valid: false,
      });
    }

    // Check role-based eligibility
    if (discount.requiredRoles && discount.requiredRoles.length > 0) {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to validate this discount',
          valid: false,
        });
      }

      const userRolesList = await getUserRoles(userId);
      console.log(`🎭 Checking role eligibility for user ${userId}:`, {
        userRoles: userRolesList,
        requiredRoles: discount.requiredRoles,
        matchLogic: discount.roleMatchLogic || 'or',
      });

      const roleCheck = checkRoleEligibility(
        userRolesList,
        discount.requiredRoles,
        discount.roleMatchLogic
      );

      if (!roleCheck.eligible) {
        return res.status(400).json({
          success: false,
          error: roleCheck.reason || 'You are not eligible for this discount based on your role',
          valid: false,
          discount: {
            name: discount.name,
            requiredRoles: discount.requiredRoles,
            roleMatchLogic: discount.roleMatchLogic,
          },
        });
      }
    }

    // Check minimum order amount
    if (discount.minOrderAmount && cartTotal < discount.minOrderAmount) {
      return res.status(400).json({
        success: false,
        error: `Minimum order amount of $${(discount.minOrderAmount / 100).toFixed(2)} required`,
        valid: false,
        discount: {
          name: discount.name,
          minOrderAmount: discount.minOrderAmount,
        },
      });
    }

    // Calculate discount amount
    console.log('💰 Discount raw data from DB:', {
      id: discount.id,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      maxDiscountAmount: discount.maxDiscountAmount,
      cartTotal,
    });

    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((cartTotal * discount.value) / 100);
      // Apply max discount cap if set
      if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
        discountAmount = discount.maxDiscountAmount;
      }
    } else if (discount.type === 'fixed_amount') {
      discountAmount = discount.value;
      // Apply max discount cap if set (for fixed_amount discounts too)
      if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
        console.log(`⚠️ Fixed discount value (${discountAmount}) exceeds max (${discount.maxDiscountAmount}), capping to max`);
        discountAmount = discount.maxDiscountAmount;
      }
      // Don't let fixed discount exceed cart total
      if (discountAmount > cartTotal) {
        console.log(`⚠️ Fixed discount (${discountAmount}) exceeds cart total (${cartTotal}), capping to cart total`);
        discountAmount = cartTotal;
      }
    }

    console.log('💰 Discount calculation result:', {
      code: discount.code,
      type: discount.type,
      valueFromDB: discount.value,
      maxDiscountAmountFromDB: discount.maxDiscountAmount,
      cartTotal,
      calculatedAmount: discountAmount,
      isNaN: isNaN(discountAmount)
    });

    // Validate discountAmount before sending
    if (isNaN(discountAmount) || discountAmount === undefined || discountAmount === null) {
      console.error('❌ Invalid discountAmount calculated:', discountAmount);
      return res.status(500).json({
        success: false,
        error: 'Error calculating discount amount - please contact support',
      });
    }

    // Return valid discount info
    res.json({
      success: true,
      valid: true,
      discount: {
        id: discount.id,
        name: discount.name,
        description: discount.description,
        type: discount.type,
        value: discount.value,
        discountAmount,
        code: discount.code,
        combinableWithOthers: discount.combinableWithOthers,
      },
      discountAmount, // Also include at top level for easier access
    });
  } catch (error) {
    console.error('Error validating discount code:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate discount code',
    });
  }
});

/**
 * POST /api/discounts/apply
 * Apply a discount code and increment usage counter
 * Called after successful payment to track discount usage
 */
router.post('/apply', requireSchoolContext, async (req: any, res) => {
  try {
    const {
      code,
      parentEmail,
      childId,
      enrollmentId,
      paymentId,
      classId,
      originalAmount,
      finalAmount,
    } = req.body;

    if (!code || !parentEmail || originalAmount === undefined || finalAmount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, parentEmail, originalAmount, finalAmount',
      });
    }

    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;
    const userEmail = req.auth?.payload?.email;

    // Verify user belongs to this school and matches parentEmail
    if (userEmail !== parentEmail) {
      return res.status(403).json({
        success: false,
        error: 'You can only apply discounts to your own account',
      });
    }

    console.log(`🔐 Applying discount code for school ${schoolId}, user ${parentEmail}`);

    // [FIX:v3.0] Find discount by code AND school_id (tenant isolation)
    const allDiscounts = await storage.getAllDiscounts();
    const discount = allDiscounts.find(
      (d) => d.code?.toLowerCase() === code.toLowerCase() && 
             d.isActive && 
             String(d.schoolId) === schoolId // CRITICAL: Filter by school - normalize DB value
    );

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Invalid discount code',
      });
    }

    // Calculate discount amount
    const discountAmount = originalAmount - finalAmount;

    // Create discount application record
    const application = await storage.createDiscountApplication({
      discountId: discount.id,
      parentEmail,
      childId: childId || null,
      schoolEnrollmentId: null,
      programEnrollmentId: enrollmentId || null,
      paymentId: paymentId || null,
      classId: classId || null,
      originalAmount,
      discountAmount,
      finalAmount,
      applicationMethod: 'manual',
      appliedBy: null,
    });

    // Increment usage counter atomically (prevents race conditions)
    const incrementSuccess = await storage.incrementDiscountUsageAtomic(discount.id);
    if (!incrementSuccess) {
      console.warn(`⚠️ Discount ${discount.code} usage limit reached during atomic increment`);
    }

    console.log(`✅ Applied discount ${discount.code} to ${parentEmail} (atomic increment: ${incrementSuccess})`);

    res.json({
      success: true,
      application: {
        id: application.id,
        discountName: discount.name,
        discountAmount,
        finalAmount,
      },
    });
  } catch (error) {
    console.error('Error applying discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply discount',
    });
  }
});

export default router;
