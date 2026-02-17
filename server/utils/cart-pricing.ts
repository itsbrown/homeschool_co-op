import { storage } from '../storage';
import { getDb } from '../db';
import { userRoles, isActiveMembership } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Discount, SchoolClass } from '@shared/schema';

export interface CartItem {
  id: string;
  classId: number;
  childId: number;
  childName: string;
  variantId?: string;
  price?: number;
  // For existing enrollments with partial payments - server-authoritative remaining balance
  enrollmentId?: number;
  remainingBalance?: number;
}

export interface AppliedDiscount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed_amount' | 'bundle';
  value: number;
  discountAmount: number;
  priority: number;
  bundleRule?: {
    type: string;
    buyQuantity: number;
    freeQuantity?: number;
    discountPercentage?: number;
  };
  sourceType?: string;
}

export interface CartPricingResult {
  subtotal: number;
  discounts: {
    siblingDiscount: number;
    freeAfterThree: number;
    appliedDiscounts: AppliedDiscount[];
    totalDiscountAmount: number;
    discountedChildIds: number[];
    freeItemIds: string[];
  };
  total: number;
  itemPrices: Array<{ classId: number; variantId?: string; price: number }>;
  schoolSettings?: {
    freeAfterThresholdEnabled: boolean;
    freeAfterThreshold: number;
    siblingDiscountRate: number;
  };
  promoCodeValidation?: {
    promoCodeProvided: string;
    promoCodeApplied: boolean;
    reason?: string;
  };
}

async function getUserRoles(userId: number): Promise<string[]> {
  try {
    const db = await getDb();
    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return roles.map((r: { role: string }) => r.role);
  } catch (error) {
    console.error('Error getting user roles for cart pricing:', error);
    return [];
  }
}

function checkRoleEligibility(
  userRolesList: string[], 
  requiredRoles: string[] | null | undefined, 
  matchLogic: string | null | undefined
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  const logic = matchLogic || 'or';
  
  if (logic === 'and') {
    return requiredRoles.every(role => userRolesList.includes(role));
  } else {
    return requiredRoles.some(role => userRolesList.includes(role));
  }
}

export interface SchoolIdResult {
  schoolId: number | null;
  error?: 'EMPTY_CART' | 'NO_CLASS_ID' | 'CLASS_NOT_FOUND' | 'NO_SCHOOL_ID' | 'MIXED_SCHOOLS' | 'LOOKUP_ERROR';
  errorMessage?: string;
}

/**
 * Derives schoolId from cart items when user doesn't have schoolId set directly.
 * Enforces single-school constraint - rejects carts with classes from multiple schools.
 * Returns schoolId if all items are from the same school.
 */
export async function deriveSchoolIdFromCart(items: CartItem[]): Promise<number | null>;
export async function deriveSchoolIdFromCart(items: CartItem[], options: { strict: true }): Promise<SchoolIdResult>;
export async function deriveSchoolIdFromCart(items: CartItem[], options?: { strict?: boolean }): Promise<number | null | SchoolIdResult> {
  const strict = options?.strict ?? false;

  if (!items || items.length === 0) {
    console.log('🏫 deriveSchoolIdFromCart: No items in cart');
    if (strict) return { schoolId: null, error: 'EMPTY_CART', errorMessage: 'Cart is empty' };
    return null;
  }

  const firstClassId = items[0].classId;
  if (!firstClassId) {
    console.log('🏫 deriveSchoolIdFromCart: First item has no classId');
    if (strict) return { schoolId: null, error: 'NO_CLASS_ID', errorMessage: 'Cart item missing class ID' };
    return null;
  }

  try {
    const classData = await storage.getClassById(firstClassId);
    if (!classData) {
      console.log(`🏫 deriveSchoolIdFromCart: Class ${firstClassId} not found`);
      if (strict) return { schoolId: null, error: 'CLASS_NOT_FOUND', errorMessage: `Class ${firstClassId} not found` };
      return null;
    }

    const schoolId = classData.schoolId;
    if (!schoolId) {
      console.log(`🏫 deriveSchoolIdFromCart: Class ${firstClassId} has no schoolId`);
      if (strict) return { schoolId: null, error: 'NO_SCHOOL_ID', errorMessage: `Class ${firstClassId} is not associated with a school` };
      return null;
    }

    console.log(`🏫 deriveSchoolIdFromCart: Derived schoolId ${schoolId} from class ${firstClassId}`);
    
    // Enforce single-school constraint - all items must be from the same school
    for (const item of items) {
      if (item.classId !== firstClassId) {
        const otherClass = await storage.getClassById(item.classId);
        if (otherClass && otherClass.schoolId !== schoolId) {
          console.error(`🚫 deriveSchoolIdFromCart: REJECTED - Mixed schools in cart. Class ${item.classId} is from school ${otherClass.schoolId}, but class ${firstClassId} is from school ${schoolId}`);
          if (strict) {
            return { 
              schoolId: null, 
              error: 'MIXED_SCHOOLS', 
              errorMessage: 'Your cart contains classes from different schools. Please complete each school\'s classes separately.'
            };
          }
          return null;
        }
      }
    }

    if (strict) return { schoolId };
    return schoolId;
  } catch (error) {
    console.error('🏫 deriveSchoolIdFromCart: Error looking up class:', error);
    if (strict) return { schoolId: null, error: 'LOOKUP_ERROR', errorMessage: 'Unable to verify school for cart items' };
    return null;
  }
}

