import { Router } from 'express';
import { storage } from '../storage';
import type { Discount } from '@shared/schema';
import { supabaseAuth } from '../middleware/supabase-auth';

const router = Router();

// Apply authentication middleware to all discount endpoints
router.use(supabaseAuth);

/**
 * POST /api/discounts/validate
 * Validate a discount code without applying it
 * Used in cart to check if a code is valid before user submits
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, cartTotal, items } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Discount code is required',
      });
    }

    // Extract school_id from authenticated JWT
    const schoolId = req.auth?.payload?.school_id;
    if (!schoolId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - school context missing',
      });
    }

    console.log(`🔐 Validating discount code for school ${schoolId}`);

    // Find discount by code AND school_id (tenant isolation)
    const allDiscounts = await storage.getAllDiscounts();
    const discount = allDiscounts.find(
      (d) => d.code?.toLowerCase() === code.toLowerCase() && 
             d.isActive && 
             d.schoolId === schoolId // CRITICAL: Filter by school
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
    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((cartTotal * discount.value) / 100);
      // Apply max discount cap if set
      if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
        discountAmount = discount.maxDiscountAmount;
      }
    } else if (discount.type === 'fixed_amount') {
      discountAmount = discount.value;
      // Don't let fixed discount exceed cart total
      if (discountAmount > cartTotal) {
        discountAmount = cartTotal;
      }
    }

    console.log('💰 Discount calculation:', {
      code: discount.code,
      type: discount.type,
      value: discount.value,
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
router.post('/apply', async (req, res) => {
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

    // Extract school_id from authenticated JWT
    const schoolId = req.auth?.payload?.school_id;
    const userEmail = req.auth?.payload?.email;
    
    if (!schoolId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - school context missing',
      });
    }

    // Verify user belongs to this school and matches parentEmail
    if (userEmail !== parentEmail) {
      return res.status(403).json({
        success: false,
        error: 'You can only apply discounts to your own account',
      });
    }

    console.log(`🔐 Applying discount code for school ${schoolId}, user ${parentEmail}`);

    // Find discount by code AND school_id (tenant isolation)
    const allDiscounts = await storage.getAllDiscounts();
    const discount = allDiscounts.find(
      (d) => d.code?.toLowerCase() === code.toLowerCase() && 
             d.isActive && 
             d.schoolId === schoolId // CRITICAL: Filter by school
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

    // Increment usage counter
    const newUsageCount = (discount.currentUsageCount ?? 0) + 1;
    await storage.updateDiscount(discount.id, {
      currentUsageCount: newUsageCount,
    } as any);

    console.log(`✅ Applied discount ${discount.code} to ${parentEmail}. Usage: ${newUsageCount}`);

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
