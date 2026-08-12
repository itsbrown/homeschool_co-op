/**
 * Checkout discount snapshot helpers for free-after-threshold, sibling, and promo codes.
 * Shape matches parent PaymentHistoryPage "Discounts Applied" UI.
 *
 * Money path:
 * 1. create-PI builds this snapshot, virtualizes free-after zeros + cart-level comps
 *    into remaining balances for PaymentIntent sizing.
 * 2. fulfill applies free-after comps, then cart-level (promo/sibling/auto) comps,
 *    then allocatePaymentByBalance for cash.
 */
import { storage } from '../storage';
import type { CartItem, CartPricingResult } from '../utils/cart-pricing';
import { allocatePaymentByBalance } from './splitIntegerEvenly';

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
  /**
   * Cart-level discount (promo / sibling / automatic) allocated across enrollments
   * for PI sizing + fulfill comps. Does not include free-after amounts.
   */
  compEnrollmentAmounts: Record<string, number>;
  threshold: number;
  appliedDiscounts: CheckoutAppliedDiscountLine[];
};

export type EnrollmentOutstandingForDiscount = {
  enrollmentId: number;
  outstandingCents: number;
};

export const FREE_AFTER_COMP_REASON = 'Free After Threshold';
export const CHECKOUT_CART_COMP_REASON = 'Checkout Cart Discount';

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

/**
 * Proportionally allocate a cart-level discount lump across enrollment outstanding
 * balances (same weights as cash fulfill). Caps at sum(outstanding).
 */
export function allocateCartLevelDiscountComps(
  discountCents: number,
  enrollments: EnrollmentOutstandingForDiscount[],
  options?: { excludeEnrollmentIds?: Iterable<number> },
): Record<number, number> {
  if (!Number.isInteger(discountCents) || discountCents <= 0 || enrollments.length === 0) {
    return {};
  }

  const excluded = new Set(options?.excludeEnrollmentIds ?? []);
  const eligible = enrollments
    .filter((e) => !excluded.has(e.enrollmentId) && e.outstandingCents > 0)
    .map((e) => ({
      enrollmentId: e.enrollmentId,
      effectiveBalanceCents: Math.max(0, Math.floor(e.outstandingCents)),
    }));

  if (eligible.length === 0) return {};

  const positiveSum = eligible.reduce((s, e) => s + e.effectiveBalanceCents, 0);
  const capped = Math.min(discountCents, positiveSum);
  if (capped <= 0) return {};

  const allocation = allocatePaymentByBalance(capped, eligible);
  const result: Record<number, number> = {};
  for (const row of allocation) {
    if (row.amountCents > 0) {
      result[row.enrollmentId] = row.amountCents;
    }
  }
  return result;
}

function amountsRecordToStringKeys(amounts: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, cents] of Object.entries(amounts)) {
    out[String(id)] = cents;
  }
  return out;
}

