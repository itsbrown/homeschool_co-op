import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { calculateCartPricing, validateCartTotal, calculateCartSnapshot, CartItem } from '../utils/cart-pricing';

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

    if (!user.schoolId) {
      return res.status(400).json({ error: 'User is not associated with a school' });
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
      // Pass through enrollment data for existing enrollments with partial payments
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

    // Server-side validation: verify remainingBalance for existing enrollments
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(item.enrollmentId);
        if (enrollment) {
          // Use server-authoritative remainingBalance, overriding client value
          item.remainingBalance = enrollment.remainingBalance ?? enrollment.totalCost ?? 0;
          console.log(`✅ Validated enrollment ${item.enrollmentId} remainingBalance: ${item.remainingBalance}`);
        }
      }
    }

    const snapshot = await calculateCartSnapshot(
      cartItems,
      user.id,
      user.schoolId,
      appliedPromoCode,
      creditsToApply
    );

    console.log('📸 Cart snapshot generated:', {
      userEmail,
      snapshotId: snapshot.snapshotId,
      itemCount: cartItems.length,
      itemsTotal: snapshot.totals.itemsTotal,
      membershipTotal: snapshot.totals.membershipTotal,
      grandTotal: snapshot.totals.grandTotal,
      availableCredits: snapshot.credits.available
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

    if (!user.schoolId) {
      return res.status(400).json({ error: 'User is not associated with a school' });
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
      // Pass through enrollment data for existing enrollments with partial payments
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

    // Server-side validation: verify remainingBalance for existing enrollments
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(item.enrollmentId);
        if (enrollment) {
          // Use server-authoritative remainingBalance, overriding client value
          item.remainingBalance = enrollment.remainingBalance ?? enrollment.totalCost ?? 0;
        }
      }
    }

    const result = await calculateCartPricing(
      cartItems,
      user.id,
      user.schoolId,
      appliedPromoCode
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

    if (!user.schoolId) {
      return res.status(400).json({ error: 'User is not associated with a school' });
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
      // Include enrollment data for existing enrollments with partial payments
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

    // Server-side validation: verify remainingBalance for existing enrollments
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(item.enrollmentId);
        if (enrollment) {
          // Use server-authoritative remainingBalance, overriding client value
          item.remainingBalance = enrollment.remainingBalance ?? enrollment.totalCost ?? 0;
        }
      }
    }

    const validation = await validateCartTotal(
      cartItems,
      user.id,
      user.schoolId,
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