function isDiscountCurrentlyValid(discount: Discount): boolean {
  const now = new Date();
  
  if (discount.validFrom && new Date(discount.validFrom) > now) {
    return false;
  }
  
  if (discount.validUntil && new Date(discount.validUntil) < now) {
    return false;
  }
  
  const currentUsage = discount.currentUsageCount ?? 0;
  if (discount.usageLimit && currentUsage >= discount.usageLimit) {
    return false;
  }
  
  return true;
}

/**
 * Check if a user has exceeded their per-user usage limit for a discount.
 * Returns true if the discount can still be used by this user.
 * 
 * SECURITY: This function fails CLOSED - if the discount has a usageLimitPerUser
 * but we cannot verify the user's usage (missing email or DB error), the discount
 * is rejected to prevent abuse.
 */
async function checkPerUserUsageLimit(discount: Discount, parentEmail: string | undefined): Promise<{ allowed: boolean; reason?: string }> {
  // If no per-user limit is set, the discount is allowed
  if (!discount.usageLimitPerUser) {
    return { allowed: true };
  }
  
  // FAIL CLOSED: If the discount has a per-user limit but no email to verify,
  // reject the discount to prevent bypassing the limit
  if (!parentEmail) {
    console.log('🚫 Discount per-user limit enforcement: rejecting discount due to missing parentEmail', {
      discountId: discount.id,
      discountName: discount.name,
      usageLimitPerUser: discount.usageLimitPerUser
    });
    return { 
      allowed: false, 
      reason: 'Unable to verify per-user usage limit - please ensure you are logged in' 
    };
  }
  
  try {
    const userUsageCount = await storage.getDiscountUsageCountByUser(discount.id, parentEmail);
    
    if (userUsageCount >= discount.usageLimitPerUser) {
      console.log('🚫 Discount per-user limit exceeded:', {
        discountId: discount.id,
        discountName: discount.name,
        parentEmail,
        usageLimitPerUser: discount.usageLimitPerUser,
        userUsageCount
      });
      return { 
        allowed: false, 
        reason: `You have already used this promo code ${userUsageCount} time${userUsageCount !== 1 ? 's' : ''}. Maximum allowed is ${discount.usageLimitPerUser}.`
      };
    }
    
    return { allowed: true };
  } catch (error) {
    // FAIL CLOSED: On DB error, reject the discount to prevent potential abuse
    console.error('🚫 Error checking per-user discount usage limit - REJECTING discount for safety:', error);
    return { 
      allowed: false, 
      reason: 'Unable to verify per-user usage limit at this time. Please try again later.' 
    };
  }
}

function isDiscountApplicable(
  discount: Discount,
  items: Array<{ classId: number; price: number }>,
  subtotal: number
): boolean {
  if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
    return false;
  }

  if (!isDiscountCurrentlyValid(discount)) {
    return false;
  }

  if (discount.applicableToClasses && discount.applicableToClasses.length > 0) {
    const itemClassIds = items.map(item => item.classId);
    const hasApplicableClass = discount.applicableToClasses.some(classId => 
      itemClassIds.includes(classId)
    );
    if (!hasApplicableClass) {
      return false;
    }
  }

  return true;
}

function calculateDiscountAmount(
  discount: Discount,
  subtotal: number,
  items: Array<{ classId: number; price: number }>
): number {
  let discountAmount = 0;

  if (discount.bundleRule) {
    discountAmount = calculateBundleDiscount(items, discount.bundleRule);
  } else if (discount.type === 'percentage') {
    discountAmount = Math.round((subtotal * discount.value) / 100);
    if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
      discountAmount = discount.maxDiscountAmount;
    }
  } else if (discount.type === 'fixed_amount') {
    discountAmount = discount.value;
    if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
      discountAmount = discount.maxDiscountAmount;
    }
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }
  }

  return discountAmount;
}

