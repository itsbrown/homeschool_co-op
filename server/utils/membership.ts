import { randomBytes } from 'crypto';
import { storage } from '../storage';
import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Discount } from '@shared/schema';

/**
 * Result of membership discount calculation
 */
export interface MembershipDiscountResult {
  originalAmount: number;       // Original membership fee in cents
  discountAmount: number;       // Total discount applied in cents
  finalAmount: number;          // Amount to charge in cents
  appliedDiscounts: AppliedMembershipDiscount[];  // Discounts that were applied
}

export interface AppliedMembershipDiscount {
  discountId: number;
  discountName: string;
  discountCode: string | null;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  amountSaved: number;          // Amount saved from this discount in cents
}

/**
 * Get all roles for a user
 */
async function getUserRolesForMembership(userId: number): Promise<string[]> {
  try {
    const db = await getDb();
    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return roles.map((r: { role: string }) => r.role);
  } catch (error) {
    console.error('Error getting user roles for membership discount:', error);
    return [];
  }
}

/**
 * Check if user meets role requirements for a discount
 */
function checkMembershipRoleEligibility(
  userRolesList: string[], 
  requiredRoles: string[] | null | undefined, 
  matchLogic: string | null | undefined
): boolean {
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
}

/**
 * Check if a discount is currently valid (time constraints and usage limits)
 */
function isDiscountCurrentlyValid(discount: Discount): boolean {
  const now = new Date();
  
  // Check time constraints
  if (discount.validFrom && new Date(discount.validFrom) > now) {
    return false; // Not yet active
  }
  
  if (discount.validUntil && new Date(discount.validUntil) < now) {
    return false; // Expired
  }
  
  // Check usage limits
  const currentUsage = discount.currentUsageCount ?? 0;
  if (discount.usageLimit && currentUsage >= discount.usageLimit) {
    return false; // Usage limit reached
  }
  
  return true;
}

/**
 * Calculate the discount amount for a given discount on the membership fee
 */
function calculateDiscountAmountForMembership(
  discount: Discount, 
  membershipAmount: number
): number {
  let discountAmount = 0;
  
  if (discount.type === 'percentage') {
    discountAmount = Math.round((membershipAmount * discount.value) / 100);
    // Apply max discount cap if set
    if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
      discountAmount = discount.maxDiscountAmount;
    }
  } else if (discount.type === 'fixed_amount') {
    discountAmount = discount.value;
    // Apply max discount cap if set
    if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
      discountAmount = discount.maxDiscountAmount;
    }
    // Don't let fixed discount exceed membership amount
    if (discountAmount > membershipAmount) {
      discountAmount = membershipAmount;
    }
  }
  
  return discountAmount;
}

/**
 * Calculate the discounted membership amount for a parent
 * 
 * This function:
 * 1. Fetches all active discounts for the school where appliesToMembership = true
 * 2. Filters by eligibility (roles, time constraints, usage limits)
 * 3. Applies the BEST single discount (highest savings)
 * 4. Returns the calculated discounted price
 * 
 * @param schoolId - The school ID to fetch discounts for
 * @param parentUserId - The parent's user ID (for role-based eligibility)
 * @param originalMembershipAmount - The original membership fee in cents
 * @returns The calculated discount result
 */
