/**
 * Canonical Cart Snapshot with HMAC Checksum
 * 
 * This module provides server-authoritative pricing with integrity verification.
 * The checksum ensures the snapshot hasn't been tampered with between creation
 * and payment processing.
 */

import crypto from 'crypto';
import { splitIntegerEvenly } from './splitIntegerEvenly';

export interface CanonicalCartItem {
  classId: number;
  childId: number | null;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCostCents: number;
  childName?: string;
  className?: string;
}

export interface CanonicalDiscount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed_amount' | 'bundle';
  value: number;
  discountAmountCents: number;
  isPromoCode: boolean;
}

export interface CanonicalSnapshot {
  version: '1';
  createdAt: string;
  schoolId: number;
  userId: number;
  items: CanonicalCartItem[];
  discounts: CanonicalDiscount[];
  credits: {
    availableCents: number;
    appliedCents: number;
  };
  membership: {
    required: boolean;
    amountCents: number;
    alreadyPaid: boolean;
  };
  totals: {
    subtotalCents: number;
    discountTotalCents: number;
    membershipCents: number;
    creditsCents: number;
    grandTotalCents: number;
    payableAmountCents: number;
  };
}

export interface SignedSnapshot {
  snapshot: CanonicalSnapshot;
  checksum: string;
}

/**
 * Deterministically serialize snapshot for checksum computation.
 * Keys are sorted to ensure consistent output regardless of object creation order.
 */
export function canonicalizeForChecksum(snapshot: CanonicalSnapshot): string {
  const sortedKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortedKeys);
    }
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key) => {
        result[key] = sortedKeys(obj[key]);
        return result;
      }, {});
  };

  return JSON.stringify(sortedKeys(snapshot));
}

/**
 * Compute HMAC-SHA256 checksum of the snapshot.
 * Uses PAYMENT_SNAPSHOT_SECRET environment variable.
 */
export function computeChecksum(snapshot: CanonicalSnapshot, secret?: string): string {
  const signingSecret = secret || process.env.PAYMENT_SNAPSHOT_SECRET;
  if (!signingSecret) {
    throw new Error('PAYMENT_SNAPSHOT_SECRET environment variable is required for checksum computation');
  }

  const canonical = canonicalizeForChecksum(snapshot);
  return crypto.createHmac('sha256', signingSecret).update(canonical).digest('hex');
}

/**
 * Verify a snapshot's checksum matches the expected value.
 * Returns true if valid, false if tampered.
 */