function calculateBundleDiscount(
  items: Array<{ classId: number; price: number }>,
  bundleRule: { type: string; buyQuantity: number; freeQuantity?: number; discountPercentage?: number }
): number {
  if (!bundleRule || items.length === 0) {
    return 0;
  }

  if (!bundleRule.buyQuantity || bundleRule.buyQuantity < 1) {
    return 0;
  }

  const itemCount = items.length;
  const sortedItems = [...items].sort((a, b) => a.price - b.price);
  
  switch (bundleRule.type) {
    case 'nth_item_free': {
      const nthItem = bundleRule.buyQuantity;
      const freeItemsCount = Math.floor(itemCount / nthItem);
      
      if (freeItemsCount === 0) return 0;
      
      const discountAmount = sortedItems
        .slice(0, freeItemsCount)
        .reduce((sum, item) => sum + item.price, 0);
      
      return Math.round(discountAmount);
    }
    
    case 'buy_x_get_y_free': {
      const buyQty = bundleRule.buyQuantity;
      const freeQty = bundleRule.freeQuantity || 0;
      
      if (freeQty === 0) return 0;
      
      const setSize = buyQty + freeQty;
      const completeSets = Math.floor(itemCount / setSize);
      
      if (completeSets === 0) return 0;
      
      const freeItemsCount = completeSets * freeQty;
      const discountAmount = sortedItems
        .slice(0, freeItemsCount)
        .reduce((sum, item) => sum + item.price, 0);
      
      return Math.round(discountAmount);
    }
    
    case 'buy_x_get_y_percent_off': {
      const buyQty = bundleRule.buyQuantity;
      const discountQty = bundleRule.freeQuantity || 0;
      const percentOff = bundleRule.discountPercentage || 0;
      
      if (discountQty === 0 || percentOff === 0) return 0;
      
      const setSize = buyQty + discountQty;
      const completeSets = Math.floor(itemCount / setSize);
      
      if (completeSets === 0) return 0;
      
      const discountedItemsCount = completeSets * discountQty;
      const discountAmount = sortedItems
        .slice(0, discountedItemsCount)
        .reduce((sum, item) => sum + (item.price * (percentOff / 100)), 0);
      
      return Math.round(discountAmount);
    }
    
    default:
      return 0;
  }
}

