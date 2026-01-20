import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { trackAddToCart, trackRemoveFromCart, trackViewCart } from '@/lib/analytics';

// Helper function to get user-specific cart storage key
// This prevents cross-account data leakage by namespacing localStorage per user
const getCartStorageKey = (userEmail?: string | null): string => {
  return userEmail ? `asa_cart_${userEmail}` : 'asa_cart_guest';
};

// Helper function to create a complete, valid discounts structure
// This ensures all required fields exist with safe default values
const buildDefaultDiscounts = (): Cart['discounts'] => ({
  siblingDiscount: 0,
  freeAfterThree: 0,
  appliedDiscounts: [],
  totalDiscountAmount: 0,
  discountedChildIds: [],
  freeItemIds: [],
});

// Helper to safely parse a number, handling stringified numbers
const safeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// Helper to validate and normalize an AppliedDiscount entry
// Returns null for completely invalid entries, preserves bundle discount metadata
const normalizeAppliedDiscount = (discount: Partial<AppliedDiscount> | null | undefined): AppliedDiscount | null => {
  if (!discount || typeof discount !== 'object') return null;
  
  // Required fields must be valid
  const id = safeNumber(discount.id);
  const name = typeof discount.name === 'string' ? discount.name : null;
  
  // Detect bundle discounts - preserve their identity for UI logic
  const hasBundleRule = discount.bundleRule && typeof discount.bundleRule === 'object';
  const isBundle = discount.sourceType === 'bundle' || discount.type === 'bundle' || hasBundleRule;
  
  // Determine type - preserve 'bundle' type for bundle discounts
  let type: 'percentage' | 'fixed_amount' | 'bundle' | null = null;
  if (discount.type === 'percentage' || discount.type === 'fixed_amount' || discount.type === 'bundle') {
    type = discount.type;
  } else if (isBundle) {
    // Bundle discounts should have type 'bundle' for UI identification
    type = 'bundle';
  }
  
  // For bundle discounts, value might be derived from bundleRule, so allow 0 as valid
  const value = safeNumber(discount.value) ?? (isBundle ? 0 : null);
    
  // Safely parse discountAmount - crucial for total calculation
  const discountAmount = safeNumber(discount.discountAmount) ?? 0;
  const priority = safeNumber(discount.priority) ?? 0;
  
  // If id or name is invalid, return null (minimum required for display)
  if (id === null || name === null) return null;
  
  // For non-bundle discounts, type and value are required
  if (!isBundle && (type === null || value === null)) return null;
  
  // Preserve bundle discount identity - type: 'bundle' and sourceType: 'bundle'
  return {
    id,
    name,
    type: type || (isBundle ? 'bundle' : 'percentage'),
    value: value ?? 0,
    discountAmount,
    priority,
    bundleRule: discount.bundleRule,
    sourceType: isBundle ? 'bundle' : discount.sourceType,
  };
};

// Helper to clamp a number to non-negative finite value
const clampNonNegative = (value: number, fallback: number = 0): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
};

// Helper function to normalize discounts from API/calculated data
// Merges provided discounts with defaults to ensure all required fields exist
const normalizeDiscounts = (discounts: Partial<Cart['discounts']> | null | undefined): Cart['discounts'] => {
  const defaults = buildDefaultDiscounts();
  if (!discounts) return defaults;
  
  // Validate and filter appliedDiscounts - remove any malformed entries
  const validatedAppliedDiscounts: AppliedDiscount[] = [];
  if (Array.isArray(discounts.appliedDiscounts)) {
    for (const discount of discounts.appliedDiscounts) {
      const normalized = normalizeAppliedDiscount(discount);
      if (normalized) {
        validatedAppliedDiscounts.push(normalized);
      }
    }
  }
  
  // Validate sibling and freeAfterThree discounts using safeNumber (handles strings and NaN)
  const siblingDiscount = clampNonNegative(safeNumber(discounts.siblingDiscount) ?? defaults.siblingDiscount);
  const freeAfterThree = clampNonNegative(safeNumber(discounts.freeAfterThree) ?? defaults.freeAfterThree);
  
  // Calculate total discount amount - use safeNumber for validation
  const rawTotal = safeNumber(discounts.totalDiscountAmount);
  let totalDiscountAmount: number;
  
  if (rawTotal === null || rawTotal < 0) {
    // Recalculate from all discount sources (all values already validated/clamped)
    const appliedTotal = validatedAppliedDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
    totalDiscountAmount = appliedTotal + siblingDiscount + freeAfterThree;
  } else {
    totalDiscountAmount = rawTotal;
  }
  
  // Final clamp to non-negative
  totalDiscountAmount = clampNonNegative(totalDiscountAmount);
  
  return {
    siblingDiscount,
    freeAfterThree,
    appliedDiscounts: validatedAppliedDiscounts,
    totalDiscountAmount,
    discountedChildIds: Array.isArray(discounts.discountedChildIds) 
      ? discounts.discountedChildIds.filter(id => safeNumber(id) !== null).map(id => safeNumber(id)!) 
      : defaults.discountedChildIds,
    freeItemIds: Array.isArray(discounts.freeItemIds)
      ? discounts.freeItemIds.filter(id => typeof id === 'string')
      : defaults.freeItemIds,
  };
};

/**
 * Fetch server-authoritative cart pricing from /api/cart/calculate
 * This is the SINGLE SOURCE OF TRUTH for cart pricing, preventing
 * client-server price mismatches that cause payment failures.
 */
interface ServerCartPricingResponse {
  subtotal: number;
  discounts: {
    siblingDiscount: number;
    freeAfterThree: number;
    appliedDiscounts: Array<{
      id: number;
      name: string;
      type: 'percentage' | 'fixed_amount' | 'bundle';
      value: number;
      discountAmount: number;
      priority: number;
      bundleRule?: {
        type: 'nth_item_free' | 'buy_x_get_y_free' | 'buy_x_get_y_percent_off';
        buyQuantity: number;
        freeQuantity?: number;
        discountPercentage?: number;
      };
      sourceType?: 'percentage' | 'fixed_amount' | 'bundle';
    }>;
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
    showSubscriptionStatus?: boolean;
  };
}