export function verifyChecksum(
  snapshot: CanonicalSnapshot,
  expectedChecksum: string,
  secret?: string
): boolean {
  try {
    const computed = computeChecksum(snapshot, secret);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expectedChecksum, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Create a signed snapshot from cart data.
 * This is the primary entry point for creating a checksum-protected snapshot.
 */
export function signSnapshot(snapshot: CanonicalSnapshot, secret?: string): SignedSnapshot {
  const checksum = computeChecksum(snapshot, secret);
  return { snapshot, checksum };
}

/**
 * Validate that all item prices are positive integers (no silent $0 fallback).
 * Throws if any price is invalid.
 */
export function validateItemPrices(items: CanonicalCartItem[]): void {
  for (const item of items) {
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
      throw new Error(`Invalid price for class ${item.classId}: unitPriceCents must be non-negative integer, got ${item.unitPriceCents}`);
    }
    if (!Number.isInteger(item.totalCostCents) || item.totalCostCents < 0) {
      throw new Error(`Invalid total for class ${item.classId}: totalCostCents must be non-negative integer, got ${item.totalCostCents}`);
    }
    if (item.totalCostCents !== item.unitPriceCents * item.quantity) {
      throw new Error(`Price calculation mismatch for class ${item.classId}: ${item.unitPriceCents} * ${item.quantity} !== ${item.totalCostCents}`);
    }
  }
}

/**
 * Validate that totals are consistent.
 * Throws if any calculation is incorrect.
 */
export function validateTotals(snapshot: CanonicalSnapshot): void {
  const { items, totals, credits, membership, discounts } = snapshot;

  const itemsSum = items.reduce((sum, item) => sum + item.totalCostCents, 0);
  if (itemsSum !== totals.subtotalCents) {
    throw new Error(`Subtotal mismatch: items sum to ${itemsSum}, but subtotalCents is ${totals.subtotalCents}`);
  }

  const discountSum = discounts.reduce((sum, d) => sum + d.discountAmountCents, 0);
  if (discountSum !== totals.discountTotalCents) {
    throw new Error(`Discount mismatch: discounts sum to ${discountSum}, but discountTotalCents is ${totals.discountTotalCents}`);
  }

  const expectedGrand = totals.subtotalCents - totals.discountTotalCents + totals.membershipCents;
  if (expectedGrand !== totals.grandTotalCents) {
    throw new Error(`Grand total mismatch: expected ${expectedGrand}, got ${totals.grandTotalCents}`);
  }

  const expectedPayable = Math.max(0, totals.grandTotalCents - totals.creditsCents);
  if (expectedPayable !== totals.payableAmountCents) {
    throw new Error(`Payable amount mismatch: expected ${expectedPayable}, got ${totals.payableAmountCents}`);
  }

  if (credits.appliedCents > credits.availableCents) {
    throw new Error(`Credits applied (${credits.appliedCents}) exceeds available (${credits.availableCents})`);
  }

  if (credits.appliedCents > totals.grandTotalCents) {
    throw new Error(`Credits applied (${credits.appliedCents}) exceeds grand total (${totals.grandTotalCents})`);
  }
}

/**
 * Full validation of a snapshot before signing.
 */
export function validateSnapshot(snapshot: CanonicalSnapshot): void {
  validateItemPrices(snapshot.items);
  validateTotals(snapshot);
}

/**
 * Create a validated and signed snapshot.
 * Throws if validation fails, ensuring only valid snapshots are signed.
 */
export function createSignedSnapshot(snapshot: CanonicalSnapshot, secret?: string): SignedSnapshot {
  validateSnapshot(snapshot);
  return signSnapshot(snapshot, secret);
}

/**
 * Convert from existing cart-pricing.ts CartSnapshot format to CanonicalSnapshot.
 * This bridges the existing system with the new canonical format.
 */
export function convertToCanonicalSnapshot(
  existingSnapshot: any,
  userId: number,
  schoolId: number,
  cartItems: Array<{ classId: number; childId?: number; variantId?: string; childName?: string }>
): CanonicalSnapshot {
  const { pricing, membership, credits, totals } = existingSnapshot;

  const items: CanonicalCartItem[] = cartItems.map((item, index) => {
    const priceInfo = pricing.itemPrices?.find((p: any) => p.classId === item.classId);
    const unitPriceCents = priceInfo?.price || 0;

    if (unitPriceCents === 0) {
      throw new Error(`Missing or zero price for class ${item.classId}. Cannot create canonical snapshot with $0 prices.`);
    }

    return {
      classId: item.classId,
      childId: item.childId || null,
      variantId: item.variantId || null,
      quantity: 1,
      unitPriceCents,
      totalCostCents: unitPriceCents,
      childName: item.childName,
    };
  });

  const discounts: CanonicalDiscount[] = (pricing.discounts?.appliedDiscounts || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    value: d.value,
    discountAmountCents: d.discountAmount || 0,
    isPromoCode: d.sourceType === 'promo' || false,
  }));

  const subtotalCents = pricing.subtotal || 0;
  const discountTotalCents = pricing.discounts?.totalDiscountAmount || 0;
  const membershipCents = membership?.alreadyPaid ? 0 : (membership?.discountedAmount || 0);
  const creditsCents = credits?.applied || 0;
  const grandTotalCents = totals?.grandTotal || (subtotalCents - discountTotalCents + membershipCents);
  const payableAmountCents = totals?.payableAmount || Math.max(0, grandTotalCents - creditsCents);

  return {
    version: '1',
    createdAt: new Date().toISOString(),
    schoolId,
    userId,
    items,
    discounts,
    credits: {
      availableCents: credits?.available || 0,
      appliedCents: creditsCents,
    },
    membership: {
      required: membership?.required || false,
      amountCents: membershipCents,
      alreadyPaid: membership?.alreadyPaid || false,
    },
    totals: {
      subtotalCents,
      discountTotalCents,
      membershipCents,
      creditsCents,
      grandTotalCents,
      payableAmountCents,
    },
  };
}

/**
 * Split the payable amount across enrollments for allocation.
 * Uses the deterministic splitIntegerEvenly utility.
 */
export function splitPaymentAcrossItems(
  payableAmountCents: number,
  enrollmentIds: number[]
): Array<{ enrollmentId: number; allocatedCents: number }> {
  if (enrollmentIds.length === 0) {
    return [];
  }

  const amounts = splitIntegerEvenly(payableAmountCents, enrollmentIds.length);
  
  return enrollmentIds.map((enrollmentId, index) => ({
    enrollmentId,
    allocatedCents: amounts[index],
  }));
}