async function getClassPrice(classId: number, variantId?: string): Promise<number> {
  const classData = await storage.getClassById(classId);
  if (!classData) {
    throw new Error(`Class not found: ${classId}`);
  }

  let basePrice = classData.price || 0;

  if (classData.schedule) {
    try {
      const schedule = typeof classData.schedule === 'string' 
        ? JSON.parse(classData.schedule) 
        : classData.schedule;
      
      if (schedule.variants && Array.isArray(schedule.variants) && schedule.variants.length > 0) {
        if (variantId) {
          const variant = schedule.variants.find((v: any) => v.id === variantId);
          if (variant && typeof variant.price === 'number') {
            basePrice = variant.price;
          }
        } else {
          const defaultVariant = schedule.variants.find((v: any) => v.id === 'default-variant');
          if (defaultVariant && typeof defaultVariant.price === 'number') {
            basePrice = defaultVariant.price;
          } else if (schedule.variants[0] && typeof schedule.variants[0].price === 'number') {
            basePrice = schedule.variants[0].price;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse class schedule:', e);
    }
  }

  if (classData.prorateEnabled && classData.startDate && classData.endDate) {
    try {
      const { calculateProratedPrice } = await import('../lib/prorate-calculator.js');
      const prorateResult = calculateProratedPrice(basePrice, classData.startDate, classData.endDate);
      if (prorateResult.proratePercentage < 100) {
        console.log(`📊 Cart pricing pro-rated class ${classId}: ${basePrice} → ${prorateResult.proratedPriceCents} cents (${prorateResult.proratePercentage}%)`);
        return prorateResult.proratedPriceCents;
      }
    } catch (e) {
      console.warn('Failed to calculate proration for cart pricing:', e);
    }
  }

  return basePrice;
}

export async function calculateCartPricing(
  items: CartItem[],
  userId: number,
  schoolId: number,
  appliedPromoCode?: string,
  parentEmail?: string
): Promise<CartPricingResult> {
  console.log('🧮 Server-side cart pricing calculation:', {
    itemCount: items.length,
    userId,
    schoolId,
    appliedPromoCode
  });

  const itemPrices: Array<{ classId: number; variantId?: string; price: number; enrollmentId?: number }> = [];
  for (const item of items) {
    // For existing enrollments with partial payments, use the authoritative remainingBalance
    // This ensures parents only pay what's actually owed, not the full class price
    if (item.enrollmentId && typeof item.remainingBalance === 'number' && item.remainingBalance >= 0) {
      console.log(`💰 Using enrollment remainingBalance for item ${item.id}:`, {
        enrollmentId: item.enrollmentId,
        remainingBalance: item.remainingBalance,
        classId: item.classId
      });
      itemPrices.push({ 
        classId: item.classId, 
        variantId: item.variantId, 
        price: item.remainingBalance,
        enrollmentId: item.enrollmentId
      });
    } else {
      // For new enrollments, fetch the class price as usual
      const price = await getClassPrice(item.classId, item.variantId);
      itemPrices.push({ classId: item.classId, variantId: item.variantId, price });
    }
  }

  const subtotal = itemPrices.reduce((sum, item) => sum + item.price, 0);

  const school = await storage.getSchool(schoolId);
  const freeAfterThreeEnabled = school?.freeAfterThresholdEnabled || false;
  const freeAfterThreshold = school?.freeAfterThreshold || 3;

  const schoolDiscounts = await storage.getDiscountsBySchoolId(schoolId);
  const siblingDiscountSetting = schoolDiscounts.find(d => 
    d.isActive && d.siblingDiscount === true
  );
  const siblingDiscountRate = siblingDiscountSetting ? siblingDiscountSetting.value / 100 : 0;

  const userRolesList = await getUserRoles(userId);

  const childrenWithClasses = items.reduce((acc, item) => {
    acc[item.childId] = (acc[item.childId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  const uniqueChildren = Object.keys(childrenWithClasses).length;

  // Enhanced logging for debugging price mismatches
  console.log('🧒 Cart pricing - Children analysis:', {
    childrenWithClasses,
    uniqueChildrenCount: uniqueChildren,
    childIds: Object.keys(childrenWithClasses).map(Number),
    schoolSettings: {
      freeAfterThreeEnabled,
      freeAfterThreshold,
      siblingDiscountRate: siblingDiscountRate * 100 + '%',
      siblingDiscountConfigured: !!siblingDiscountSetting
    }
  });

  let freeAfterThreeDiscount = 0;
  let freeItemIds: string[] = [];

  if (freeAfterThreeEnabled && uniqueChildren > freeAfterThreshold) {
    const freeEnrollmentCount = uniqueChildren - freeAfterThreshold;
    
    const itemsWithPrices = items.map((item, idx) => ({
      ...item,
      price: itemPrices[idx].price
    }));
    
    const sortedItems = [...itemsWithPrices].sort((a, b) => a.price - b.price);
    const freeItems = sortedItems.slice(0, freeEnrollmentCount);
    
    freeAfterThreeDiscount = freeItems.reduce((sum, item) => sum + item.price, 0);
    freeItemIds = freeItems.map(item => item.id);
  }

  // Calculate potential sibling discount (may be overridden by higher-priority promo)
  let potentialSiblingDiscount = 0;
  let discountedChildIds: number[] = [];
  const siblingDiscountPriority = siblingDiscountSetting?.priority ?? 10;

  if ((!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) && uniqueChildren > 1 && siblingDiscountRate > 0) {
    const itemsWithPrices = items.map((item, idx) => ({
      ...item,
      price: itemPrices[idx].price
    }));

    const childTotals = itemsWithPrices.reduce((acc, item) => {
      acc[item.childId] = (acc[item.childId] || 0) + item.price;
      return acc;
    }, {} as Record<number, number>);

    const childrenByTotalCost = Object.entries(childTotals)
      .sort(([, totalA], [, totalB]) => totalB - totalA)
      .map(([childId]) => Number(childId));

    discountedChildIds = childrenByTotalCost.slice(1);

    potentialSiblingDiscount = discountedChildIds.reduce((sum, childId) => {
      const childItems = itemsWithPrices.filter(item => item.childId === childId);
      
      if (childItems.length > 0) {
        const lowestPriceItem = childItems.reduce((lowest, item) => 
          item.price < lowest.price ? item : lowest
        );
        return sum + Math.round(lowestPriceItem.price * siblingDiscountRate);
      }
      
      return sum;
    }, 0);
    
    console.log('💰 Potential sibling discount calculated:', {
      potentialSiblingDiscount,
      discountedChildIds,
      siblingDiscountRate: siblingDiscountRate * 100 + '%',
      siblingDiscountPriority
    });
  }

  // Log freeAfterThree discount if applicable
  if (freeAfterThreeDiscount > 0) {
    console.log('🎁 Free After Threshold discount applied:', {
      freeAfterThreeDiscount,
      freeItemIds,
      threshold: freeAfterThreshold,
      uniqueChildren
    });
  }

  const appliedDiscounts: AppliedDiscount[] = [];
  let autoAndPromoDiscountAmount = 0;
  let siblingDiscount = 0;
  let siblingOverriddenByPromo = false;
  
  // Track promo code validation for caller visibility
  let promoCodeValidation: CartPricingResult['promoCodeValidation'] = undefined;

  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    // Check for promo code first to determine if it should override sibling discount
    let promoDiscount: typeof schoolDiscounts[0] | undefined;
    let promoHasHigherPriority = false;
    
    if (appliedPromoCode) {
      console.log('🎫 Searching for promo code in school discounts:', {
        promoCode: appliedPromoCode,
        schoolId,
        availableDiscountsWithCodes: schoolDiscounts
          .filter(d => d.code)
          .map(d => ({ id: d.id, code: d.code, isActive: d.isActive, applicationMethod: d.applicationMethod }))
      });
      
      promoDiscount = schoolDiscounts.find(d => 
        d.isActive && 
        d.code?.toLowerCase() === appliedPromoCode.toLowerCase() &&
        (d.applicationMethod === 'manual' || d.applicationMethod === 'both')
      );
      
      if (!promoDiscount) {
        // Build detailed reason for promo code not found
        const codeMatch = schoolDiscounts.find(d => d.code?.toLowerCase() === appliedPromoCode.toLowerCase());
        let reason = 'No matching discount found with this code';
        if (codeMatch) {
          if (!codeMatch.isActive) {
            reason = 'Promo code exists but is no longer active';
          } else if (codeMatch.applicationMethod !== 'manual' && codeMatch.applicationMethod !== 'both') {
            reason = 'Promo code exists but is configured for automatic application only';
          }
        }
        
        console.log('⚠️ Promo code not found or not applicable:', {
          promoCode: appliedPromoCode,
          reason
        });
        
        promoCodeValidation = {
          promoCodeProvided: appliedPromoCode,
          promoCodeApplied: false,
          reason
        };
      }
      
      if (promoDiscount) {
        const promoPriority = promoDiscount.priority ?? 0;
        // Lower number = higher priority. If promo priority < sibling priority, promo wins.
        promoHasHigherPriority = promoPriority < siblingDiscountPriority;
        
        console.log('🎫 Promo code priority check:', {
          promoCode: appliedPromoCode,
          promoPriority,
          siblingDiscountPriority,
          promoHasHigherPriority,
          promoIsCombinable: promoDiscount.combinableWithOthers,
          siblingIsCombinable: siblingDiscountSetting?.combinableWithOthers
        });
      }
    }

    // Determine if sibling discount should be applied
    // Higher-priority promo (lower number) always overrides lower-priority sibling discount
    // This ensures priority 1 promo beats priority 10 sibling discount
    const promoBlocksSibling = promoDiscount && promoHasHigherPriority;
    
    if (potentialSiblingDiscount > 0 && !promoBlocksSibling) {
      siblingDiscount = potentialSiblingDiscount;
    } else if (promoBlocksSibling) {
      siblingOverriddenByPromo = true;
      discountedChildIds = []; // Clear since sibling discount not applied
      console.log('🔄 Sibling discount overridden by higher-priority promo code:', {
        promoCode: appliedPromoCode,
        promoPriority: promoDiscount?.priority ?? 0,
        siblingDiscountPriority,
        potentialSiblingDiscountWouldHaveBeen: potentialSiblingDiscount
      });
    }

    // Apply automatic discounts (sorted by priority: lower number = higher priority)
    const activeDiscounts = schoolDiscounts.filter(d => 
      d.isActive && 
      !d.siblingDiscount &&
      !d.appliesToMembership &&
      (d.applicationMethod === 'automatic' || d.applicationMethod === 'both')
    );

    // Sort by priority ascending: lower number = higher priority = applied first
    const sortedDiscounts = [...activeDiscounts].sort((a, b) => (a.priority || 0) - (b.priority || 0));

    for (const discount of sortedDiscounts) {
      if (!checkRoleEligibility(userRolesList, discount.requiredRoles, discount.roleMatchLogic)) {
        continue;
      }

      const itemsForDiscount = itemPrices.map((ip, idx) => ({
        classId: ip.classId,
        price: ip.price
      }));

      if (!isDiscountApplicable(discount, itemsForDiscount, subtotal)) {
        continue;
      }

      // Check per-user usage limit (usageLimitPerUser validation)
      const perUserCheck = await checkPerUserUsageLimit(discount, parentEmail);
      if (!perUserCheck.allowed) {
        console.log(`🚫 Skipping discount ${discount.name} (ID: ${discount.id}) - per-user limit: ${perUserCheck.reason}`);
        continue;
      }

      const discountAmount = calculateDiscountAmount(discount, subtotal, itemsForDiscount);

      if (discountAmount > 0) {
        appliedDiscounts.push({
          id: discount.id,
          name: discount.name,
          type: discount.bundleRule ? 'bundle' : discount.type as 'percentage' | 'fixed_amount',
          value: discount.value,
          discountAmount,
          priority: discount.priority || 0,
          bundleRule: discount.bundleRule || undefined,
          sourceType: discount.bundleRule ? 'bundle' : discount.type
        });

        autoAndPromoDiscountAmount += discountAmount;

        if (!discount.combinableWithOthers) {
          break;
        }
      }
    }

    // Apply promo code if eligible
    if (promoDiscount) {
      const promoPriority = promoDiscount.priority ?? 0;
      
      // Remove lower-priority non-combinable discounts when higher-priority promo is applied
      // This enforces: lower priority number = higher priority = wins
      const discountsToRemove: number[] = [];
      appliedDiscounts.forEach((d, idx) => {
        const originalDiscount = schoolDiscounts.find(sd => sd.id === d.id);
        const discountPriority = originalDiscount?.priority ?? 0;
        // If promo has higher priority (lower number) and existing discount is non-combinable, remove it
        if (promoPriority < discountPriority && originalDiscount?.combinableWithOthers === false) {
          discountsToRemove.push(idx);
          console.log('🔄 Removing lower-priority non-combinable discount:', {
            discountName: d.name,
            discountPriority,
            promoPriority,
            discountAmount: d.discountAmount
          });
        }
      });
      
      // Remove from highest index to lowest to avoid index shifting issues
      discountsToRemove.sort((a, b) => b - a).forEach(idx => {
        const removed = appliedDiscounts.splice(idx, 1)[0];
        autoAndPromoDiscountAmount -= removed.discountAmount;
      });
      
      // Check if remaining discounts allow combining
      const existingDiscountsAllowCombining = appliedDiscounts.length === 0 || 
        appliedDiscounts.every(d => {
          const originalDiscount = schoolDiscounts.find(sd => sd.id === d.id);
          return originalDiscount?.combinableWithOthers !== false;
        });
      
      // Sibling discount is already handled above - if promo has higher priority, sibling is already removed
      const siblingAllowsCombining = siblingDiscount === 0 || 
        siblingDiscountSetting?.combinableWithOthers !== false;

      const canApplyPromo = existingDiscountsAllowCombining && siblingAllowsCombining;

      if (!canApplyPromo) {
        console.log('⚠️ Promo code blocked due to non-combinable discounts:', {
          promoCode: appliedPromoCode,
          promoPriority,
          siblingDiscount,
          siblingAllowsCombining,
          existingDiscountsAllowCombining,
          appliedDiscountsCount: appliedDiscounts.length
        });
      }

      if (canApplyPromo && checkRoleEligibility(userRolesList, promoDiscount.requiredRoles, promoDiscount.roleMatchLogic)) {
        const itemsForDiscount = itemPrices.map(ip => ({
          classId: ip.classId,
          price: ip.price
        }));

        if (isDiscountApplicable(promoDiscount, itemsForDiscount, subtotal)) {
          // Check per-user usage limit for promo code (usageLimitPerUser validation)
          const promoPerUserCheck = await checkPerUserUsageLimit(promoDiscount, parentEmail);
          if (!promoPerUserCheck.allowed) {
            promoCodeValidation = {
              promoCodeProvided: appliedPromoCode!,
              promoCodeApplied: false,
              reason: promoPerUserCheck.reason || 'You have already used this promo code the maximum allowed times'
            };
          } else {
            const discountAmount = calculateDiscountAmount(promoDiscount, subtotal, itemsForDiscount);

            if (discountAmount > 0) {
              appliedDiscounts.push({
                id: promoDiscount.id,
                name: promoDiscount.name,
                type: promoDiscount.bundleRule ? 'bundle' : promoDiscount.type as 'percentage' | 'fixed_amount',
                value: promoDiscount.value,
                discountAmount,
                priority: promoDiscount.priority ?? 0,
                bundleRule: promoDiscount.bundleRule || undefined,
                sourceType: 'promo'
              });

              autoAndPromoDiscountAmount += discountAmount;
              
              // Mark promo code as successfully applied
              promoCodeValidation = {
                promoCodeProvided: appliedPromoCode!,
                promoCodeApplied: true
              };
              
              console.log('✅ Promo code successfully applied:', {
                promoCode: appliedPromoCode,
                discountId: promoDiscount.id,
                discountName: promoDiscount.name,
                discountAmount
              });
            }
          }
        }
      }
    }
  }

  const totalDiscountAmount = siblingDiscount + freeAfterThreeDiscount + autoAndPromoDiscountAmount;
  const total = Math.max(0, subtotal - totalDiscountAmount);

  console.log('🧮 Cart pricing result:', {
    subtotal,
    siblingDiscount,
    freeAfterThreeDiscount,
    autoAndPromoDiscountAmount,
    totalDiscountAmount,
    total,
    appliedDiscountsCount: appliedDiscounts.length
  });

  return {
    subtotal,
    discounts: {
      siblingDiscount,
      freeAfterThree: freeAfterThreeDiscount,
      appliedDiscounts,
      totalDiscountAmount,
      discountedChildIds,
      freeItemIds,
    },
    total,
    itemPrices,
    schoolSettings: {
      freeAfterThresholdEnabled: freeAfterThreeEnabled,
      freeAfterThreshold,
      siblingDiscountRate
    },
    promoCodeValidation
  };
}

export async function validateCartTotal(
  items: CartItem[],
  userId: number,
  schoolId: number,
  clientTotal: number,
  appliedPromoCode?: string,
  parentEmail?: string
): Promise<{ valid: boolean; serverTotal: number; discrepancy: number; result: CartPricingResult }> {
  const result = await calculateCartPricing(items, userId, schoolId, appliedPromoCode, parentEmail);
  
  const discrepancy = clientTotal - result.total;
  const discrepancyPercent = result.total > 0 ? Math.abs(discrepancy) / result.total * 100 : 0;
  
  // Use 0.5% tolerance to match payment validation in stripe.ts
  // Allow up to $1 absolute difference OR up to 0.5% relative difference
  const valid = Math.abs(discrepancy) < 1 || discrepancyPercent < 0.5;

  if (!valid) {
    console.warn('⚠️ Cart total mismatch:', {
      clientTotal,
      serverTotal: result.total,
      discrepancy,
      discrepancyPercent: `${discrepancyPercent.toFixed(2)}%`,
      tolerance: '0.5% or $1',
      appliedDiscounts: result.discounts.appliedDiscounts.map(d => ({
        name: d.name,
        amount: d.discountAmount
      }))
    });
  }

  return {
    valid,
    serverTotal: result.total,
    discrepancy,
    result
  };
}

// Payment plan option returned from server
export interface PaymentPlanOption {
  id: string;
  name: string;
  description: string;
  amount: number; // Amount to pay now (first payment) in cents
  features: string[];
  numberOfPayments?: number; // Number of payments for installment plans
  totalAmount?: number; // Total amount for reference (for installment plans)
  finalPaymentAmount?: number; // Last payment amount (may differ due to rounding)
}

// Extended cart snapshot with membership and credits for checkout reconciliation
export interface CartSnapshot {
  // Unique identifier for this snapshot (hash of inputs)
  snapshotId: string;
  // Timestamp when snapshot was generated
  generatedAt: number;
  // Cart pricing result
  pricing: CartPricingResult;
  // Membership info
  membership: {
    required: boolean;
    amount: number; // Full amount in cents
    discountedAmount: number; // After any membership discounts
    alreadyPaid: boolean;
    schoolId: number; // For payload construction
    schoolName: string; // For display and payload
    year: number; // Current year for membership enrollment
  };
  // Available credits
  credits: {
    available: number; // Total available credits in cents
    applied: number; // Credits applied to this order
  };
  // Combined totals
  totals: {
    itemsTotal: number; // Cart items after discounts
    membershipTotal: number; // Membership fee (0 if already paid or not required)
    grandTotal: number; // Items + Membership
    payableAmount: number; // Grand total minus applied credits (what user actually pays)
  };
  // Server-calculated payment plan options based on payableAmount
  paymentPlans: PaymentPlanOption[];
}

// Generate a snapshot ID from cart inputs for cache/version comparison
function generateSnapshotId(
  items: CartItem[],
  userId: number,
  schoolId: number,
  appliedPromoCode?: string
): string {
  const payload = JSON.stringify({
    items: items.map(i => ({ classId: i.classId, childId: i.childId, variantId: i.variantId })),
    userId,
    schoolId,
    promoCode: appliedPromoCode || null,
    timestamp: Math.floor(Date.now() / 60000) // 1-minute granularity for cache
  });
  
  // Simple hash for comparison (not cryptographic, just for version tracking)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `snap_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

// Calculate payment plan options based on payable amount and class dates
// Uses the same logic as actual payment creation to ensure consistency
async function calculatePaymentPlans(
  payableAmount: number, 
  items: CartItem[]
): Promise<PaymentPlanOption[]> {
  if (payableAmount <= 0) {
    return [];
  }

  // Calculate number of biweekly payments based on actual class dates
  // This ensures display matches the actual payment schedule that will be created
  let numberOfBiweeklyPayments = 4; // Default fallback
  let earliestStartDate: Date | null = null;
  let latestEndDate: Date | null = null;
  
  // Get class dates from cart items to calculate actual payment schedule
  for (const item of items) {
    try {
      const classData = await storage.getClassById(item.classId) as any;
      if (classData) {
        // Get dates from variant or class level
        let startDate = classData.startDate ? new Date(classData.startDate) : null;
        let endDate = classData.endDate ? new Date(classData.endDate) : null;
        
        // Check if variant has different dates
        if (item.variantId && classData.priceVariants) {
          const variants = typeof classData.priceVariants === 'string' 
            ? JSON.parse(classData.priceVariants) 
            : classData.priceVariants;
          const variant = Array.isArray(variants) 
            ? variants.find((v: any) => v.id === item.variantId)
            : null;
          if (variant) {
            if (variant.startDate) startDate = new Date(variant.startDate);
            if (variant.endDate) endDate = new Date(variant.endDate);
          }
        }
        
        // Track the full date range across all items
        if (startDate && (!earliestStartDate || startDate < earliestStartDate)) {
          earliestStartDate = startDate;
        }
        if (endDate && (!latestEndDate || endDate > latestEndDate)) {
          latestEndDate = endDate;
        }
      }
    } catch (e) {
      console.warn(`Could not fetch class ${item.classId} for payment plan calculation:`, e);
    }
  }
  
  // Calculate actual payment schedule using the same calculator as payment creation
  // This ensures display amounts match what will actually be charged
  let biweeklyAmount = Math.round(payableAmount / numberOfBiweeklyPayments);
  let finalPaymentAmount = biweeklyAmount;
  
  if (earliestStartDate && latestEndDate) {
    try {
      const { calculatePaymentSchedule } = await import('../lib/payment-calculator');
      const schedule = calculatePaymentSchedule(payableAmount, earliestStartDate, latestEndDate, 'biweekly');
      numberOfBiweeklyPayments = schedule.numberOfPayments;
      // Use the actual payment amounts from the schedule for server-authoritative pricing
      biweeklyAmount = schedule.paymentAmount;
      finalPaymentAmount = schedule.finalPaymentAmount;
    } catch (e) {
      console.warn('Could not calculate payment schedule, using default 4 payments:', e);
    }
  }

  return [
    {
      id: 'full',
      name: 'Pay in Full',
      description: 'Complete payment now',
      amount: payableAmount,
      features: [
        'No additional fees',
        'No future payment worries'
      ]
    },
    {
      id: 'biweekly',
      name: 'Biweekly Payment Plan',
      description: 'Automatic payments every 2 weeks until class ends',
      amount: biweeklyAmount,
      numberOfPayments: numberOfBiweeklyPayments,
      totalAmount: payableAmount,
      finalPaymentAmount: finalPaymentAmount,
      features: [
        'Pay every 2 weeks based on class schedule',
        'Payments automatically calculated from class start to end date'
      ]
    }
  ];
}

// Calculate full cart snapshot including membership and credits
export async function calculateCartSnapshot(
  items: CartItem[],
  userId: number,
  schoolId: number,
  appliedPromoCode?: string,
  creditsToApply?: number,
  parentEmail?: string
): Promise<CartSnapshot> {
  // Calculate cart pricing
  const pricing = await calculateCartPricing(items, userId, schoolId, appliedPromoCode, parentEmail);
  
  // Get membership info
  const school = await storage.getSchool(schoolId);
  const membershipRequired = school?.membershipRequired || false;
  const membershipFeeAmount = school?.membershipFeeAmount || 0;
  
  // Check if user already has active membership using shared helper for consistency
  const existingMemberships = await storage.getMembershipEnrollmentsByParentId(userId);
  const currentYear = new Date().getFullYear();
  
  // Debug log for membership check
  console.log(`🎫 Membership check for user ${userId}, school ${schoolId}:`, {
    currentYear,
    existingMemberships: existingMemberships?.map((m: any) => ({
      year: m.membershipYear,
      status: m.status,
      schoolId: m.schoolId,
      isActive: isActiveMembership(m.status),
      schoolMatch: Number(m.schoolId) === Number(schoolId)
    }))
  });
  
  // Use Number() to ensure type-safe comparison for schoolId
  // Check for active membership (enrolled or grace_period status)
  // OR membership with remainingBalance = 0 (already paid but status not updated yet)
  const activeMembership = existingMemberships?.find((m: any) => 
    (m.membershipYear === currentYear || m.membershipYear === currentYear + 1) && 
    Number(m.schoolId) === Number(schoolId) &&
    (isActiveMembership(m.status) || (m.remainingBalance !== undefined && m.remainingBalance <= 0))
  );
  const alreadyPaid = !!activeMembership;
  console.log(`🎫 Active membership found: ${alreadyPaid}`, activeMembership ? { 
    year: activeMembership.membershipYear, 
    status: activeMembership.status,
    remainingBalance: activeMembership.remainingBalance 
  } : null);
  
  // Calculate membership discount if applicable
  let discountedMembershipAmount = membershipFeeAmount;
  if (!alreadyPaid && membershipFeeAmount > 0) {
    try {
      const { calculateMembershipDiscount } = await import('./membership');
      const discountResult = await calculateMembershipDiscount(schoolId, userId, membershipFeeAmount);
      discountedMembershipAmount = discountResult.finalAmount;
    } catch (e) {
      console.warn('Could not calculate membership discount:', e);
    }
  }
  
  // Get available credits
  let availableCredits = 0;
  try {
    const credits = await storage.getAvailableCredits(userId);
    availableCredits = credits.reduce((sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)), 0);
  } catch (e) {
    console.warn('Could not fetch available credits:', e);
  }
  
  // Calculate totals
  const itemsTotal = pricing.total;
  const membershipTotal = alreadyPaid ? 0 : discountedMembershipAmount;
  const grandTotal = itemsTotal + membershipTotal;
  
  // Calculate applied credits (capped at available and grand total)
  const appliedCredits = Math.min(creditsToApply || 0, availableCredits, grandTotal);
  const payableAmount = Math.max(0, grandTotal - appliedCredits);
  
  // Calculate payment plans based on payable amount and class dates
  // This ensures the displayed payment schedule matches actual payment creation
  const paymentPlans = await calculatePaymentPlans(payableAmount, items);
  
  return {
    snapshotId: generateSnapshotId(items, userId, schoolId, appliedPromoCode),
    generatedAt: Date.now(),
    pricing,
    membership: {
      // CRITICAL: 'required' indicates whether client MUST include membership in payment
      // True when membershipTotal > 0 (regardless of school config), ensures client includes unpaid membership
      required: membershipTotal > 0,
      amount: membershipFeeAmount,
      discountedAmount: discountedMembershipAmount,
      alreadyPaid,
      schoolId: schoolId, // Include for client to construct membership payload
      schoolName: school?.name || 'School', // Include for display and payload
      year: new Date().getFullYear() // Current year for membership enrollment
    },
    credits: {
      available: availableCredits,
      applied: appliedCredits
    },
    totals: {
      itemsTotal,
      membershipTotal,
      grandTotal,
      payableAmount
    },
    paymentPlans
  };
}