const fetchServerCartPricing = async (
  items: CartItem[],
  getAccessToken: () => Promise<string>,
  appliedPromoCode?: string | null
): Promise<{
  subtotal: number;
  discounts: Cart['discounts'];
  total: number;
  schoolSettings?: Cart['schoolSettings'];
}> => {
  try {
    const token = await getAccessToken();
    
    const response = await fetch('/api/cart/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: items.map(item => ({
          id: item.id,
          classId: item.classId,
          childId: item.childId,
          childName: item.childName,
          variantId: item.variantId,
        })),
        appliedPromoCode,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server cart calculation failed: ${response.status}`);
    }

    const data = await response.json() as ServerCartPricingResponse;
    
    console.log('📊 Server-authoritative cart pricing received:', {
      itemCount: items.length,
      subtotal: data.subtotal,
      totalDiscount: data.discounts.totalDiscountAmount,
      total: data.total,
    });

    return {
      subtotal: data.subtotal,
      discounts: normalizeDiscounts(data.discounts),
      total: data.total,
      schoolSettings: data.schoolSettings,
    };
  } catch (error) {
    console.error('Failed to fetch server cart pricing:', error);
    throw error;
  }
};

export interface CartItem {
  id: string;
  enrollmentId?: number;
  classType?: string; // 'marketplace' or 'regular'
  classId: number | null; // Normalized to actual class ID (can be null for marketplace before normalization)
  marketplaceClassId?: number | null; // Marketplace class ID if applicable
  className: string;
  childId: number;
  childName: string;
  price: number;
  description?: string;
  startDate?: string;
  endDate?: string;
  schedule?: string;
  status?: string;
  statusText?: string; // Display-friendly payment status
  depositRequired?: number;
  amountPaid?: number;
  remainingBalance?: number;
  totalCost?: number;
  variantId?: string;
  variantName?: string;
}

export interface MembershipFee {
  schoolId: number;
  schoolName: string;
  amount: number; // in cents
  year: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discounts: {
    siblingDiscount: number;
    freeAfterThree: number;
    appliedDiscounts: AppliedDiscount[];
    totalDiscountAmount: number;
    discountedChildIds?: number[]; // Track which children are receiving sibling discount
    freeItemIds?: string[]; // Track which cart items are free (from "free after 3")
  };
  total: number;
  membership?: MembershipFee | null; // Optional membership fee (separate from items, not subject to class discounts)
  appliedPromoCode?: {
    code: string;
    discountId: number;
    name: string;
    type: 'percentage' | 'fixed_amount' | 'bundle';
    value: number;
    discountAmount: number;
    overridesSiblingDiscount?: boolean; // Server flag indicating promo should override sibling discount
  } | null;
  // Store school discount settings so sync calculator can access them
  schoolSettings?: {
    freeAfterThresholdEnabled: boolean;
    freeAfterThreshold: number;
    siblingDiscountRate: number;
    showSubscriptionStatus?: boolean;
  };
}

export interface AppliedDiscount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed_amount' | 'bundle'; // Include 'bundle' for bundle discounts
  value: number;
  discountAmount: number;
  priority: number;
  // Optional bundle discount metadata for UI display
  bundleRule?: {
    type: 'nth_item_free' | 'buy_x_get_y_free' | 'buy_x_get_y_percent_off';
    buyQuantity: number;
    freeQuantity?: number;
    discountPercentage?: number;
  };
  sourceType?: 'percentage' | 'fixed_amount' | 'bundle';
}

interface CartState {
  cart: Cart;
  isOpen: boolean;
  cartHydrated: boolean; // Indicates if cart has been loaded from API
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<CartItem> } }
  | { type: 'CLEAR_CART' }
  | { type: 'LOAD_EMPTY_CART' } // Clear cart but mark as hydrated from API
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'LOAD_CART'; payload: Cart }
  | { type: 'APPLY_PROMO'; payload: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number; overridesSiblingDiscount?: boolean } }
  | { type: 'REMOVE_PROMO' }
  | { type: 'SET_MEMBERSHIP'; payload: MembershipFee }
  | { type: 'REMOVE_MEMBERSHIP' };

// Function to check for applicable automatic discounts
// Fetch sibling discount settings from school admin
const fetchSiblingDiscountSettings = async (getAccessTokenSilently?: () => Promise<string>): Promise<{ rate: number; isActive: boolean }> => {
  if (!getAccessTokenSilently) {
    throw new Error('No Auth0 token function available');
  }

  const token = await getAccessTokenSilently();
  const response = await fetch('/api/school-admin/discounts', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch discount settings');
  }

  const { discounts } = await response.json();
  
  // Find active sibling discount
  const siblingDiscountSetting = discounts.find((discount: any) => 
    discount.isActive && 
    discount.siblingDiscount === true &&
    (discount.applicationMethod === 'automatic' || discount.applicationMethod === 'both')
  );

  if (!siblingDiscountSetting) {
    return { rate: 0, isActive: false };
  }

  // Convert percentage value to decimal rate (e.g., 10 -> 0.10)
  const rate = siblingDiscountSetting.type === 'percentage' 
    ? siblingDiscountSetting.value / 100 
    : 0; // For fixed amounts, we'll use 0 for now as it's complex to calculate

  return { rate, isActive: true };
};

// Fetch "Free After X" configuration and other school settings
const fetchFreeAfterThresholdSettings = async (getAccessTokenSilently?: () => Promise<string>): Promise<{ enabled: boolean; threshold: number; showSubscriptionStatus: boolean }> => {
  if (!getAccessTokenSilently) {
    return { enabled: false, threshold: 3, showSubscriptionStatus: false }; // Default fallback
  }

  try {
    const token = await getAccessTokenSilently();
    const response = await fetch('/api/school-parents/school', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('Failed to fetch school settings, using defaults');
      return { enabled: false, threshold: 3, showSubscriptionStatus: false };
    }

    const data = await response.json();
    const school = data.school;

    return {
      enabled: school?.freeAfterThresholdEnabled || false,
      threshold: school?.freeAfterThreshold || 3,
      showSubscriptionStatus: school?.showSubscriptionStatus || false
    };
  } catch (error) {
    console.error('Error fetching free after threshold settings:', error);
    return { enabled: false, threshold: 3, showSubscriptionStatus: false }; // Default fallback
  }
};

// Helper function to check if user meets role requirements for a discount
const checkRoleEligibility = (
  userRolesList: string[], 
  requiredRoles: string[] | null | undefined, 
  matchLogic: string | null | undefined
): boolean => {
  // If no required roles specified, discount is available to everyone
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  const logic = matchLogic || 'or';
  
  if (logic === 'and') {
    // User must have ALL required roles
    return requiredRoles.every(role => userRolesList.includes(role));
  } else {
    // User must have ANY of the required roles (OR logic)
    return requiredRoles.some(role => userRolesList.includes(role));
  }
};

const fetchApplicableDiscounts = async (items: CartItem[], subtotal: number, getAccessTokenSilently?: () => Promise<string>, userRoles?: string[]): Promise<AppliedDiscount[]> => {
  try {
    // Get Auth0 access token
    if (!getAccessTokenSilently) {
      console.log('No Auth0 token function available for discount check');
      return [];
    }

    let token;
    try {
      token = await getAccessTokenSilently();
    } catch (error) {
      console.log('Failed to get Auth0 access token for discount check');
      return [];
    }

    const response = await fetch('/api/school-admin/discounts', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('Failed to fetch discounts');
      return [];
    }

    const { discounts } = await response.json();
    const applicableDiscounts: AppliedDiscount[] = [];

    // Filter for active, automatic discounts that user is eligible for
    // Note: Sibling discounts are excluded here because they're handled by the manual per-child
    // calculation in calculateCartTotalsWithDiscounts to ensure correct discount application
    // (only lower-cost siblings receive the discount, not whole-order percentage)
    const activeDiscounts = discounts.filter((discount: any) => {
      // Basic filters
      if (!discount.isActive) return false;
      if (discount.applicationMethod !== 'automatic' && discount.applicationMethod !== 'both') return false;
      if (discount.siblingDiscount) return false; // Skip sibling discounts - handled separately
      if (discount.appliesToMembership) return false; // Skip membership-only discounts - they apply to membership fees, not cart items
      
      // Role eligibility check
      const userRolesList = userRoles || [];
      if (!checkRoleEligibility(userRolesList, discount.requiredRoles, discount.roleMatchLogic)) {
        console.log(`🎫 Discount "${discount.name}" skipped - user roles [${userRolesList.join(', ')}] don't match required roles [${discount.requiredRoles?.join(', ') || 'none'}]`);
        return false;
      }
      
      return true;
    });

    // Sort by priority (higher priority applies first)
    activeDiscounts.sort((a: any, b: any) => b.priority - a.priority);

    for (const discount of activeDiscounts) {
      // Check if discount conditions are met
      if (!isDiscountApplicable(discount, items, subtotal)) {
        continue;
      }

      // Calculate discount amount
      let discountAmount = 0;
      
      // Check if this is a bundle discount (has bundleRule)
      if (discount.bundleRule) {
        discountAmount = calculateBundleDiscount(items, discount.bundleRule);
        // Apply max discount limit if set
        if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
          discountAmount = discount.maxDiscountAmount;
        }
      } else if (discount.type === 'percentage') {
        discountAmount = Math.round((subtotal * discount.value) / 100);
        // Apply max discount limit if set
        if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
          discountAmount = discount.maxDiscountAmount;
        }
      } else {
        discountAmount = discount.value;
        // Apply max discount limit for fixed amounts too
        if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
          discountAmount = discount.maxDiscountAmount;
        }
      }

      // Ensure discount doesn't exceed remaining subtotal
      const currentTotal = subtotal - applicableDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
      if (discountAmount > currentTotal) {
        discountAmount = currentTotal;
      }

      if (discountAmount > 0) {
        applicableDiscounts.push({
          id: discount.id,
          name: discount.name,
          type: discount.type,
          value: discount.value,
          discountAmount,
          priority: discount.priority,
          bundleRule: discount.bundleRule || undefined, // Preserve bundle metadata for UI
          sourceType: discount.bundleRule ? 'bundle' : discount.type // Set sourceType based on bundleRule presence
        });

        // If discounts don't combine, stop after first applicable discount
        if (!discount.combinableWithOthers) {
          break;
        }
      }
    }

    return applicableDiscounts;
  } catch (error) {
    console.error('Error fetching applicable discounts:', error);
    return [];
  }
};

