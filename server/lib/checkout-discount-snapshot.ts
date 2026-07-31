/**
 * Checkout discount snapshot helpers for free-after-threshold (and future sibling/promo).
 * Shape matches parent PaymentHistoryPage "Discounts Applied" UI.
 *
 * Pure helpers stay free of `storage` so unit tests can import without DB bootstrap.
 * `applyFreeAfterCompsFromSnapshot` loads storage lazily.
 */
import type { CartItem, CartPricingResult } from '../utils/cart-pricing';

export type CheckoutAppliedDiscountLine = {
  source: 'free_after_threshold' | 'sibling' | 'promo' | 'automatic' | 'bundle' | 'discount';
  name: string;
  code?: string | null;
  amount: number;
  enrollmentIds?: number[];
  freeItemIds?: string[];
};

export type CheckoutDiscountSnapshot = {
  subtotal: number;
  discountTotal: number;
  freeAfterThree: number;
  freeItemIds: string[];
  freeEnrollmentIds: number[];
  freeEnrollmentAmounts: Record<string, number>;
  threshold: number;
  appliedDiscounts: CheckoutAppliedDiscountLine[];
};

const FREE_AFTER_COMP_REASON = 'Free After Threshold';

/** Build stable cart item id → enrollment id map from parallel arrays after create-PI resolve. */
export function buildCartItemEnrollmentMap(
  cartItems: CartItem[],
  enrollmentIds: number[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < cartItems.length && i < enrollmentIds.length; i++) {
    const item = cartItems[i];
    const enrollmentId = enrollmentIds[i];
    if (!item?.id || !enrollmentId) continue;
    map.set(item.id, enrollmentId);
    map.set(`enrollment-${enrollmentId}`, enrollmentId);
    if (item.enrollmentId) {
      map.set(`enrollment-${item.enrollmentId}`, enrollmentId);
    }
  }
  return map;
}

export function resolveFreeEnrollmentIds(
  freeItemIds: string[],
  itemEnrollmentMap: Map<string, number>,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const itemId of freeItemIds) {
    const enrollmentId = itemEnrollmentMap.get(itemId);
    if (enrollmentId && !seen.has(enrollmentId)) {
      seen.add(enrollmentId);
      ids.push(enrollmentId);
    } else if (itemId.startsWith('enrollment-')) {
      const parsed = Number(itemId.slice('enrollment-'.length));
      if (Number.isFinite(parsed) && parsed > 0 && !seen.has(parsed)) {
        seen.add(parsed);
        ids.push(parsed);
      }
    }
  }
  return ids;
}

export function buildCheckoutDiscountSnapshot(params: {
  pricing: CartPricingResult;
  freeEnrollmentIds: number[];
  /** enrollmentId → free line amount in cents */
  freeEnrollmentAmounts: Record<number, number>;
}): CheckoutDiscountSnapshot | null {
  const { pricing, freeEnrollmentIds, freeEnrollmentAmounts } = params;
  const freeAfterThree = pricing.discounts.freeAfterThree || 0;
  const siblingDiscount = pricing.discounts.siblingDiscount || 0;
  const totalDiscountAmount = pricing.discounts.totalDiscountAmount || 0;

  if (totalDiscountAmount <= 0 && freeAfterThree <= 0 && siblingDiscount <= 0) {
    return null;
  }

  const threshold = pricing.schoolSettings?.freeAfterThreshold ?? 3;
  const appliedDiscounts: CheckoutAppliedDiscountLine[] = [];

  if (freeAfterThree > 0) {
    appliedDiscounts.push({
      source: 'free_after_threshold',
      name: `Free After ${threshold}`,
      amount: freeAfterThree,
      enrollmentIds: freeEnrollmentIds,
      freeItemIds: pricing.discounts.freeItemIds || [],
    });
  }

  if (siblingDiscount > 0) {
    appliedDiscounts.push({
      source: 'sibling',
      name: 'Sibling Discount',
      amount: siblingDiscount,
    });
  }

  for (const d of pricing.discounts.appliedDiscounts || []) {
    appliedDiscounts.push({
      source: (d.sourceType as CheckoutAppliedDiscountLine['source']) || 'automatic',
      name: d.name,
      amount: d.discountAmount,
    });
  }

  const amountsAsStrings: Record<string, number> = {};
  for (const [id, cents] of Object.entries(freeEnrollmentAmounts)) {
    amountsAsStrings[String(id)] = cents;
  }

  return {
    subtotal: pricing.subtotal,
    discountTotal: totalDiscountAmount,
    freeAfterThree,
    freeItemIds: pricing.discounts.freeItemIds || [],
    freeEnrollmentIds,
    freeEnrollmentAmounts: amountsAsStrings,
    threshold,
    appliedDiscounts,
  };
}

