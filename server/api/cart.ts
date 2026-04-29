import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { calculateCartPricing, validateCartTotal, calculateCartSnapshot, CartItem, deriveSchoolIdFromCart, SchoolIdResult } from '../utils/cart-pricing';
import { computeEffectiveBalance } from '@shared/schema';

/**
 * For an existing-enrollment cart line, return the parent's true outstanding balance
 * in cents, never reading the stored `remaining_balance` directly.
 *
 * Why: `remaining_balance` is intentionally written as 0 (NOT NULL) for Stripe-managed
 * payment plans, so any read of it understates what families owe and silently zeros
 * out cart totals / payment intents. Always prefer the DB-generated `effective_balance`
 * column, falling back to the same formula if it's absent.
 *
 * (See asa-payment-patterns "Parent Payments page shows $0" pitfall.)
 */
function resolveEnrollmentEffectiveBalance(enrollment: any): number {
  return (
    enrollment?.effectiveBalance ??
    computeEffectiveBalance(
      enrollment?.totalCost ?? 0,
      enrollment?.totalPaid ?? 0,
      enrollment?.compAmountCents ?? 0,
    )
  );
}

const router = Router();

// Full cart snapshot endpoint - returns authoritative pricing including membership and credits
// Used by CartCheckout to reconcile client state with server before payment
router.post('/snapshot', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { items, appliedPromoCode, creditsToApply } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);

    const cartItems: CartItem[] = items.map((item: any) => ({
      id: item.id || `${item.classId}-${item.childId}`,
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      enrollmentId: item.enrollmentId,
      remainingBalance: item.remainingBalance
    }));

    for (const item of cartItems) {
      if (!childIds.includes(item.childId)) {
        return res.status(403).json({ 
          error: 'UNAUTHORIZED_CHILDREN',
          message: 'Cannot calculate pricing for children not owned by this parent'
        });
      }
    }

    // Derive schoolId: prefer user.schoolId, fall back to cart items with strict validation
    let effectiveSchoolId = user.schoolId;
    if (!effectiveSchoolId && cartItems.length > 0) {
      console.log(`🏫 User ${userEmail} has no schoolId, deriving from cart items...`);
      const result = await deriveSchoolIdFromCart(cartItems, { strict: true }) as SchoolIdResult;
      if (result.error) {
        return res.status(400).json({ 
          error: result.error,
          message: result.errorMessage || 'Unable to determine school for this cart.'
        });
      }
      effectiveSchoolId = result.schoolId;
      if (effectiveSchoolId) {
        console.log(`🏫 Using derived schoolId ${effectiveSchoolId} for cart snapshot`);
      }
    }

    if (!effectiveSchoolId) {
      return res.status(400).json({ 
        error: 'SCHOOL_NOT_FOUND',
        message: 'Unable to determine school for this cart. Please ensure classes are valid.'
      });
    }

    // Server-side validation: refresh remainingBalance for existing enrollments
    // from the DB-generated effective_balance (see resolveEnrollmentEffectiveBalance).
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment: any = await storage.getProgramEnrollmentById(item.enrollmentId);
        if (enrollment) {
          const effectiveBalance = resolveEnrollmentEffectiveBalance(enrollment);
          item.remainingBalance = effectiveBalance;
          console.log(`✅ /cart/snapshot: enrollment ${item.enrollmentId} effectiveBalance=${effectiveBalance} (totalCost=${enrollment.totalCost}, totalPaid=${enrollment.totalPaid}, compAmountCents=${enrollment.compAmountCents}, storedRemainingBalance=${enrollment.remainingBalance})`);
        }
      }
    }

    const snapshot = await calculateCartSnapshot(
      cartItems,
      user.id,
      effectiveSchoolId,
      appliedPromoCode,
      creditsToApply,
      userEmail // Pass parent email for per-user discount usage limit validation
    );

    console.log('📸 Cart snapshot generated:', {
      userEmail,
      snapshotId: snapshot.snapshotId,
      itemCount: cartItems.length,
      itemsTotal: snapshot.totals.itemsTotal,
      membershipTotal: snapshot.totals.membershipTotal,
      grandTotal: snapshot.totals.grandTotal,
      availableCredits: snapshot.credits.available,
      derivedSchoolId: user.schoolId ? null : effectiveSchoolId
    });

    res.json(snapshot);
  } catch (error: any) {
    console.error('Error generating cart snapshot:', error);
    res.status(500).json({ 
      error: 'SNAPSHOT_ERROR',
      message: error.message || 'Failed to generate cart snapshot'
    });
  }
});