// Function to check if a discount is applicable to the current cart
const isDiscountApplicable = (discount: any, items: CartItem[], subtotal: number): boolean => {
  // Check minimum order amount
  if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
    return false;
  }

  // Check usage limits
  if (discount.usageLimit && discount.currentUsageCount >= discount.usageLimit) {
    return false;
  }

  // Check date validity
  const now = new Date();
  if (discount.validFrom && new Date(discount.validFrom) > now) {
    return false;
  }
  if (discount.validUntil && new Date(discount.validUntil) < now) {
    return false;
  }

  // Check category applicability
  if (discount.applicableToCategories && discount.applicableToCategories.length > 0) {
    // For now, we don't have category info in cart items, so skip this check
    // In the future, we could add category info to cart items
  }

  // Check grade level applicability
  if (discount.applicableToGradeLevels && discount.applicableToGradeLevels.length > 0) {
    // For now, we don't have grade level info in cart items, so skip this check
    // In the future, we could add grade level info to cart items
  }

  return true;
};

// Calculate bundle discount amount based on bundleRule
const calculateBundleDiscount = (
  items: CartItem[],
  bundleRule: { type: string; buyQuantity: number; freeQuantity?: number; discountPercentage?: number }
): number => {
  // Validate inputs
  if (!bundleRule || items.length === 0) {
    return 0;
  }

  // Validate buyQuantity (must be at least 1)
  if (!bundleRule.buyQuantity || bundleRule.buyQuantity < 1) {
    console.error('Invalid bundleRule: buyQuantity must be at least 1');
    return 0;
  }

  // Validate freeQuantity (must be non-negative if provided)
  if (bundleRule.freeQuantity !== undefined && bundleRule.freeQuantity < 0) {
    console.error('Invalid bundleRule: freeQuantity cannot be negative');
    return 0;
  }

  // Validate discountPercentage (must be 0-100 if provided)
  if (bundleRule.discountPercentage !== undefined && 
      (bundleRule.discountPercentage < 0 || bundleRule.discountPercentage > 100)) {
    console.error('Invalid bundleRule: discountPercentage must be between 0 and 100');
    return 0;
  }

  const itemCount = items.length;
  
  switch (bundleRule.type) {
    case 'nth_item_free': {
      // Every nth item is free (e.g., "4th class free")
      const nthItem = bundleRule.buyQuantity;
      const freeItemsCount = Math.floor(itemCount / nthItem);
      
      if (freeItemsCount === 0) return 0;
      
      // Sort items by price (ascending) and make the cheapest items free
      const sortedItems = [...items].sort((a, b) => a.price - b.price);
      const discountAmount = sortedItems
        .slice(0, freeItemsCount)
        .reduce((sum, item) => sum + item.price, 0);
      
      // Round to nearest cent
      return Math.round(discountAmount);
    }
    
    case 'buy_x_get_y_free': {
      // Buy X items, get Y free
      const buyQty = bundleRule.buyQuantity;
      const freeQty = bundleRule.freeQuantity || 0;
      
      if (freeQty === 0) return 0;
      
      const setSize = buyQty + freeQty;
      const completeSets = Math.floor(itemCount / setSize);
      
      if (completeSets === 0) return 0;
      
      // For each complete set, the cheapest Y items are free
      const sortedItems = [...items].sort((a, b) => a.price - b.price);
      const freeItemsCount = completeSets * freeQty;
      const discountAmount = sortedItems
        .slice(0, freeItemsCount)
        .reduce((sum, item) => sum + item.price, 0);
      
      // Round to nearest cent
      return Math.round(discountAmount);
    }
    
    case 'buy_x_get_y_percent_off': {
      // Buy X items, get Y% off on Y items
      const buyQty = bundleRule.buyQuantity;
      const discountQty = bundleRule.freeQuantity || 0;
      const percentOff = bundleRule.discountPercentage || 0;
      
      if (discountQty === 0 || percentOff === 0) return 0;
      
      const setSize = buyQty + discountQty;
      const completeSets = Math.floor(itemCount / setSize);
      
      if (completeSets === 0) return 0;
      
      // For each complete set, apply percentage discount to cheapest Y items
      const sortedItems = [...items].sort((a, b) => a.price - b.price);
      const discountedItemsCount = completeSets * discountQty;
      const discountAmount = sortedItems
        .slice(0, discountedItemsCount)
        .reduce((sum, item) => sum + (item.price * (percentOff / 100)), 0);
      
      // Round to nearest cent
      return Math.round(discountAmount);
    }
    
    default:
      console.error(`Unknown bundleRule type: ${bundleRule.type}`);
      return 0;
  }
};