export async function calculateMembershipDiscount(
  schoolId: number,
  parentUserId: number,
  originalMembershipAmount: number
): Promise<MembershipDiscountResult> {
  console.log('🎫 Calculating membership discount:', {
    schoolId,
    parentUserId,
    originalMembershipAmount
  });
  
  // Default result (no discount)
  const result: MembershipDiscountResult = {
    originalAmount: originalMembershipAmount,
    discountAmount: 0,
    finalAmount: originalMembershipAmount,
    appliedDiscounts: []
  };
  
  try {
    // SECURITY: Fetch discounts scoped by schoolId (not all discounts)
    // This prevents cross-tenant data exposure
    const schoolDiscounts = await storage.getDiscountsBySchoolId(schoolId);
    
    // Filter to membership-applicable, active discounts that can be auto-applied
    // CRITICAL: Only apply discounts with applicationMethod 'automatic' or 'both'
    // Manual-only discounts (like promo codes) should NOT be auto-applied
    const membershipDiscounts = schoolDiscounts.filter(d => 
      d.isActive &&
      d.appliesToMembership === true &&
      (d.applicationMethod === 'automatic' || d.applicationMethod === 'both')
    );
    
    console.log(`🎫 Found ${membershipDiscounts.length} membership discounts for school ${schoolId}`);
    
    if (membershipDiscounts.length === 0) {
      return result;
    }
    
    // Get user roles for eligibility checks
    const userRolesList = await getUserRolesForMembership(parentUserId);
    console.log(`🎭 User ${parentUserId} has roles:`, userRolesList);
    
    // Find the best applicable discount
    let bestDiscount: Discount | null = null;
    let bestDiscountAmount = 0;
    
    for (const discount of membershipDiscounts) {
      // Check if discount is currently valid (time/usage)
      if (!isDiscountCurrentlyValid(discount)) {
        console.log(`⏭️ Discount ${discount.name} skipped: not currently valid (time/usage)`);
        continue;
      }
      
      // Check role eligibility
      if (!checkMembershipRoleEligibility(userRolesList, discount.requiredRoles, discount.roleMatchLogic)) {
        console.log(`⏭️ Discount ${discount.name} skipped: role requirements not met`);
        continue;
      }
      
      // Calculate the discount amount
      const discountAmount = calculateDiscountAmountForMembership(discount, originalMembershipAmount);
      
      console.log(`💰 Discount ${discount.name} would save: ${discountAmount} cents`);
      
      // Keep the best discount (highest savings)
      if (discountAmount > bestDiscountAmount) {
        bestDiscount = discount;
        bestDiscountAmount = discountAmount;
      }
    }
    
    // Apply the best discount if found
    if (bestDiscount && bestDiscountAmount > 0) {
      result.discountAmount = bestDiscountAmount;
      result.finalAmount = Math.max(0, originalMembershipAmount - bestDiscountAmount);
      result.appliedDiscounts = [{
        discountId: bestDiscount.id,
        discountName: bestDiscount.name,
        discountCode: bestDiscount.code,
        discountType: bestDiscount.type as 'percentage' | 'fixed_amount',
        discountValue: bestDiscount.value,
        amountSaved: bestDiscountAmount
      }];
      
      console.log(`✅ Applied membership discount: ${bestDiscount.name}`, {
        originalAmount: originalMembershipAmount,
        discountAmount: bestDiscountAmount,
        finalAmount: result.finalAmount
      });
    } else {
      console.log('ℹ️ No applicable membership discounts found for this parent');
    }
    
    return result;
  } catch (error) {
    console.error('Error calculating membership discount:', error);
    // Return original amount if there's an error
    return result;
  }
}

/**
 * Generates a unique membership ID in the format: ASA-YEAR-RANDOM
 * Example: ASA-2025-X7K9M2
 * 
 * @returns A unique membership ID string
 */
export function generateMemberId(): string {
  const year = new Date().getFullYear();
  const randomPart = randomBytes(3)
    .toString('base64')
    .replace(/[+/=]/g, '') // Remove non-alphanumeric characters
    .toUpperCase()
    .slice(0, 6); // Take 6 characters
  
  return `ASA-${year}-${randomPart}`;
}

/**
 * Validates if a string is a valid membership ID format
 * Format: ASA-YEAR-RANDOM (e.g., ASA-2025-X7K9M2)
 * 
 * @param memberId The membership ID to validate
 * @returns true if valid format, false otherwise
 */
export function isValidMemberIdFormat(memberId: string): boolean {
  if (!memberId || typeof memberId !== 'string') {
    return false;
  }
  
  // Pattern: ASA-YYYY-XXXXXX where X is alphanumeric
  const pattern = /^ASA-\d{4}-[A-Z0-9]{6}$/;
  return pattern.test(memberId.toUpperCase());
}

/**
 * Checks if a user has a valid (non-empty) membership ID
 * 
 * @param memberId The membership ID to check
 * @returns true if user has a valid membership ID
 */
export function hasMemberId(memberId: string | null | undefined): boolean {
  return !!memberId && memberId.trim() !== '';
}
