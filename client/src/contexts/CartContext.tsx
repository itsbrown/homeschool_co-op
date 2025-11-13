import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from "@/components/SupabaseProvider";

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
  appliedPromoCode?: {
    code: string;
    discountId: number;
    name: string;
    type: 'percentage' | 'fixed_amount' | 'bundle';
    value: number;
    discountAmount: number;
  } | null;
  // Store school discount settings so sync calculator can access them
  schoolSettings?: {
    freeAfterThresholdEnabled: boolean;
    freeAfterThreshold: number;
    siblingDiscountRate: number;
  };
}

export interface AppliedDiscount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed_amount';
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
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<CartItem> } }
  | { type: 'CLEAR_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'LOAD_CART'; payload: Cart }
  | { type: 'APPLY_PROMO'; payload: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number } }
  | { type: 'REMOVE_PROMO' };

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

// Fetch "Free After X" configuration from school settings
const fetchFreeAfterThresholdSettings = async (getAccessTokenSilently?: () => Promise<string>): Promise<{ enabled: boolean; threshold: number }> => {
  if (!getAccessTokenSilently) {
    return { enabled: false, threshold: 3 }; // Default fallback
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
      return { enabled: false, threshold: 3 };
    }

    const data = await response.json();
    const school = data.school;

    return {
      enabled: school?.freeAfterThresholdEnabled || false,
      threshold: school?.freeAfterThreshold || 3
    };
  } catch (error) {
    console.error('Error fetching free after threshold settings:', error);
    return { enabled: false, threshold: 3 }; // Default fallback
  }
};