// Keep the synchronous version for immediate calculations
const calculateCartTotalsSync = (
  items: CartItem[],
  appliedPromo?: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number; overridesSiblingDiscount?: boolean } | null,
  schoolSettings?: { freeAfterThresholdEnabled: boolean; freeAfterThreshold: number; siblingDiscountRate: number; showSubscriptionStatus?: boolean }
): { subtotal: number; discounts: any; total: number; schoolSettings?: typeof schoolSettings } => {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Group items by child to calculate sibling discount
  const childrenWithClasses = items.reduce((acc, item) => {
    acc[item.childId] = (acc[item.childId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const uniqueChildren = Object.keys(childrenWithClasses).length;

  // Use school settings if available, otherwise use safe defaults (feature disabled)
  const freeAfterThreeEnabled = schoolSettings?.freeAfterThresholdEnabled || false;
  const freeAfterThreshold = schoolSettings?.freeAfterThreshold || 3;
  const siblingDiscountRate = schoolSettings?.siblingDiscountRate || 0;
  
  // Apply "Free After Threshold" - Makes cheapest enrollments free based on child count
  // Formula: freeCount = max(0, childrenCount - threshold)
  let freeAfterThreeDiscount = 0;
  let freeItemIds: string[] = [];
  
  // Apply sibling discount: 10% off for children with lower total enrollment costs
  let siblingDiscount = 0;
  let discountedChildIds: number[] = [];
  
  if (freeAfterThreeEnabled && uniqueChildren > freeAfterThreshold) {
    const freeEnrollmentCount = uniqueChildren - freeAfterThreshold;
    
    // Sort all items by price (ascending) and make cheapest items free
    const sortedItems = [...items].sort((a, b) => a.price - b.price);
    const freeItems = sortedItems.slice(0, freeEnrollmentCount);
    
    freeAfterThreeDiscount = freeItems.reduce((sum, item) => sum + item.price, 0);
    freeItemIds = freeItems.map(item => item.id);
    
    // When "free after threshold" applies, remove other discounts to prevent double-dipping
    // (sibling discounts are zeroed below in this case)
  }
  
  // Only apply sibling discount if "free after threshold" is NOT active
  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    if (uniqueChildren > 1 && siblingDiscountRate > 0) {
      // Calculate total cost per child
      const childTotals = items.reduce((acc, item) => {
        acc[item.childId] = (acc[item.childId] || 0) + item.price;
        return acc;
      }, {} as Record<number, number>);
      
      // Sort children by total cost (highest to lowest) - most expensive child pays full price
      const childrenByTotalCost = Object.entries(childTotals)
        .sort(([, totalA], [, totalB]) => totalB - totalA)
        .map(([childId]) => Number(childId));
      
      // Get children who receive discount (all except highest-cost child)
      const discountedChildrenIds = childrenByTotalCost.slice(1);
      discountedChildIds = discountedChildrenIds;
      
      // Apply discount to LOWEST-PRICE enrollment per child (not all enrollments)
      siblingDiscount = discountedChildrenIds.reduce((sum, childId) => {
        // Find all items for this child
        const childItems = items.filter(item => item.childId === childId);
        
        // Find the lowest-priced item for this child
        if (childItems.length > 0) {
          const lowestPriceItem = childItems.reduce((lowest, item) => 
            item.price < lowest.price ? item : lowest
          );
          
          return sum + (lowestPriceItem.price * siblingDiscountRate);
        }
        
        return sum;
      }, 0);
    }
  }

  // Apply promo code discount ONLY if "free after threshold" is NOT active (prevent double-dipping)
  const allDiscounts: AppliedDiscount[] = [];
  let promoDiscount = 0;
  
  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    // Only add promo code if "free after threshold" is NOT active
    if (appliedPromo) {
      allDiscounts.push({
        id: appliedPromo.discountId,
        name: appliedPromo.name,
        type: appliedPromo.type === 'bundle' ? 'fixed_amount' : appliedPromo.type,
        value: appliedPromo.value,
        discountAmount: appliedPromo.discountAmount,
        priority: 999,
        sourceType: appliedPromo.type,
        bundleRule: undefined
      });
      promoDiscount = appliedPromo.discountAmount;
      
      // Only zero out sibling discount if server says promo overrides it
      // This respects combinable promos that should stack with sibling discount
      if (appliedPromo.overridesSiblingDiscount) {
        siblingDiscount = 0;
        discountedChildIds = [];
      }
    }
  }
  
  const totalDiscountAmount = siblingDiscount + freeAfterThreeDiscount + promoDiscount;
  const total = Math.max(0, subtotal - totalDiscountAmount);

  return {
    subtotal,
    discounts: {
      siblingDiscount,
      freeAfterThree: freeAfterThreeDiscount,
      appliedDiscounts: allDiscounts,
      totalDiscountAmount,
      discountedChildIds,
      freeItemIds,
    },
    total,
    schoolSettings, // Return schoolSettings so reducer can preserve them
  };
};

// Async version that includes automatic discounts
const calculateCartTotalsWithDiscounts = async (
  items: CartItem[],
  getAccessTokenSilently?: () => Promise<string>,
  appliedPromo?: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number } | null,
  userRoles?: string[]
): Promise<{ subtotal: number; discounts: any; total: number; schoolSettings?: { freeAfterThresholdEnabled: boolean; freeAfterThreshold: number; siblingDiscountRate: number; showSubscriptionStatus?: boolean } }> => {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Group items by child to calculate sibling discount
  const childrenWithClasses = items.reduce((acc, item) => {
    acc[item.childId] = (acc[item.childId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const uniqueChildren = Object.keys(childrenWithClasses).length;

  // Fetch "Free After Threshold" configuration and other school settings
  let freeAfterThreeEnabled = false;
  let freeAfterThreshold = 3;
  let showSubscriptionStatus = false;
  try {
    const freeAfterSettings = await fetchFreeAfterThresholdSettings(getAccessTokenSilently);
    freeAfterThreeEnabled = freeAfterSettings.enabled;
    freeAfterThreshold = freeAfterSettings.threshold;
    showSubscriptionStatus = freeAfterSettings.showSubscriptionStatus;
  } catch (error) {
    console.log('Failed to fetch free after threshold settings, using defaults (disabled)');
    freeAfterThreeEnabled = false;
    freeAfterThreshold = 3;
    showSubscriptionStatus = false;
  }

  // Apply "Free After Threshold" - Makes cheapest enrollments free based on child count
  // Formula: freeCount = max(0, childrenCount - threshold)
  let freeAfterThreeDiscount = 0;
  let freeItemIds: string[] = [];
  
  if (freeAfterThreeEnabled && uniqueChildren > freeAfterThreshold) {
    const freeEnrollmentCount = uniqueChildren - freeAfterThreshold;
    
    // Sort all items by price (ascending) and make cheapest items free
    const sortedItems = [...items].sort((a, b) => a.price - b.price);
    const freeItems = sortedItems.slice(0, freeEnrollmentCount);
    
    freeAfterThreeDiscount = freeItems.reduce((sum, item) => sum + item.price, 0);
    freeItemIds = freeItems.map(item => item.id);
  }

  // Get sibling discount rate from school admin settings
  // Only apply if "free after threshold" is NOT active
  let siblingDiscountRate = 0;
  let siblingDiscount = 0;
  let discountedChildIds: number[] = [];
  
  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    if (uniqueChildren > 1) {
      try {
        // Fetch active sibling discount from school admin settings
        const siblingDiscountSettings = await fetchSiblingDiscountSettings(getAccessTokenSilently);
        siblingDiscountRate = siblingDiscountSettings.rate;
        
        if (siblingDiscountRate > 0) {
          // Apply sibling discount: 10% off for children with lower total enrollment costs
          // Calculate total cost per child
          const childTotals = items.reduce((acc, item) => {
            acc[item.childId] = (acc[item.childId] || 0) + item.price;
            return acc;
          }, {} as Record<number, number>);
          
          // Sort children by total cost (highest to lowest) - most expensive child pays full price
          const childrenByTotalCost = Object.entries(childTotals)
            .sort(([, totalA], [, totalB]) => totalB - totalA)
            .map(([childId]) => Number(childId));
          
          // Get children who receive discount (all except highest-cost child)
          const discountedChildrenIds = childrenByTotalCost.slice(1);
          discountedChildIds = discountedChildrenIds;
          
          // Apply discount to LOWEST-PRICE enrollment per child (not all enrollments)
          siblingDiscount = discountedChildrenIds.reduce((sum, childId) => {
            // Find all items for this child
            const childItems = items.filter(item => item.childId === childId);
            
            // Find the lowest-priced item for this child
            if (childItems.length > 0) {
              const lowestPriceItem = childItems.reduce((lowest, item) => 
                item.price < lowest.price ? item : lowest
              );
              
              return sum + (lowestPriceItem.price * siblingDiscountRate);
            }
            
            return sum;
          }, 0);
        }
      } catch (error) {
        console.log('Failed to fetch sibling discount settings, using default 0%');
        siblingDiscountRate = 0;
        siblingDiscount = 0;
        discountedChildIds = [];
      }
    }
  }

  // Get applicable automatic discounts (skip if "free after threshold" is active to prevent double-dipping)
  let autoDiscounts: AppliedDiscount[] = [];
  let allDiscounts: AppliedDiscount[] = [];
  
  if (!freeAfterThreeEnabled || uniqueChildren <= freeAfterThreshold) {
    // Only fetch automatic discounts if "free after threshold" is NOT active
    autoDiscounts = await fetchApplicableDiscounts(items, subtotal, getAccessTokenSilently, userRoles);
    allDiscounts = [...autoDiscounts];
    
    // Add promo code discount if present
    if (appliedPromo) {
      allDiscounts.push({
        id: appliedPromo.discountId,
        name: appliedPromo.name,
        type: appliedPromo.type === 'bundle' ? 'fixed_amount' : appliedPromo.type,
        value: appliedPromo.value,
        discountAmount: appliedPromo.discountAmount,
        priority: 999,
        sourceType: appliedPromo.type,
        bundleRule: undefined
      });
    }
  }
  
  // Calculate total discount amount
  const autoAndPromoDiscountAmount = allDiscounts.reduce((sum, discount) => sum + discount.discountAmount, 0);
  const totalDiscountAmount = siblingDiscount + freeAfterThreeDiscount + autoAndPromoDiscountAmount;

  const total = Math.max(0, subtotal - totalDiscountAmount);

  return {
    subtotal,
    discounts: {
      siblingDiscount,
      freeAfterThree: freeAfterThreeDiscount,
      appliedDiscounts: allDiscounts,
      totalDiscountAmount,
      discountedChildIds,
      freeItemIds, // Add freeItemIds to return payload for UI display
    },
    total,
    // Return school settings so they can be stored in cart state for sync calculator
    schoolSettings: {
      freeAfterThresholdEnabled: freeAfterThreeEnabled,
      freeAfterThreshold: freeAfterThreshold,
      siblingDiscountRate: siblingDiscountRate,
      showSubscriptionStatus: showSubscriptionStatus,
    },
  };
};

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD_ITEM': {
      // Check if item already exists (same class + child combination)
      const existingItemIndex = state.cart.items.findIndex(
        item => item.classId === action.payload.classId && item.childId === action.payload.childId
      );

      console.log('🛒 ADD_ITEM reducer - current state:', {
        currentItems: state.cart.items.length,
        addingItem: action.payload.className,
        existingItemIndex
      });

      if (existingItemIndex >= 0) {
        // Item already exists, don't add duplicate
        console.log('🛒 ADD_ITEM reducer - item already exists, not adding');
        return state;
      }

      const newItems = [...state.cart.items, action.payload];
      const totals = calculateCartTotalsSync(newItems, state.cart.appliedPromoCode, state.cart.schoolSettings);

      const newState = {
        ...state,
        cart: {
          items: newItems,
          ...totals,
          appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code
          schoolSettings: totals.schoolSettings, // Preserve schoolSettings
        },
      };

      console.log('🛒 ADD_ITEM reducer - state updated:', {
        oldCount: state.cart.items.length,
        newCount: newItems.length,
        newTotal: totals.total
      });

      return newState;
    }

    case 'REMOVE_ITEM': {
      const newItems = state.cart.items.filter(item => item.id !== action.payload);
      const totals = calculateCartTotalsSync(newItems, state.cart.appliedPromoCode, state.cart.schoolSettings);

      return {
        ...state,
        cart: {
          items: newItems,
          ...totals,
          appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code
          schoolSettings: totals.schoolSettings, // Preserve schoolSettings
        },
      };
    }

    case 'UPDATE_ITEM': {
      const newItems = state.cart.items.map(item =>
        item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
      );
      const totals = calculateCartTotalsSync(newItems, state.cart.appliedPromoCode, state.cart.schoolSettings);

      return {
        ...state,
        cart: {
          items: newItems,
          ...totals,
          appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code
          schoolSettings: totals.schoolSettings, // Preserve schoolSettings
        },
      };
    }

    case 'CLEAR_CART':
      return {
        ...state,
        cart: {
          items: [],
          subtotal: 0,
          discounts: { 
            siblingDiscount: 0, 
            freeAfterThree: 0,
            appliedDiscounts: [],
            totalDiscountAmount: 0
          },
          total: 0,
          membership: null,
          appliedPromoCode: null,
        },
      };

    case 'LOAD_EMPTY_CART':
      // Clear cart but mark as hydrated from API (for when API returns no enrollments)
      return {
        ...state,
        cart: {
          items: [],
          subtotal: 0,
          discounts: { 
            siblingDiscount: 0, 
            freeAfterThree: 0,
            appliedDiscounts: [],
            totalDiscountAmount: 0
          },
          total: 0,
          membership: null,
          appliedPromoCode: null,
        },
        cartHydrated: true,
      };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    case 'LOAD_CART':
      return {
        ...state,
        cart: action.payload,
        cartHydrated: true, // Mark cart as hydrated from API
      };

    case 'APPLY_PROMO': {
      const newCart = {
        ...state.cart,
        appliedPromoCode: action.payload,
      };
      // Recalculate totals with promo code
      const totals = calculateCartTotalsSync(newCart.items, newCart.appliedPromoCode, state.cart.schoolSettings);
      return {
        ...state,
        cart: {
          ...newCart,
          ...totals,
          schoolSettings: totals.schoolSettings, // Preserve schoolSettings
        },
      };
    }

    case 'REMOVE_PROMO': {
      const newCart = {
        ...state.cart,
        appliedPromoCode: null,
      };
      // Recalculate totals without promo code
      const totals = calculateCartTotalsSync(newCart.items, newCart.appliedPromoCode, state.cart.schoolSettings);
      return {
        ...state,
        cart: {
          ...newCart,
          ...totals,
          schoolSettings: totals.schoolSettings, // Preserve schoolSettings
        },
      };
    }

    case 'SET_MEMBERSHIP': {
      // Store membership fee separately from items (not subject to discounts)
      // IMPORTANT: Do NOT add membership to cart.total here
      // Other reducer actions recalculate total without membership, which would cause it to be lost
      // Instead, membership is added to the payable amount in CartDrawer, CartCheckout, etc.
      return {
        ...state,
        cart: {
          ...state.cart,
          membership: action.payload,
        },
      };
    }

    case 'REMOVE_MEMBERSHIP': {
      // Remove membership fee from cart
      // Do NOT modify cart.total - it stays as the class enrollment total
      // Membership is tracked separately
      return {
        ...state,
        cart: {
          ...state.cart,
          membership: null,
        },
      };
    }

    default:
      return state;
  }
};

const initialState: CartState = {
  cart: {
    items: [],
    subtotal: 0,
    discounts: { 
      siblingDiscount: 0, 
      freeAfterThree: 0, 
      appliedDiscounts: [],
      totalDiscountAmount: 0
    },
    total: 0,
    appliedPromoCode: null,
  },
  isOpen: false,
  cartHydrated: false,
};

interface CartContextType {
  cart: Cart;
  isOpen: boolean;
  cartHydrated: boolean;
  cartLoading: boolean; // Indicates if cart query is actively fetching/refetching
  addItem: (item: Omit<CartItem, 'id'>, skipValidation?: boolean) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CartItem>) => void;
  clearCart: (skipCancellation?: boolean) => Promise<void>;
  forceRefreshCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getItemCount: () => number;
  hasItem: (classId: number, childId: number) => boolean;
  refreshCart: () => Promise<void>;
  refreshDiscounts: () => Promise<void>;
  applyPromoCode: (code: string) => Promise<{ success: boolean; error?: string; discount?: any }>;
  removePromoCode: () => void;
  setMembership: (membership: MembershipFee) => void;
  removeMembership: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { toast } = useToast();
  const { user, isAuthenticated, session, isLoading } = useAuth(); // Using Supabase hooks
  const { activeRole, availableRoles } = useRole(); // Get active role and all user roles
  
  // Get list of role names for discount eligibility checking
  const userRolesList = availableRoles?.map(r => r.role) || [];
  
  // Helper function to get access token from Supabase session
  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!session?.access_token) {
      // Try to get from localStorage as fallback
      const storedToken = localStorage.getItem('supabase_token');
      if (storedToken) {
        return storedToken;
      }
      throw new Error('No access token available');
    }
    return session.access_token;
  }, [session]);

  // Helper function to fetch membership requirements during cart hydration
  // Returns membership data if user should have membership added, null otherwise
  // Uses timeout to prevent blocking checkout flow
  const fetchMembershipForCart = useCallback(async (userEmail: string): Promise<MembershipFee | null> => {
    const TIMEOUT_MS = 3000; // 3 second timeout to prevent blocking
    
    const fetchWithTimeout = async (): Promise<MembershipFee | null> => {
      try {
        const token = await getAccessToken();
        
        // Fetch both school data and member status in parallel
        const [schoolResponse, memberResponse] = await Promise.all([
          fetch(`/api/school-parents/school/${userEmail}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          fetch('/api/parent/member-id', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
        ]);
        
        // Check if user already has active membership
        if (memberResponse.ok) {
          const memberData = await memberResponse.json();
          if (memberData.memberId || memberData.hasMembership) {
            console.log('🎫 User already has active membership, skipping auto-add');
            return null;
          }
        }
        
        // Check if school has membership fee configured
        if (schoolResponse.ok) {
          const schoolResult = await schoolResponse.json();
          if (schoolResult.success && schoolResult.school && schoolResult.school.membershipFeeAmount > 0) {
            console.log('🎫 CartContext: Adding membership during hydration:', {
              schoolId: schoolResult.school.id,
              schoolName: schoolResult.school.name,
              amount: schoolResult.school.membershipFeeAmount,
            });
            
            return {
              schoolId: schoolResult.school.id,
              schoolName: schoolResult.school.name,
              amount: schoolResult.school.membershipFeeAmount,
              year: new Date().getFullYear(),
            };
          }
        }
        
        return null;
      } catch (error) {
        console.warn('🎫 Error fetching membership data (non-blocking):', error);
        return null;
      }
    };
    
    // Race between fetch and timeout - never block cart hydration
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn('🎫 Membership fetch timed out after', TIMEOUT_MS, 'ms');
        resolve(null);
      }, TIMEOUT_MS);
    });
    
    return Promise.race([fetchWithTimeout(), timeoutPromise]);
  }, [getAccessToken]);

  // Use TanStack Query to fetch enrollments with proper caching
  // This prevents duplicate API calls during component remounts
  // CRITICAL: Gate on activeRole === 'parent' to prevent fetch before role resolution
  // NOTE: Query key matches ParentDashboard to share cache and prevent duplicate API calls
  const { data: enrollmentsData, refetch: refetchEnrollments, isFetching } = useQuery({
    queryKey: ['/api/parent/enrollments'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch('/api/parent/enrollments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed');
        }
        throw new Error(`Failed to fetch enrollments: ${response.status}`);
      }

      const enrollments = await response.json();
      return enrollments;
    },
    enabled: !!user?.email && isAuthenticated && !isLoading && activeRole === 'parent',
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchOnMount: false, // CRITICAL: Don't refetch on component remount
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
  });

  // Track last processed enrollments to prevent infinite loops
  const lastProcessedEnrollmentsRef = useRef<string>('');
  const processingRef = useRef<boolean>(false);
  const initialMembershipLoadedRef = useRef<boolean>(false); // Track if we've done initial membership load

  // Process enrollments data when it changes
  const processEnrollmentsData = useCallback(async (enrollments: any[]) => {
    if (!user?.email || !enrollments) {
      return;
    }

    // Prevent concurrent processing
    if (processingRef.current) {
      console.log('🛒 Skipping processEnrollmentsData - already processing');
      return;
    }

    // Create a stable hash of enrollment IDs and statuses to detect actual changes
    const enrollmentHash = enrollments
      .map(e => `${e.id}:${e.status}:${e.remainingBalance}`)
      .sort()
      .join('|');

    // Skip if we've already processed this exact data AND we've done initial membership load
    // On first load, we always need to run to fetch membership even if enrollments are empty
    if (lastProcessedEnrollmentsRef.current === enrollmentHash && initialMembershipLoadedRef.current) {
      console.log('🛒 Skipping processEnrollmentsData - data unchanged and membership already loaded');
      return;
    }

    processingRef.current = true;

    try {
      // Group enrollments by class+child combination to find the latest status
      const enrollmentGroups = enrollments.reduce((acc: any, enrollment: any) => {
        // Prioritize marketplaceClassId for marketplace enrollments, fallback to classId/programId
        const classId = enrollment.marketplaceClassId || enrollment.classId || enrollment.programId;
        const key = `${classId}-${enrollment.childId}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(enrollment);
        return acc;
      }, {});

      // Filter for enrollments with remaining balance that aren't superseded by successful enrollments
      const unpaidEnrollments = [];

      for (const [key, groupEnrollments] of Object.entries(enrollmentGroups)) {
        const enrollmentList = groupEnrollments as any[];

        // Sort by enrollment date (newest first)
        const sortedEnrollments = enrollmentList.sort((a, b) => 
          new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime()
        );

        // Find the latest enrollment and check if it has a balance due
        const latestEnrollment = sortedEnrollments[0];
        const hasBalance = latestEnrollment.remainingBalance > 0 && 
                          latestEnrollment.paymentSystemVersion === 'v2_stripe';
        
        // Check if there's a fully paid enrollment (enrolled with no balance)
        const hasFullyPaidEnrollment = sortedEnrollments.some(e => 
          (e.status === 'enrolled' && (e.remainingBalance === 0 || e.remainingBalance === null)) ||
          (e.paymentStatus === 'completed' && (e.remainingBalance === 0 || e.remainingBalance === null))
        );

        // Check if latest enrollment is fully paid
        const latestIsPaid = (latestEnrollment.status === 'enrolled' && (latestEnrollment.remainingBalance === 0 || latestEnrollment.remainingBalance === null)) ||
                           (latestEnrollment.paymentStatus === 'completed' && (latestEnrollment.remainingBalance === 0 || latestEnrollment.remainingBalance === null));

        // Skip items where there's a fully paid enrollment OR latest enrollment is paid OR on waitlist
        const isWaitlisted = latestEnrollment.status === 'waitlist';
        const shouldSkip = hasFullyPaidEnrollment || latestIsPaid || isWaitlisted;

        if (!isWaitlisted && !shouldSkip && (hasBalance || (latestEnrollment.status === 'pending_payment' && latestEnrollment.remainingBalance > 0))) {
          unpaidEnrollments.push(latestEnrollment);
        }
      }

      // Convert enrollments to cart items with enhanced status display
      const cartItems: CartItem[] = unpaidEnrollments.map((enrollment: any) => {
        // CRITICAL: All monetary values MUST be in cents per schema.ts
        // If seeing incorrect calculations, check database data integrity
        const remainingBalance = enrollment.remainingBalance || enrollment.totalCost || 0;
        const amountPaid = enrollment.amountPaid || 0;
        
        // Debug logging for troubleshooting cart calculation issues
        if (enrollment.id) {
          console.log(`📊 Cart Item #${enrollment.id}: remainingBalance=${remainingBalance} cents ($${(remainingBalance/100).toFixed(2)}), totalCost=${enrollment.totalCost} cents`);
        }

        let displayStatus = enrollment.status;
        let statusText = 'Payment Required';

        // Determine appropriate status text based on payment state
        if (enrollment.status === 'partially_paid') {
          statusText = 'Partially Paid';
        } else if (enrollment.paymentSystemVersion === 'v2_stripe' && remainingBalance > 0) {
          statusText = 'Balance Due';
        } else if (enrollment.paymentSystemVersion === 'v2_stripe') {
          statusText = 'Stripe Managed';
        }

        return {
          id: `enrollment-${enrollment.id}`,
          enrollmentId: enrollment.id,
          classType: enrollment.classType || 'regular', // Include class type
          classId: enrollment.marketplaceClassId || enrollment.classId, // Normalize to actual class ID
          marketplaceClassId: enrollment.marketplaceClassId || null, // Include marketplace ID
          className: enrollment.className,
          childId: enrollment.childId,
          childName: enrollment.childName,
          price: remainingBalance,
          status: displayStatus,
          statusText: statusText,
          depositRequired: enrollment.depositRequired || 0,
          amountPaid: amountPaid,
          remainingBalance: remainingBalance,
          totalCost: enrollment.totalCost || 0,
          variantId: enrollment.variantId,
          variantName: enrollment.variantName,
        };
      });

      // Helper to safely calculate basic subtotal from items
      const calculateBasicSubtotal = (items: CartItem[]): number => {
        return items.reduce((sum, item) => {
          const price = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0;
          return sum + price;
        }, 0);
      };

      // Helper to validate and build a safe cart payload
      const buildValidatedCartPayload = (
        items: CartItem[],
        rawSubtotal: number,
        rawTotal: number,
        rawDiscounts: Cart['discounts'],
        rawMembership: MembershipFee | null,
        rawSchoolSettings: Cart['schoolSettings'] | undefined
      ): Cart => {
        // Validate numeric fields with Number.isFinite (stricter than !isNaN)
        const safeSubtotal = Number.isFinite(rawSubtotal) ? rawSubtotal : calculateBasicSubtotal(items);
        const safeTotal = Number.isFinite(rawTotal) ? rawTotal : safeSubtotal;
        // Re-normalize discounts to ensure all nested fields are valid
        const safeDiscounts = normalizeDiscounts(rawDiscounts);
        
        return {
          items: items,
          subtotal: safeSubtotal,
          discounts: safeDiscounts,
          total: safeTotal,
          membership: rawMembership,
          appliedPromoCode: null,
          schoolSettings: rawSchoolSettings,
        };
      };

      // Use server-authoritative pricing from /api/cart/calculate
      // This is the SINGLE SOURCE OF TRUTH, preventing client-server price mismatches
      let subtotal = 0;
      let total = 0;
      let discounts: Cart['discounts'] = buildDefaultDiscounts();
      let schoolSettings: Cart['schoolSettings'] | undefined = undefined;
      
      try {
        const serverPricing = await fetchServerCartPricing(cartItems, getAccessToken, null);
        subtotal = serverPricing.subtotal;
        total = serverPricing.total;
        discounts = serverPricing.discounts;
        schoolSettings = serverPricing.schoolSettings;
      } catch (totalsError) {
        console.warn('🛒 Error fetching server cart pricing, using client calculation fallback:', totalsError);
        // Fallback to client-side calculation if server is unavailable
        try {
          const fallbackTotals = await calculateCartTotalsWithDiscounts(cartItems, getAccessToken, null, userRolesList);
          subtotal = typeof fallbackTotals.subtotal === 'number' ? fallbackTotals.subtotal : 0;
          total = typeof fallbackTotals.total === 'number' ? fallbackTotals.total : subtotal;
          discounts = normalizeDiscounts(fallbackTotals.discounts);
          schoolSettings = fallbackTotals.schoolSettings;
        } catch (fallbackError) {
          console.warn('🛒 Client-side fallback also failed, using basic totals:', fallbackError);
          subtotal = calculateBasicSubtotal(cartItems);
          total = subtotal;
          discounts = buildDefaultDiscounts();
          schoolSettings = undefined;
        }
      }

      // Fetch membership data during cart hydration (non-blocking with timeout)
      // This ensures membership is available when cart first renders
      const membership = await fetchMembershipForCart(user.email);

      // CRITICAL: Always replace cart with API data (no localStorage merge)
      // This ensures API is the single source of truth and prevents stale data conflicts
      if (cartItems.length > 0 || membership) {
        // Build validated cart payload - all fields are sanitized before dispatch/storage
        const cartPayload = buildValidatedCartPayload(
          cartItems,
          subtotal,
          total,
          discounts,
          membership,
          schoolSettings
        );
        
        // API returned enrollments or user needs membership - replace cart state entirely
        dispatch({
          type: 'LOAD_CART',
          payload: cartPayload,
        });
        
        // Save to localStorage AFTER validation for offline resilience
        const cartKey = getCartStorageKey(user.email);
        localStorage.setItem(cartKey, JSON.stringify(cartPayload));
      } else {
        // API returned no enrollments and no membership needed - clear cart but mark as hydrated
        // This prevents checkout page from spinning forever waiting for hydration
        dispatch({ type: 'LOAD_EMPTY_CART' });
        const cartKey = getCartStorageKey(user.email);
        localStorage.removeItem(cartKey);
      }

      // Update hash to mark this data as processed
      lastProcessedEnrollmentsRef.current = enrollmentHash;
      // Mark that we've done initial membership load (even on error paths - prevents retry loop)
      initialMembershipLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading unpaid enrollments:', error);
      // Mark initial load as complete even on error to prevent retry loops
      initialMembershipLoadedRef.current = true;
    } finally {
      processingRef.current = false;
    }
  }, [user?.email, getAccessToken, userRolesList, fetchMembershipForCart]);

  // Process enrollments data when query result changes
  useEffect(() => {
    if (enrollmentsData) {
      processEnrollmentsData(enrollmentsData);
    }
  }, [enrollmentsData, processEnrollmentsData]);

  // Manual refresh function for external use - uses query invalidation
  // Returns a promise that resolves when refetch completes
  const refreshCart = useCallback(async () => {
    if (user?.email && isAuthenticated && activeRole === 'parent') {
      console.log('🛒 refreshCart called - awaiting refetch');
      await refetchEnrollments();
      console.log('🛒 refreshCart complete - cart data updated');
    }
  }, [user?.email, isAuthenticated, activeRole, refetchEnrollments]);

  // Function to refresh discounts for the current cart using server-authoritative pricing
  const refreshDiscounts = useCallback(async () => {
    if (state.cart.items.length === 0) {
      return;
    }

    try {
      // Use server-authoritative pricing to prevent client-server mismatches
      const serverPricing = await fetchServerCartPricing(
        state.cart.items, 
        getAccessToken,
        state.cart.appliedPromoCode?.code || null
      );
      dispatch({
        type: 'LOAD_CART',
        payload: {
          items: state.cart.items,
          ...serverPricing,
          appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code
        },
      });
    } catch (error) {
      console.error('Error refreshing discounts from server:', error);
      // Fallback to client-side calculation if server fails
      try {
        const fallbackTotals = await calculateCartTotalsWithDiscounts(
          state.cart.items, 
          getAccessToken,
          state.cart.appliedPromoCode,
          userRolesList
        );
        dispatch({
          type: 'LOAD_CART',
          payload: {
            items: state.cart.items,
            ...fallbackTotals,
            appliedPromoCode: state.cart.appliedPromoCode,
          },
        });
      } catch (fallbackError) {
        console.error('Client-side fallback also failed:', fallbackError);
      }
    }
  }, [state.cart.items, state.cart.appliedPromoCode, getAccessToken, userRolesList]);

  // Load cart from localStorage on mount (ONLY for non-authenticated users or non-parent roles)
  useEffect(() => {
    // CRITICAL: Skip localStorage loading for authenticated parents
    // They will get cart data from API via TanStack Query
    if (user?.email && isAuthenticated && activeRole === 'parent') {
      console.log('🛒 Skipping localStorage load for authenticated parent - waiting for API data');
      return;
    }

    // Use user-specific storage key to prevent cross-account data leakage
    const cartKey = getCartStorageKey(user?.email);
    const savedCart = localStorage.getItem(cartKey);
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        console.log('🛒 Loading cart from localStorage for user:', user?.email || 'guest');
        dispatch({ type: 'LOAD_CART', payload: parsedCart });
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem(cartKey);
      }
    }
  }, [user?.email, isAuthenticated, activeRole]);

  // Clear cart on logout
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAuthenticated === false && user === null) {
      // SECURITY: Clear cart when user is not authenticated to prevent cross-account enrollment risks
      dispatch({ type: 'CLEAR_CART' });
      // Reset membership tracking for next login
      initialMembershipLoadedRef.current = false;
      lastProcessedEnrollmentsRef.current = '';
      // Also clear the query cache for enrollments
      queryClient.setQueryData(['/api/parent/enrollments', null], []);
    }
  }, [isAuthenticated, user, isLoading]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    // Use user-specific storage key to prevent cross-account data leakage
    const cartKey = getCartStorageKey(user?.email);
    
    // Don't save empty cart if localStorage has items (prevents overriding valid cart during navigation)
    const existingCart = localStorage.getItem(cartKey);
    if (existingCart && state.cart.items.length === 0) {
      try {
        const parsedExisting = JSON.parse(existingCart);
        if (parsedExisting.items && parsedExisting.items.length > 0) {
          return;
        }
      } catch (error) {
        // Proceed with save if we can't parse existing cart
      }
    }

    localStorage.setItem(cartKey, JSON.stringify(state.cart));
  }, [state.cart, user?.email]);

  const addItem = async (item: Omit<CartItem, 'id'>, skipValidation = false) => {
    const newItem: CartItem = {
      ...item,
      id: `${item.classId}-${item.childId}-${Date.now()}`,
    };

    console.log('🛒 addItem called with:', { 
      item: newItem, 
      skipValidation, 
      currentCartSize: state.cart.items.length 
    });

    if (!skipValidation) {
      // Check if item already exists in cart
      const existsInCart = state.cart.items.some(
        cartItem => cartItem.classId === item.classId && cartItem.childId === item.childId
      );

      if (existsInCart) {
        console.log('🛒 Item already exists in cart, not adding');
        toast({
          title: "Already in Cart",
          description: `${item.className} for ${item.childName} is already in your cart`,
          variant: "destructive",
        });
        return;
      }

      // Check if user is already enrolled in this class with a completed payment
      try {
        const response = await apiRequest('GET', '/api/parent/enrollments');
        if (response.ok) {
          const enrollments = await response.json();

          // Check for any successful enrollment (enrolled status with no remaining balance)
          const hasSuccessfulEnrollment = enrollments.some((enrollment: any) => 
            enrollment.classId === item.classId && 
            enrollment.childId === item.childId &&
            enrollment.status === 'enrolled' &&
            enrollment.remainingBalance === 0
          );

          if (hasSuccessfulEnrollment) {
            console.log('🛒 User already successfully enrolled, not adding to cart');
            toast({
              title: "Already Enrolled",
              description: `${item.childName} is already enrolled in ${item.className}`,
              variant: "destructive",
            });
            return;
          }
        }
      } catch (error) {
        console.log('Could not check enrollment status, proceeding with cart add');
      }
    }

    console.log('🛒 Dispatching ADD_ITEM action:', newItem);
    dispatch({ type: 'ADD_ITEM', payload: newItem });

    // Track add to cart event for GA4
    trackAddToCart({
      item_id: String(item.classId),
      item_name: item.className,
      price: item.price,
      quantity: 1,
      item_category: 'Class',
      item_variant: item.childName,
    });

    console.log('🛒 Cart will update via reducer and useEffect');

    // Only show toast if not skipping validation (to avoid duplicate toasts)
    if (!skipValidation) {
      toast({
        title: "Added to Cart",
        description: `${item.className} for ${item.childName} added to cart`,
      });
    }
  };

  const removeItem = (id: string) => {
    // Find item before removing for tracking
    const itemToRemove = state.cart.items.find(item => item.id === id);
    
    dispatch({ type: 'REMOVE_ITEM', payload: id });
    
    // Track remove from cart event for GA4
    if (itemToRemove) {
      trackRemoveFromCart({
        item_id: String(itemToRemove.classId),
        item_name: itemToRemove.className,
        price: itemToRemove.price,
        quantity: 1,
        item_category: 'Class',
        item_variant: itemToRemove.childName,
      });
    }
    
    toast({
      title: "Removed from Cart",
      description: "Item removed from cart",
    });
  };

  const updateItem = (id: string, updates: Partial<CartItem>) => {
    dispatch({ type: 'UPDATE_ITEM', payload: { id, updates } });
  };

  const clearCart = async (skipCancellation: boolean = false) => {
    console.log('🧹 CLEARING CART - Current items:', state.cart.items.length, 'skipCancellation:', skipCancellation);
    console.log('🧹 Cart items structure:', state.cart.items.map(item => ({
      id: item.id,
      enrollmentId: item.enrollmentId,
      className: item.className,
      childName: item.childName
    })));
    console.log('🧹 Full state.cart.items:', state.cart.items);
    
    // Only attempt to cancel enrollments if not skipping and cart has items with enrollment IDs
    if (!skipCancellation) {
      console.log('✅ Entering cancellation block - will attempt to cancel enrollments');
      // Gather enrollment IDs from cart items using enrollmentId field
      const enrollmentIds = state.cart.items
        .map(item => item.enrollmentId)
        .filter((id): id is number => id !== undefined && id !== null);
      
      console.log('🧹 clearCart - Found enrollmentIds to cancel:', enrollmentIds.length, 'items');
      console.log('🧹 enrollmentIds array:', enrollmentIds);
      
      if (enrollmentIds.length > 0) {
        try {
          console.log('🧹 Calling bulk cancel endpoint for', enrollmentIds.length, 'enrollments:', JSON.stringify(enrollmentIds));
          
          // Get auth token same way as other protected requests
          const token = await getAccessToken();
          const response = await fetch('/api/enrollments/cancel-multiple', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ enrollmentIds }),
          });

          if (!response.ok) {
            const error = await response.json();
            console.error('🧹 Bulk cancel failed:', error);
            throw new Error(error.error || 'Failed to cancel enrollments');
          }

          const result = await response.json();
          console.log('🧹 Bulk cancel successful:', result);
          
          // Success toast
          toast({
            title: "Cart Cleared",
            description: `Successfully cancelled ${result.cancelled.length} enrollment(s)`,
          });

          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['/api/program-enrollments'] });
          queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] });
          
        } catch (error: any) {
          console.error('🧹 Error cancelling enrollments:', error);
          toast({
            title: "Error",
            description: error.message || "Failed to cancel enrollments. Please try again.",
            variant: "destructive",
          });
          // Don't clear local state if API fails - keep cart visible
          return;
        }
      }
    } else {
      console.log('⏭️ Skipping cancellation block - skipCancellation is truthy:', skipCancellation);
    }

    // Clear local state (always runs when skipCancellation is true, or after successful API call)
    dispatch({ type: 'CLEAR_CART' });
    
    // Clear user-specific cart storage
    const cartKey = getCartStorageKey(user?.email);
    localStorage.removeItem(cartKey);
    localStorage.removeItem('asa_cart_items');
    localStorage.removeItem('cart');
    localStorage.removeItem('selectedPaymentPlan');
    console.log('🧹 CART CLEARED for user:', user?.email || 'guest');
    
    // Invalidate cart-related queries to ensure fresh data on next load
    queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] });
    queryClient.invalidateQueries({ queryKey: ['/api/program-enrollments'] });
    
    // Only show toast if manually clearing (not after successful payment)
    if (!skipCancellation) {
      toast({
        title: "Cart Cleared",
        description: "All items removed from cart",
      });
    }
  };

  // Force refresh cart by reloading unpaid enrollments
  const forceRefreshCart = () => {
    console.log('🛒 Force refreshing cart...');
    
    // Clear current cart first
    dispatch({ type: 'CLEAR_CART' });
    
    // Refetch enrollments using TanStack Query
    refetchEnrollments();
  };

  const openCart = () => {
    dispatch({ type: 'OPEN_CART' });
    // Track view_cart event for GA4
    if (state.cart.items.length > 0) {
      trackViewCart(
        state.cart.items.map(item => ({
          item_id: String(item.classId),
          item_name: item.className,
          price: item.price,
          quantity: 1,
          item_category: 'Class',
          item_variant: item.childName,
        })),
        state.cart.total
      );
    }
  };
  const closeCart = () => dispatch({ type: 'CLOSE_CART' });

  const getItemCount = () => {
    console.log('🛒 getItemCount called - current items:', state.cart.items.length);
    return state.cart.items.length;
  };

  const hasItem = (classId: number, childId: number) => {
    return state.cart.items.some(
      item => item.classId === classId && item.childId === childId
    );
  };

  const applyPromoCode = async (code: string): Promise<{ success: boolean; error?: string; discount?: any }> => {
    try {
      // CRITICAL FIX: Send subtotal (not discounted total) to match server-side promo calculation
      // Server calculates promo discounts on raw subtotal, so we must do the same
      console.log('🎟️ Validating promo code:', code, 'for cart subtotal:', state.cart.subtotal);
      
      const response = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          code,
          cartTotal: state.cart.subtotal, // Use subtotal to match server calculation
          items: state.cart.items.map(item => ({
            childId: item.childId,
            classId: item.classId,
            price: item.price
          })), // Send items for sibling discount combinability check
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Promo code validation failed:', data.error);
        return { success: false, error: data.error || 'Invalid promo code' };
      }

      console.log('✅ Promo code validated:', data.discount);
      console.log('📊 Discount data received:', {
        discountAmount: data.discountAmount,
        type: data.discount.type,
        value: data.discount.value,
        cartSubtotal: state.cart.subtotal,
        isNaN: isNaN(data.discountAmount),
        overridesSiblingDiscount: data.overridesSiblingDiscount
      });

      // Validate discountAmount is a valid number
      if (data.discountAmount === undefined || data.discountAmount === null || isNaN(data.discountAmount)) {
        console.error('❌ Invalid discountAmount received:', data.discountAmount);
        return { success: false, error: 'Invalid discount calculation - please try again' };
      }

      // Dispatch APPLY_PROMO action to update cart with discount
      dispatch({
        type: 'APPLY_PROMO',
        payload: {
          code: data.discount.code,
          discountId: data.discount.id,
          name: data.discount.name,
          type: data.discount.type,
          value: data.discount.value,
          discountAmount: data.discountAmount,
          overridesSiblingDiscount: data.overridesSiblingDiscount || false,
        },
      });

      toast({
        title: "Promo Code Applied!",
        description: `${data.discount.name} - Save $${(data.discountAmount / 100).toFixed(2)}`,
      });

      return { success: true, discount: data.discount };
    } catch (error: any) {
      console.error('❌ Error applying promo code:', error);
      return { success: false, error: error.message || 'Failed to apply promo code' };
    }
  };

  const removePromoCode = () => {
    console.log('🗑️ Removing promo code');
    dispatch({ type: 'REMOVE_PROMO' });
    toast({
      title: "Promo Code Removed",
      description: "Discount has been removed from your cart",
    });
  };

  const setMembership = (membership: MembershipFee) => {
    console.log('🎫 Adding membership to cart:', membership);
    dispatch({ type: 'SET_MEMBERSHIP', payload: membership });
  };

  const removeMembership = () => {
    console.log('🎫 Removing membership from cart');
    dispatch({ type: 'REMOVE_MEMBERSHIP' });
    toast({
      title: "Membership Removed",
      description: "Membership fee has been removed from your cart",
    });
  };

  const contextValue: CartContextType = {
    cart: state.cart,
    isOpen: state.isOpen,
    cartHydrated: state.cartHydrated,
    cartLoading: isFetching, // Expose loading state from TanStack Query
    addItem,
    removeItem,
    updateItem,
    clearCart,
    forceRefreshCart,
    openCart,
    closeCart,
    getItemCount,
    hasItem,
    refreshCart,
    refreshDiscounts,
    applyPromoCode,
    removePromoCode,
    setMembership,
    removeMembership,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};