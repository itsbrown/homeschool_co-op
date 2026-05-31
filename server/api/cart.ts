import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { calculateCartPricing, validateCartTotal, calculateCartSnapshot, CartItem, resolveCheckoutSchoolId } from '../utils/cart-pricing';
import {
  cacheSnapshot,
  computeCartItemFingerprint,
  type CachedSnapshot,
} from '../lib/snapshotTrustCache';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';

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
      id: item.id || (item.enrollmentId ? `enrollment-${item.enrollmentId}` : `${item.classId}-${item.childId}`),
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      sessionId: item.sessionId,
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

    const schoolResult = await resolveCheckoutSchoolId(user, cartItems);
    if (schoolResult.error || !schoolResult.schoolId) {
      return res.status(400).json({
        error: schoolResult.error || 'SCHOOL_NOT_FOUND',
        message:
          schoolResult.errorMessage ||
          'Unable to determine school for this cart. Please ensure classes are valid.',
      });
    }
    const effectiveSchoolId = schoolResult.schoolId;
    console.log(`🏫 Cart snapshot schoolId ${effectiveSchoolId} for ${userEmail}`);

    // Server-side validation: refresh remainingBalance for existing enrollments
    // from the DB-generated effective_balance (see resolveEnrollmentEffectiveBalance).
    for (const item of cartItems) {
      if (item.enrollmentId) {
        const enrollment: any = await storage.getProgramEnrollmentById(item.enrollmentId);
        if (enrollment) {
          if (enrollment.status === 'location_wishlist') {
            return res.status(400).json({
              error: 'LOCATION_WISHLIST_CHECKOUT_BLOCKED',
              message:
                'Waitlist enrollments are not payable until the campus opens. Save a payment method to join the waitlist.',
            });
          }
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

    // Cache the authoritative values so a subsequent /create-payment-intent
    // call within the trust TTL can reuse them and skip the strict
    // cart-vs-DB revalidation. This is the snapshot-trust path consumed by
    // payment-plan / frequency toggles in CartCheckout.tsx.
    try {
      // Build per-cart-line authoritative cost. itemPrices is the
      // server-derived per-line price for new enrollments; remainingBalance
      // is the client-asserted remainder for existing-enrollment lines.
      // Critically: a given cart line should never have BOTH set — a new
      // enrollment has an itemPrice; an existing-enrollment line has a
      // remainingBalance. Take the MAX per line to avoid double-counting
      // (defense against malformed client payloads), then sum across lines.
      const perLineAuthoritative: number[] = cartItems.map((line: any, idx: number) => {
        const itemPrice = snapshot.pricing.itemPrices?.[idx]?.price ?? 0;
        const remainingBalance = line?.remainingBalance ?? 0;
        return Math.max(itemPrice > 0 ? itemPrice : 0, remainingBalance > 0 ? remainingBalance : 0);
      });
      // Primary sanity bound input: SUM of authoritative per-line costs.
      // Scales linearly with cart size so multi-child carts (e.g. 21
      // enrollments across 8 children) whose itemsTotal far exceeds 5x
      // the largest single line still pass the trust check.
      const cartItemTotalLineCostCents = perLineAuthoritative.reduce(
        (sum, p) => sum + p,
        0,
      );
      // Secondary guard for single-line-cart edge case (and legacy snapshots).
      const cartItemMaxLineCostCents = Math.max(0, ...perLineAuthoritative);
      const fingerprint = computeCartItemFingerprint(
        cartItems.map((i) => ({
          classId: i.classId,
          childId: i.childId,
          variantId: i.variantId,
          enrollmentId: i.enrollmentId,
        })),
      );
      // Cache the biweekly plan from the snapshot (when present) so the
      // /create-payment-intent trust path can size the PaymentIntent off
      // the EXACT figure the parent was shown — no schedule re-verification
      // needed, no false PRICING_CHANGED 409 from re-derived dates.
      const biweeklyFromSnapshot = (snapshot.paymentPlans || []).find(
        (p: any) => p?.id === 'biweekly',
      );
      const biweeklyPlan = biweeklyFromSnapshot
        ? {
            firstPaymentAmount: biweeklyFromSnapshot.amount ?? 0,
            numberOfPayments: biweeklyFromSnapshot.numberOfPayments ?? 1,
            totalAmount:
              biweeklyFromSnapshot.totalAmount ?? snapshot.totals.payableAmount,
            finalPaymentAmount:
              biweeklyFromSnapshot.finalPaymentAmount ??
              biweeklyFromSnapshot.amount ??
              0,
          }
        : null;
      const cached: CachedSnapshot = {
        userId: user.id,
        itemsTotal: snapshot.totals.itemsTotal,
        // pre-discount subtotal — needed by the synthetic cartPricingResult
        // the trust path builds in /create-payment-intent
        subtotal: snapshot.pricing.subtotal,
        membershipAmount: snapshot.totals.membershipTotal,
        discounts: snapshot.pricing.discounts,
        // schoolSettings is needed by downstream discount-snapshot building
        // and discount-usage tracking when the trust path skips
        // calculateCartPricing.
        schoolSettings: snapshot.pricing.schoolSettings ?? null,
        creditsToApply: snapshot.credits.applied,
        appliedPromoCode: appliedPromoCode || null,
        isFreeEnrollment: snapshot.isFreeEnrollment,
        freeEnrollmentReason: snapshot.freeEnrollmentReason,
        cartItemFingerprint: fingerprint,
        cartItemMaxLineCostCents,
        cartItemTotalLineCostCents,
        biweeklyPlan,
        issuedAt: Date.now(),
      };
      cacheSnapshot(snapshot.snapshotId, cached);
      console.log('🧷 Snapshot cached for trust path:', {
        snapshotId: snapshot.snapshotId,
        userId: user.id,
        itemsTotal: cached.itemsTotal,
        membershipAmount: cached.membershipAmount,
        creditsToApply: cached.creditsToApply,
        appliedPromoCode: cached.appliedPromoCode,
        cartItemMaxLineCostCents,
        cartItemTotalLineCostCents,
        hasBiweeklyPlan: !!biweeklyPlan,
        biweeklyFirstPaymentAmount: biweeklyPlan?.firstPaymentAmount ?? null,
        fingerprint,
      });
    } catch (cacheErr) {
      // Non-fatal: trust path will simply miss and the strict path will run.
      console.warn('⚠️ Failed to cache snapshot for trust path (non-fatal):', cacheErr);
    }

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
      id: item.id || (item.enrollmentId ? `enrollment-${item.enrollmentId}` : `${item.classId}-${item.childId}`),
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      sessionId: item.sessionId,
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

    const schoolResult = await resolveCheckoutSchoolId(user, cartItems);
    if (schoolResult.error || !schoolResult.schoolId) {
      return res.status(400).json({
        error: schoolResult.error || 'SCHOOL_NOT_FOUND',
        message:
          schoolResult.errorMessage ||
          'Unable to determine school for this cart. Please ensure classes are valid.',
      });
    }
    const effectiveSchoolId = schoolResult.schoolId;

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
      id: item.id || (item.enrollmentId ? `enrollment-${item.enrollmentId}` : `${item.classId}-${item.childId}`),
      classId: item.classId,
      childId: item.childId,
      childName: item.childName || '',
      variantId: item.variantId,
      sessionId: item.sessionId,
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

    const schoolResult = await resolveCheckoutSchoolId(user, cartItems);
    if (schoolResult.error || !schoolResult.schoolId) {
      return res.status(400).json({
        error: schoolResult.error || 'SCHOOL_NOT_FOUND',
        message:
          schoolResult.errorMessage ||
          'Unable to determine school for this cart. Please ensure classes are valid.',
      });
    }
    const effectiveSchoolId = schoolResult.schoolId;

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
