import { storage } from '../storage';
import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Discount, SchoolClass } from '@shared/schema';

export interface CartItem {
  id: string;
  classId: number;
  childId: number;
  childName: string;
  variantId?: string;
  price?: number;
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

  if (classData.schedule) {
    try {
      const schedule = typeof classData.schedule === 'string' 
        ? JSON.parse(classData.schedule) 
        : classData.schedule;
      
      if (schedule.variants && Array.isArray(schedule.variants) && schedule.variants.length > 0) {
        if (variantId) {
          const variant = schedule.variants.find((v: any) => v.id === variantId);
          if (variant && typeof variant.price === 'number') {
            return variant.price;
          }
        }
        
        const defaultVariant = schedule.variants.find((v: any) => v.id === 'default-variant');
        if (defaultVariant && typeof defaultVariant.price === 'number') {
          return defaultVariant.price;
        }
        
        if (schedule.variants[0] && typeof schedule.variants[0].price === 'number') {
          return schedule.variants[0].price;
        }
      }
    } catch (e) {
      console.warn('Failed to parse class schedule:', e);
    }
  }

  return classData.price || 0;
}

export async function calculateCartPricing(
  items: CartItem[],
  userId: number,
  schoolId: number,
  appliedPromoCode?: string
): Promise<CartPricingResult> {
  console.log('🧮 Server-side cart pricing calculation:', {
    itemCount: items.length,
    userId,
    schoolId,
    appliedPromoCode
  });

  const itemPrices: Array<{ classId: number; variantId?: string; price: number }> = [];
  for (const item of items) {
    const price = await getClassPrice(item.classId, item.variantId);
    itemPrices.push({ classId: item.classId, variantId: item.variantId, price });
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

  let siblingDiscount = 0;
  let discountedChildIds: number[] = [];

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

    siblingDiscount = discountedChildIds.reduce((sum, childId) => {
      const childItems = itemsWithPrices.filter(item => item.childId === childId);
      
      if (childItems.length > 0) {
        const lowestPriceItem = childItems.reduce((lowest, item) => 
          item.price < lowest.price ? item : lowest
        );
        return sum + Math.round(lowestPriceItem.price * siblingDiscountRate);
      }
      
      return sum;
    }, 0);
    
    console.log('💰 Sibling discount calculated:', {
      siblingDiscount,
      discountedChildIds,
      siblingDiscountRate: siblingDiscountRate * 100 + '%'
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

  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    const activeDiscounts = schoolDiscounts.filter(d => 
      d.isActive && 
      !d.siblingDiscount &&
      !d.appliesToMembership &&
      (d.applicationMethod === 'automatic' || d.applicationMethod === 'both')
    );

    const sortedDiscounts = [...activeDiscounts].sort((a, b) => (b.priority || 0) - (a.priority || 0));

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

    if (appliedPromoCode) {
      const promoDiscount = schoolDiscounts.find(d => 
        d.isActive && 
        d.code?.toLowerCase() === appliedPromoCode.toLowerCase() &&
        (d.applicationMethod === 'manual' || d.applicationMethod === 'both')
      );

      if (promoDiscount) {
        const canApplyPromo = appliedDiscounts.length === 0 || 
          appliedDiscounts.every(d => {
            const originalDiscount = schoolDiscounts.find(sd => sd.id === d.id);
            return originalDiscount?.combinableWithOthers;
          });

        if (canApplyPromo && checkRoleEligibility(userRolesList, promoDiscount.requiredRoles, promoDiscount.roleMatchLogic)) {
          const itemsForDiscount = itemPrices.map(ip => ({
            classId: ip.classId,
            price: ip.price
          }));

          if (isDiscountApplicable(promoDiscount, itemsForDiscount, subtotal)) {
            const discountAmount = calculateDiscountAmount(promoDiscount, subtotal, itemsForDiscount);

            if (discountAmount > 0) {
              appliedDiscounts.push({
                id: promoDiscount.id,
                name: promoDiscount.name,
                type: promoDiscount.bundleRule ? 'bundle' : promoDiscount.type as 'percentage' | 'fixed_amount',
                value: promoDiscount.value,
                discountAmount,
                priority: 999,
                bundleRule: promoDiscount.bundleRule || undefined,
                sourceType: 'promo'
              });

              autoAndPromoDiscountAmount += discountAmount;
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
    }
  };
}

export async function validateCartTotal(
  items: CartItem[],
  userId: number,
  schoolId: number,
  clientTotal: number,
  appliedPromoCode?: string
): Promise<{ valid: boolean; serverTotal: number; discrepancy: number; result: CartPricingResult }> {
  const result = await calculateCartPricing(items, userId, schoolId, appliedPromoCode);
  
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
  amount: number; // Amount to pay now in cents
  features: string[];
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

// Calculate payment plan options based on payable amount
function calculatePaymentPlans(payableAmount: number): PaymentPlanOption[] {
  if (payableAmount <= 0) {
    return [];
  }

  const depositAmount = Math.round(payableAmount * 0.1); // 10% deposit
  const biweeklyAmount = Math.round(payableAmount / 4); // Estimated 4 payments

  return [
    {
      id: 'deposit',
      name: 'Pay Deposit Only',
      description: 'Secure your spot with a 10% deposit',
      amount: depositAmount,
      features: [
        'Immediate enrollment confirmation',
        'Remaining balance due before class starts'
      ]
    },
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
  creditsToApply?: number
): Promise<CartSnapshot> {
  // Calculate cart pricing
  const pricing = await calculateCartPricing(items, userId, schoolId, appliedPromoCode);
  
  // Get membership info
  const school = await storage.getSchool(schoolId);
  const membershipRequired = school?.membershipRequired || false;
  const membershipFeeAmount = school?.membershipFeeAmount || 0;
  
  // Check if user already has active membership
  const existingMemberships = await storage.getMembershipEnrollmentsByParentId(userId);
  const currentYear = new Date().getFullYear();
  const activeMembership = existingMemberships?.find((m: any) => 
    (m.membershipYear === currentYear || m.membershipYear === currentYear + 1) && 
    m.status === 'enrolled' &&
    m.schoolId === schoolId
  );
  const alreadyPaid = !!activeMembership;
  
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
  
  // Calculate payment plans based on payable amount
  const paymentPlans = calculatePaymentPlans(payableAmount);
  
  return {
    snapshotId: generateSnapshotId(items, userId, schoolId, appliedPromoCode),
    generatedAt: Date.now(),
    pricing,
    membership: {
      required: membershipRequired,
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