export function buildCheckoutDiscountSnapshot(params: {
  pricing: CartPricingResult;
  freeEnrollmentIds: number[];
  /** enrollmentId → free line amount in cents */
  freeEnrollmentAmounts: Record<number, number>;
  /** Outstanding balances used to allocate promo/sibling/auto comps */
  enrollmentOutstandings?: EnrollmentOutstandingForDiscount[];
}): CheckoutDiscountSnapshot | null {
  const { pricing, freeEnrollmentIds, freeEnrollmentAmounts, enrollmentOutstandings } = params;
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

  // Promo/sibling/auto are cart-level lumps; free-after is tracked separately.
  const cartLevelDiscountCents = Math.max(0, totalDiscountAmount - freeAfterThree);
  const compEnrollmentAmounts =
    cartLevelDiscountCents > 0 && enrollmentOutstandings?.length
      ? allocateCartLevelDiscountComps(cartLevelDiscountCents, enrollmentOutstandings, {
          excludeEnrollmentIds: freeEnrollmentIds,
        })
      : {};

  const promoEnrollmentIds = Object.keys(compEnrollmentAmounts)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  for (const line of appliedDiscounts) {
    if (line.source === 'free_after_threshold') continue;
    if (promoEnrollmentIds.length > 0 && !line.enrollmentIds) {
      line.enrollmentIds = promoEnrollmentIds;
    }
  }

  return {
    subtotal: pricing.subtotal,
    discountTotal: totalDiscountAmount,
    freeAfterThree,
    freeItemIds: pricing.discounts.freeItemIds || [],
    freeEnrollmentIds,
    freeEnrollmentAmounts: amountsRecordToStringKeys(freeEnrollmentAmounts),
    compEnrollmentAmounts: amountsRecordToStringKeys(compEnrollmentAmounts),
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
    compEnrollmentAmounts:
      obj.compEnrollmentAmounts && typeof obj.compEnrollmentAmounts === 'object'
        ? (obj.compEnrollmentAmounts as Record<string, number>)
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
 * Virtual remaining balance for PI sizing: free-after lines → $0; otherwise
 * outstanding minus allocated cart-level (promo/sibling) comps.
 */
export function checkoutRemainingBalanceCentsForPi(params: {
  enrollmentId: number;
  outstandingCents: number;
  freeEnrollmentIdSet: Set<number>;
  compEnrollmentAmounts: Record<string, number>;
}): number {
  const { enrollmentId, outstandingCents, freeEnrollmentIdSet, compEnrollmentAmounts } = params;
  if (freeEnrollmentIdSet.has(enrollmentId)) return 0;
  const comp = Math.max(0, Math.floor(Number(compEnrollmentAmounts[String(enrollmentId)] ?? 0)));
  return Math.max(0, outstandingCents - comp);
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

function cartLevelCompReason(snapshot: CheckoutDiscountSnapshot): string {
  const named = (snapshot.appliedDiscounts || []).find(
    (d) => d.source !== 'free_after_threshold' && d.amount > 0 && d.name,
  );
  if (named?.name) {
    return `${CHECKOUT_CART_COMP_REASON}: ${named.name}`;
  }
  return CHECKOUT_CART_COMP_REASON;
}

/**
 * Idempotently apply promo/sibling/automatic cart-level comps from snapshot.
 * Adds on top of any existing comps (including free-after when both somehow present).
 */
export async function applyCartLevelDiscountCompsFromSnapshot(
  snapshot: CheckoutDiscountSnapshot | null,
): Promise<number[]> {
  if (!snapshot?.compEnrollmentAmounts) return [];

  const entries = Object.entries(snapshot.compEnrollmentAmounts)
    .map(([id, cents]) => ({
      enrollmentId: Number(id),
      compCents: Math.max(0, Math.floor(Number(cents) || 0)),
    }))
    .filter((e) => Number.isFinite(e.enrollmentId) && e.enrollmentId > 0 && e.compCents > 0);

  if (entries.length === 0) return [];

  const reason = cartLevelCompReason(snapshot);
  const applied: number[] = [];

  for (const { enrollmentId, compCents } of entries) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;

    const existingComp = enrollment.compAmountCents ?? 0;
    const alreadyHasCheckoutComp =
      typeof enrollment.compReason === 'string' &&
      enrollment.compReason.startsWith(CHECKOUT_CART_COMP_REASON);

    // Idempotent webhook replay: once tagged as checkout cart discount, skip.
    if (alreadyHasCheckoutComp) {
      applied.push(enrollmentId);
      continue;
    }

    const nextComp = existingComp + compCents;

    const remainingBalance = Math.max(
      0,
      (enrollment.totalCost ?? 0) - (enrollment.totalPaid ?? 0) - nextComp,
    );

    await storage.updateProgramEnrollment(enrollmentId, {
      compAmountCents: nextComp,
      // Preserve percentage only when it already represented a prior admin %;
      // cart discounts are amount-based.
      compPercentage: enrollment.compPercentage ?? null,
      compReason: reason,
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

/** Apply all checkout discount comps (free-after then cart-level) before cash allocation. */
export async function applyCheckoutDiscountCompsFromSnapshot(
  snapshot: CheckoutDiscountSnapshot | null,
): Promise<{ freeAfterEnrollmentIds: number[]; cartLevelEnrollmentIds: number[] }> {
  const freeAfterEnrollmentIds = await applyFreeAfterCompsFromSnapshot(snapshot);
  const cartLevelEnrollmentIds = await applyCartLevelDiscountCompsFromSnapshot(snapshot);
  return { freeAfterEnrollmentIds, cartLevelEnrollmentIds };
}