export function parseCheckoutDiscountSnapshot(
  raw: unknown,
): CheckoutDiscountSnapshot | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Partial<CheckoutDiscountSnapshot>;
  if (typeof obj.discountTotal !== 'number' && typeof obj.freeAfterThree !== 'number') {
    return null;
  }
  return {
    subtotal: Number(obj.subtotal) || 0,
    discountTotal: Number(obj.discountTotal) || 0,
    freeAfterThree: Number(obj.freeAfterThree) || 0,
    freeItemIds: Array.isArray(obj.freeItemIds) ? obj.freeItemIds.map(String) : [],
    freeEnrollmentIds: Array.isArray(obj.freeEnrollmentIds)
      ? obj.freeEnrollmentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [],
    freeEnrollmentAmounts:
      obj.freeEnrollmentAmounts && typeof obj.freeEnrollmentAmounts === 'object'
        ? (obj.freeEnrollmentAmounts as Record<string, number>)
        : {},
    threshold: Number(obj.threshold) || 3,
    appliedDiscounts: Array.isArray(obj.appliedDiscounts)
      ? (obj.appliedDiscounts as CheckoutAppliedDiscountLine[])
      : [],
  };
}

export function parseDiscountSnapshotFromPaymentIntentMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): CheckoutDiscountSnapshot | null {
  if (!metadata?.discountSnapshot) return null;
  return parseCheckoutDiscountSnapshot(metadata.discountSnapshot);
}

/**
 * Idempotently apply free-after comps from a checkout discount snapshot.
 * Returns enrollment ids that received (or already had) a free-after comp.
 */
export async function applyFreeAfterCompsFromSnapshot(
  snapshot: CheckoutDiscountSnapshot | null,
): Promise<number[]> {
  if (!snapshot || snapshot.freeEnrollmentIds.length === 0) {
    return [];
  }

  const { storage } = await import('../storage');
  const applied: number[] = [];
  for (const enrollmentId of snapshot.freeEnrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;

    const amountFromSnapshot = snapshot.freeEnrollmentAmounts[String(enrollmentId)];
    const compCents =
      typeof amountFromSnapshot === 'number' && amountFromSnapshot > 0
        ? Math.floor(amountFromSnapshot)
        : Math.max(0, (enrollment.totalCost ?? 0) - (enrollment.totalPaid ?? 0));

    if (compCents <= 0) continue;

    const existingComp = enrollment.compAmountCents ?? 0;
    if (existingComp >= compCents && enrollment.compReason === FREE_AFTER_COMP_REASON) {
      applied.push(enrollmentId);
      continue;
    }

    const nextComp = Math.max(existingComp, compCents);
    const remainingBalance = Math.max(
      0,
      (enrollment.totalCost ?? 0) - (enrollment.totalPaid ?? 0) - nextComp,
    );

    await storage.updateProgramEnrollment(enrollmentId, {
      compAmountCents: nextComp,
      compPercentage: null,
      compReason: FREE_AFTER_COMP_REASON,
      compBy: null,
      compAt: enrollment.compAt ?? new Date(),
      remainingBalance,
      ...(remainingBalance <= 0
        ? { paymentStatus: 'completed', status: 'enrolled' as const }
        : {}),
    });
    applied.push(enrollmentId);
  }
  return applied;
}

export { FREE_AFTER_COMP_REASON };