const fetchApplicableDiscounts = async (items: CartItem[], subtotal: number, getAccessTokenSilently?: () => Promise<string>): Promise<AppliedDiscount[]> => {
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

    // Filter for active, automatic discounts
    // Note: Sibling discounts are excluded here because they're handled by the manual per-child
    // calculation in calculateCartTotalsWithDiscounts to ensure correct discount application
    // (only lower-cost siblings receive the discount, not whole-order percentage)
    const activeDiscounts = discounts.filter((discount: any) => 
      discount.isActive && 
      (discount.applicationMethod === 'automatic' || discount.applicationMethod === 'both') &&
      !discount.siblingDiscount  // Skip sibling discounts - they're handled separately
    );

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
  appliedPromo?: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number } | null,
  schoolSettings?: { freeAfterThresholdEnabled: boolean; freeAfterThreshold: number; siblingDiscountRate: number }
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
      
      // Apply discount to all children except the one with highest total cost
      siblingDiscount = items.reduce((sum, item) => {
        const childIndex = childrenByTotalCost.indexOf(item.childId);
        // First child in sorted list (highest cost) gets no discount
        if (childIndex > 0) {
          return sum + (item.price * siblingDiscountRate);
        }
        return sum;
      }, 0);
      
      // Only track discounted children if discount was actually applied
      if (siblingDiscount > 0) {
        discountedChildIds = childrenByTotalCost.slice(1);
      }
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
  appliedPromo?: { code: string; discountId: number; name: string; type: 'percentage' | 'fixed_amount' | 'bundle'; value: number; discountAmount: number } | null
): Promise<{ subtotal: number; discounts: any; total: number; schoolSettings?: { freeAfterThresholdEnabled: boolean; freeAfterThreshold: number; siblingDiscountRate: number } }> => {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Group items by child to calculate sibling discount
  const childrenWithClasses = items.reduce((acc, item) => {
    acc[item.childId] = (acc[item.childId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const uniqueChildren = Object.keys(childrenWithClasses).length;

  // Fetch "Free After Threshold" configuration from school settings
  let freeAfterThreeEnabled = false;
  let freeAfterThreshold = 3;
  try {
    const freeAfterSettings = await fetchFreeAfterThresholdSettings(getAccessTokenSilently);
    freeAfterThreeEnabled = freeAfterSettings.enabled;
    freeAfterThreshold = freeAfterSettings.threshold;
  } catch (error) {
    console.log('Failed to fetch free after threshold settings, using defaults (disabled)');
    freeAfterThreeEnabled = false;
    freeAfterThreshold = 3;
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
          
          // Apply discount to all children except the one with highest total cost
          siblingDiscount = items.reduce((sum, item) => {
            const childIndex = childrenByTotalCost.indexOf(item.childId);
            // First child in sorted list (highest cost) gets no discount
            if (childIndex > 0) {
              return sum + (item.price * siblingDiscountRate);
            }
            return sum;
          }, 0);
          
          // Only track discounted children if discount was actually applied
          if (siblingDiscount > 0) {
            discountedChildIds = childrenByTotalCost.slice(1);
          }
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
    autoDiscounts = await fetchApplicableDiscounts(items, subtotal, getAccessTokenSilently);
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
          appliedPromoCode: null,
        },
      };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    case 'LOAD_CART':
      return {
        ...state,
        cart: action.payload,
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
};

interface CartContextType {
  cart: Cart;
  isOpen: boolean;
  addItem: (item: Omit<CartItem, 'id'>, skipValidation?: boolean) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CartItem>) => void;
  clearCart: () => Promise<void>;
  forceRefreshCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getItemCount: () => number;
  hasItem: (classId: number, childId: number) => boolean;
  loadUnpaidEnrollments: () => Promise<void>;
  refreshCart: () => void;
  refreshDiscounts: () => Promise<void>;
  applyPromoCode: (code: string) => Promise<{ success: boolean; error?: string; discount?: any }>;
  removePromoCode: () => void;
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
  const { user, isAuthenticated, session } = useAuth(); // Using Supabase hooks
  
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

  const loadUnpaidEnrollments = useCallback(async () => {
    console.log('🛒 === LOAD_UNPAID_ENROLLMENTS CALLED ===');
    console.log('🛒 User email:', user?.email);
    console.log('🛒 Is authenticated:', isAuthenticated);
    console.log('🛒 Current cart items before API call:', state.cart.items.length);
    console.trace('🛒 loadUnpaidEnrollments called from:');

    if (!user?.email) {
      console.log('No user email available for cart loading');
      return;
    }

    try {
      console.log('🛒 Loading unpaid enrollments for user:', user.email);

      // Get the access token for API requests
      let token;
      try {
        token = await getAccessToken();
      } catch (error) {
        console.log('Failed to get access token:', error);
        return;
      }

      if (!token) {
        console.log('No authentication token found for cart loading');
        return;
      }

      const response = await fetch('/api/parent/enrollments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('Authentication failed for cart loading');
          return;
        }
        throw new Error(`Failed to fetch enrollments: ${response.status}`);
      }

      const enrollments = await response.json();
      console.log('🔍 Raw enrollments from API:', enrollments);

      // Check if cart was recently cleared (within 30 seconds) to prevent refilling after payment
      const clearedTimestamp = localStorage.getItem('asa_cart_cleared');
      if (clearedTimestamp) {
        const timeSinceCleared = Date.now() - parseInt(clearedTimestamp);
        if (timeSinceCleared < 30000) { // 30 seconds
          console.log('🛒 Cart was recently cleared, skipping reload to prevent refilling');
          return;
        } else {
          // Clear the flag after 30 seconds
          localStorage.removeItem('asa_cart_cleared');
        }
      }

      // Group enrollments by class+child combination to find the latest status
      const enrollmentGroups = enrollments.reduce((acc: any, enrollment: any) => {
        // Handle both classId and programId (they refer to the same thing)
        const classId = enrollment.classId || enrollment.programId;
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

        console.log(`🔍 Group ${key}:`, {
          latestEnrollmentId: latestEnrollment.id,
          latestStatus: latestEnrollment.status,
          latestPaymentStatus: latestEnrollment.paymentStatus,
          latestBalance: latestEnrollment.remainingBalance,
          hasBalance,
          hasFullyPaidEnrollment,
          latestIsPaid,
          allEnrollments: sortedEnrollments.map(e => ({
            id: e.id,
            status: e.status,
            paymentStatus: e.paymentStatus,
            balance: e.remainingBalance
          }))
        });

        // Skip items where there's a fully paid enrollment OR latest enrollment is paid OR on waitlist
        const isWaitlisted = latestEnrollment.status === 'waitlist';
        const shouldSkip = hasFullyPaidEnrollment || latestIsPaid || isWaitlisted;

        if (isWaitlisted) {
          console.log(`🔍 ⏸️ SKIPPING group ${key} - on waitlist (position ${latestEnrollment.waitlistPosition})`);
        } else if (shouldSkip) {
          console.log(`🔍 ✅ SKIPPING group ${key} - fully paid or enrolled with no balance`);
        } else if (hasBalance || (latestEnrollment.status === 'pending_payment' && latestEnrollment.remainingBalance > 0)) {
          console.log(`🔍 ➕ ADDING enrollment ${latestEnrollment.id} to cart - remainingBalance=${latestEnrollment.remainingBalance}`);
          unpaidEnrollments.push(latestEnrollment);
        } else {
          console.log(`🔍 ⏭️  SKIPPING group ${key} - no balance due`);
        }
      }

      // Convert enrollments to cart items with enhanced status display
      const cartItems: CartItem[] = unpaidEnrollments.map((enrollment: any) => {
        const remainingBalance = enrollment.remainingBalance || enrollment.totalCost || 0;
        const amountPaid = enrollment.amountPaid || 0;

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
          depositRequired: enrollment.depositRequired,
          amountPaid: amountPaid,
          remainingBalance: remainingBalance,
          totalCost: enrollment.totalCost || 0,
        };
      });

      // Use calculateCartTotalsWithDiscounts to fetch school settings and calculate discounts properly
      const totals = await calculateCartTotalsWithDiscounts(cartItems, getAccessToken, null); // Fresh load - no promo code yet

      console.log('🛒 About to merge API enrollments with existing cart');
      console.log('🛒 Current cart items:', state.cart.items.length);
      console.log('🛒 API enrollment items:', cartItems.length);

      // Load pending enrollments if we have any
      if (cartItems.length > 0) {
        // If cart is empty, load all pending enrollments
        if (state.cart.items.length === 0) {
          console.log('🛒 Cart is empty, loading API enrollments');
          dispatch({
            type: 'LOAD_CART',
            payload: {
              items: cartItems,
              ...totals,
              appliedPromoCode: null, // Fresh load - clear promo
              schoolSettings: totals.schoolSettings, // Preserve schoolSettings
            },
          });
        } else {
          // If cart has items, merge with pending enrollments (avoid duplicates)
          const existingIds = state.cart.items.map(item => item.id);
          const newItems = cartItems.filter(item => !existingIds.includes(item.id));
          
          if (newItems.length > 0) {
            console.log('🛒 Merging new pending enrollments with existing cart');
            const allItems = [...state.cart.items, ...newItems];
            // Also use async version for merged totals to recalculate with proper settings
            const mergedTotals = await calculateCartTotalsWithDiscounts(allItems, getAccessToken, state.cart.appliedPromoCode); // Preserve promo when merging
            dispatch({
              type: 'LOAD_CART',
              payload: {
                items: allItems,
                ...mergedTotals,
                appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code when merging
                schoolSettings: mergedTotals.schoolSettings, // Preserve schoolSettings
              },
            });
          }
        }
      } else {
        console.log('🛒 No pending enrollments found - clearing cart completely');
        dispatch({ type: 'CLEAR_CART' });
        localStorage.removeItem('asa_cart_items');
      }

      console.log(`🛒 Cart loaded with ${cartItems.length} unpaid enrollments`);
      console.log('🛒 Final cart items:', cartItems);
      console.log('🛒 Cart items:', cartItems);
      console.log('🛒 Cart totals:', totals);
    } catch (error) {
      console.error('Error loading unpaid enrollments:', error);
    }
  }, [user?.email, isAuthenticated, getAccessToken]);

  // Manual refresh function for external use
  const refreshCart = useCallback(() => {
    console.log('🛒 Manual cart refresh requested');
    if (user?.email && isAuthenticated) {
      loadUnpaidEnrollments();
    }
  }, [user?.email, isAuthenticated, loadUnpaidEnrollments]);

  // Function to refresh discounts for the current cart
  const refreshDiscounts = useCallback(async () => {
    console.log('🛒 Manual discount refresh requested');
    if (state.cart.items.length === 0) {
      console.log('🛒 No items in cart, skipping discount refresh');
      return;
    }

    try {
      const totalsWithDiscounts = await calculateCartTotalsWithDiscounts(
        state.cart.items, 
        getAccessToken,
        state.cart.appliedPromoCode // Pass promo code to preserve it
      );
      dispatch({
        type: 'LOAD_CART',
        payload: {
          items: state.cart.items,
          ...totalsWithDiscounts,
          appliedPromoCode: state.cart.appliedPromoCode, // Preserve promo code
        },
      });
      console.log('🛒 Discount refresh completed:', totalsWithDiscounts.discounts);
    } catch (error) {
      console.error('Error refreshing discounts:', error);
    }
  }, [state.cart.items, state.cart.appliedPromoCode, getAccessToken]);

  // Load cart from localStorage on mount
  useEffect(() => {
    // Check if cart was recently cleared to prevent restoring after payment
    const clearedTimestamp = localStorage.getItem('asa_cart_cleared');
    if (clearedTimestamp) {
      const timeSinceCleared = Date.now() - parseInt(clearedTimestamp);
      if (timeSinceCleared < 30000) { // 30 seconds
        console.log('🛒 Cart was recently cleared, skipping localStorage restore');
        return;
      }
    }

    const savedCart = localStorage.getItem('asa_cart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        console.log('🛒 Loading cart from localStorage:', parsedCart);
        dispatch({ type: 'LOAD_CART', payload: parsedCart });
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem('asa_cart');
      }
    }
  }, []);

  // Load unpaid enrollments on mount and when user changes
  useEffect(() => {
    if (user?.email && isAuthenticated) {
      console.log('🛒 User authenticated, loading cart after delay...');
      // Add a small delay to ensure the enrollment API has completed
      const timer = setTimeout(() => {
        console.log('🛒 Attempting to load unpaid enrollments after delay...');
        loadUnpaidEnrollments();
      }, 1000);

      return () => clearTimeout(timer);
    } else if (isAuthenticated === false && user === null) {
      // Only clear cart if we're definitely not authenticated (not during loading states)
      console.log('🛒 User definitely not authenticated, clearing cart');
      dispatch({ type: 'CLEAR_CART' });
    } else {
      // During authentication loading, ensure cart from localStorage is preserved
      const savedCart = localStorage.getItem('asa_cart');
      if (savedCart && state.cart.items.length === 0) {
        try {
          const parsedCart = JSON.parse(savedCart);
          if (parsedCart.items && parsedCart.items.length > 0) {
            console.log('🛒 Authentication loading - restoring cart from localStorage');
            dispatch({ type: 'LOAD_CART', payload: parsedCart });
          }
        } catch (error) {
          console.error('Error restoring cart during auth loading:', error);
        }
      }
    }
  }, [user?.email, isAuthenticated, loadUnpaidEnrollments]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    // Check if cart was recently cleared to prevent overriding the clear operation
    const clearedTimestamp = localStorage.getItem('asa_cart_cleared');
    if (clearedTimestamp) {
      const timeSinceCleared = Date.now() - parseInt(clearedTimestamp);
      if (timeSinceCleared < 30000) { // 30 seconds
        console.log('🛒 Cart was recently cleared, skipping localStorage save');
        return;
      }
    }

    // Don't save empty cart if localStorage has items (prevents overriding valid cart during navigation)
    const existingCart = localStorage.getItem('asa_cart');
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

    localStorage.setItem('asa_cart', JSON.stringify(state.cart));
  }, [state.cart]);

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
    dispatch({ type: 'REMOVE_ITEM', payload: id });
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
    
    // Only attempt to cancel enrollments if not skipping and cart has items with enrollment IDs
    if (!skipCancellation) {
      // Gather enrollment IDs from cart items using enrollmentId field
      const enrollmentIds = state.cart.items
        .map(item => item.enrollmentId)
        .filter((id): id is number => id !== undefined && id !== null);
      
      if (enrollmentIds.length > 0) {
        try {
          // Get auth token same way as other protected requests
          const token = await getAccessToken();
          const response = await fetch('/api/cart/clear', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ enrollmentIds }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to cancel enrollments');
          }

          const result = await response.json();
          console.log('🧹 Enrollments cancelled:', result);
          
          if (result.errors && result.errors.length > 0) {
            console.warn('🧹 Some enrollments could not be cancelled:', result.errors);
            toast({
              title: "Partial Success",
              description: `${result.cancelled.length} enrollments cancelled, but ${result.errors.length} had errors.`,
              variant: "destructive",
            });
          }

          // Invalidate program enrollments query to refresh children page
          queryClient.invalidateQueries({ queryKey: ['/api/program-enrollments'] });
          
        } catch (error: any) {
          console.error('🧹 Error cancelling enrollments:', error);
          toast({
            title: "Error",
            description: "Failed to cancel enrollments. Please try again or contact support if the issue persists.",
            variant: "destructive",
          });
          // Don't clear local state if API fails - keep cart visible
          return;
        }
      }
    }

    // Clear local state (always runs when skipCancellation is true, or after successful API call)
    dispatch({ type: 'CLEAR_CART' });
    localStorage.removeItem('asa_cart');
    localStorage.removeItem('asa_cart_items');
    localStorage.removeItem('cart'); // Also remove any other cart storage
    localStorage.removeItem('selectedPaymentPlan');
    // Set a flag to prevent immediate reload after payment
    localStorage.setItem('asa_cart_cleared', Date.now().toString());
    console.log('🧹 CART CLEARED - Flag set at:', Date.now());
    
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
    
    // Clear any stale cart cleared flag that might prevent loading
    localStorage.removeItem('asa_cart_cleared');
    
    // Reload unpaid enrollments after a short delay
    setTimeout(() => {
      loadUnpaidEnrollments();
    }, 500);
  };

  const openCart = () => dispatch({ type: 'OPEN_CART' });
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
      console.log('🎟️ Validating promo code:', code, 'for cart total:', state.cart.total);
      
      const response = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          code,
          cartTotal: state.cart.total,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Promo code validation failed:', data.error);
        return { success: false, error: data.error || 'Invalid promo code' };
      }

      console.log('✅ Promo code validated:', data.discount);

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

  const contextValue: CartContextType = {
    cart: state.cart,
    isOpen: state.isOpen,
    addItem,
    removeItem,
    updateItem,
    clearCart,
    forceRefreshCart,
    openCart,
    closeCart,
    getItemCount,
    hasItem,
    loadUnpaidEnrollments,
    refreshCart,
    refreshDiscounts,
    applyPromoCode,
    removePromoCode,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};