router.post('/calculate', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { items, appliedPromoCode } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);

    const cartItems: CartItem[] = items.map((item: any) => ({
      id: item.id || `${item.classId}-${item.childId}`,
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      enrollmentId: item.enrollmentId,
      remainingBalance: item.remainingBalance
    }));

    for (const item of cartItems) {
      if (!childIds.includes(item.childId)) {
        return res.status(403).json({ 
          error: 'UNAUTHORIZED_CHILDREN',
          message: 'Cannot calculate pricing for children not owned by this parent'
        });
      }
    }

    // Derive schoolId: prefer user.schoolId, fall back to cart items with strict validation
    let effectiveSchoolId = user.schoolId;
    if (!effectiveSchoolId && cartItems.length > 0) {
      console.log(`🏫 User ${userEmail} has no schoolId, deriving from cart items...`);
      const result = await deriveSchoolIdFromCart(cartItems, { strict: true }) as SchoolIdResult;
      if (result.error) {
        return res.status(400).json({ 
          error: result.error,
          message: result.errorMessage || 'Unable to determine school for this cart.'
        });
      }
      effectiveSchoolId = result.schoolId;
    }

    if (!effectiveSchoolId) {
      return res.status(400).json({ 
        error: 'SCHOOL_NOT_FOUND',
        message: 'Unable to determine school for this cart. Please ensure classes are valid.'
      });
    }

    // Server-side validation: refresh remainingBalance for existing enrollments
    // from the DB-generated effective_balance (see resolveEnrollmentEffectiveBalance).
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment: any = await storage.getProgramEnrollmentById(item.enrollmentId);
        if (enrollment) {
          item.remainingBalance = resolveEnrollmentEffectiveBalance(enrollment);
        }
      }
    }

    const result = await calculateCartPricing(
      cartItems,
      user.id,
      effectiveSchoolId,
      appliedPromoCode,
      userEmail // Pass parent email for per-user discount usage limit validation
    );

    console.log('📊 Cart calculation response:', {
      userEmail,
      itemCount: cartItems.length,
      subtotal: result.subtotal,
      totalDiscount: result.discounts.totalDiscountAmount,
      total: result.total
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error calculating cart pricing:', error);
    res.status(500).json({ 
      error: 'CALCULATION_ERROR',
      message: error.message || 'Failed to calculate cart pricing'
    });
  }
});

router.post('/validate', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { items, clientTotal, appliedPromoCode } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    if (typeof clientTotal !== 'number') {
      return res.status(400).json({ error: 'clientTotal is required and must be a number' });
    }

    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);

    const cartItems: CartItem[] = items.map((item: any) => ({
      id: item.id || `${item.classId}-${item.childId}`,
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      enrollmentId: item.enrollmentId,
      remainingBalance: item.remainingBalance
    }));

    for (const item of cartItems) {
      if (!childIds.includes(item.childId)) {
        return res.status(403).json({ 
          error: 'UNAUTHORIZED_CHILDREN',
          message: 'Cannot validate cart for children not owned by this parent'
        });
      }
    }

    // Derive schoolId: prefer user.schoolId, fall back to cart items with strict validation
    let effectiveSchoolId = user.schoolId;
    if (!effectiveSchoolId && cartItems.length > 0) {
      console.log(`🏫 User ${userEmail} has no schoolId, deriving from cart items for validation...`);
      const derivedResult = await deriveSchoolIdFromCart(cartItems, { strict: true }) as SchoolIdResult;
      if (derivedResult.error) {
        return res.status(400).json({ 
          error: derivedResult.error,
          message: derivedResult.errorMessage || 'Unable to determine school for this cart.'
        });
      }
      effectiveSchoolId = derivedResult.schoolId;
    }

    if (!effectiveSchoolId) {
      return res.status(400).json({ 
        error: 'SCHOOL_NOT_FOUND',
        message: 'Unable to determine school for this cart. Please ensure classes are valid.'
      });
    }

    // Server-side validation: refresh remainingBalance for existing enrollments
    // from the DB-generated effective_balance (see resolveEnrollmentEffectiveBalance).
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment: any = await storage.getProgramEnrollmentById(item.enrollmentId);
        if (enrollment) {
          item.remainingBalance = resolveEnrollmentEffectiveBalance(enrollment);
        }
      }
    }

    const validation = await validateCartTotal(
      cartItems,
      user.id,
      effectiveSchoolId,
      clientTotal,
      appliedPromoCode
    );

    console.log('✅ Cart validation response:', {
      userEmail,
      clientTotal,
      serverTotal: validation.serverTotal,
      valid: validation.valid,
      discrepancy: validation.discrepancy
    });

    res.json({
      valid: validation.valid,
      serverTotal: validation.serverTotal,
      discrepancy: validation.discrepancy,
      pricing: validation.result
    });
  } catch (error: any) {
    console.error('Error validating cart:', error);
    res.status(500).json({ 
      error: 'VALIDATION_ERROR',
      message: error.message || 'Failed to validate cart'
    });
  }
});

export default router;
