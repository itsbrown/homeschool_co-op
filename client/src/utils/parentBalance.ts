/**
 * Parent-side balance helpers for the Payment Management page.
 *
 * Why this lives in a helper:
 *   The parent Payment Management page used to read `enrollment.remainingBalance`
 *   directly. For Stripe-managed payment plans the column is intentionally
 *   stored as `0` (NOT NULL), which silently zeroed-out the displayed
 *   "Outstanding Balance" even when the family genuinely owed money.
 *
 *   The DB-generated `effective_balance` column (exposed as
 *   `enrollment.effectiveBalance`) is the single source of truth and is what
 *   the cart's server snapshot uses for `payableAmount`. This helper enforces
 *   that contract on the client: the parent UI must NEVER read
 *   `remainingBalance` to compute outstanding totals.
 *
 *   See `asa-payment-patterns` "Parent Payments page shows $0" pitfall.
 */

import { computeEffectiveBalance } from '@shared/schema';

export interface ParentEnrollmentBalanceFields {
  /** Server-computed effective balance in cents (preferred). */
  effectiveBalance?: number | null;
  /**
   * Total cost in cents. Only used as a fallback when `effectiveBalance` is
   * not present on the row.
   */
  totalCost?: number | null;
  /** Total paid in cents. Fallback companion of `totalCost`. */
  totalPaid?: number | null;
  /** Comp/discount amount in cents. Fallback companion of `totalCost`. */
  compAmountCents?: number | null;
}

/**
 * Returns the parent's true outstanding balance for a single enrollment in
 * cents. Always prefers the DB-generated `effective_balance` column; falls
 * back to the same formula `max(0, totalCost - totalPaid - compAmountCents)`
 * when the column is missing.
 *
 * NEVER reads `remainingBalance` — see file header.
 */
export function getEnrollmentEffectiveBalance(
  enrollment: ParentEnrollmentBalanceFields | null | undefined,
): number {
  if (!enrollment) return 0;
  if (typeof enrollment.effectiveBalance === 'number') {
    return enrollment.effectiveBalance;
  }
  return computeEffectiveBalance(
    enrollment.totalCost ?? 0,
    enrollment.totalPaid ?? 0,
    enrollment.compAmountCents ?? 0,
  );
}

export interface ParentMembershipBalanceFields {
  amount?: number | null;
  amountPaid?: number | null;
  /**
   * For memberships, `remainingBalance` is the source of truth (memberships
   * are not Stripe-managed payment plans, so the column is not artificially
   * zeroed). We still fall back to `amount - amountPaid` when missing.
   */
  remainingBalance?: number | null;
  status?: string | null;
}

/**
 * Returns the membership outstanding balance in cents. Skips memberships in
 * `expired`/`suspended` statuses to match the Payment Management page's
 * "active membership" filter.
 */
export function getMembershipOutstandingBalance(
  membership: ParentMembershipBalanceFields | null | undefined,
): number {
  if (!membership) return 0;
  if (membership.status && ['expired', 'suspended'].includes(membership.status)) {
    return 0;
  }
  if (typeof membership.remainingBalance === 'number') {
    return Math.max(0, membership.remainingBalance);
  }
  const amount = membership.amount ?? 0;
  const paid = membership.amountPaid ?? 0;
  return Math.max(0, amount - paid);
}

/**
 * Returns the parent's total outstanding balance across all enrollments and
 * (optionally) active memberships, in cents. This is what the Payment
 * Management overview's "Outstanding Balance" card renders.
 */
export function computeParentOutstandingTotal(
  enrollments: ParentEnrollmentBalanceFields[] | null | undefined,
  memberships?: ParentMembershipBalanceFields[] | null | undefined,
): number {
  const enrollmentsTotal = (enrollments ?? []).reduce(
    (total, enrollment) => total + Math.max(0, getEnrollmentEffectiveBalance(enrollment)),
    0,
  );
  const membershipsTotal = (memberships ?? []).reduce(
    (total, membership) => total + getMembershipOutstandingBalance(membership),
    0,
  );
  return enrollmentsTotal + membershipsTotal;
}

function safeNumber(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * Credit-aware Outstanding Balance display logic. Mirrors the rule the
 * manual Pay Now flow uses on the server: credits default ON, so what the
 * parent sees as "Outstanding" should equal what the card will actually be
 * charged (gross owed minus available credits, floored at zero).
 *
 * `showCreditsLine` controls whether the breakdown ("Owed: X − Credits: Y")
 * is rendered. We only show it when both sides are positive.
 */
export function computeOutstandingDisplay(
  outstandingCents: number,
  creditsCents: number,
): { displayCents: number; netDueCents: number; showCreditsLine: boolean } {
  const safeOutstanding = safeNumber(outstandingCents);
  const safeCredits = safeNumber(creditsCents);
  const netDueCents = Math.max(0, safeOutstanding - safeCredits);
  const showCreditsLine = safeCredits > 0 && safeOutstanding > 0;
  return {
    displayCents: showCreditsLine ? netDueCents : safeOutstanding,
    netDueCents,
    showCreditsLine,
  };
}

/** Shape of a parent credit record from `/api/parent/credits`. */
export interface ParentCreditRecord {
  status?: string | null;
  remainingCents?: number | null;
  creditAmountCents?: number | null;
  usedAmountCents?: number | null;
  expiresAt?: string | Date | null;
}

const SPENDABLE_CREDIT_STATUSES = new Set(['approved', 'partially_used']);

/**
 * Sum credit records the parent can actually spend at checkout. Requires an
 * explicit spendable status; excludes expired credits.
 */
export function sumSpendableCredits(
  records: ParentCreditRecord[] | null | undefined,
): number {
  if (!records || records.length === 0) return 0;
  const now = Date.now();
  let total = 0;
  for (const c of records) {
    if (!c.status || !SPENDABLE_CREDIT_STATUSES.has(c.status)) continue;
    if (c.expiresAt) {
      const exp = c.expiresAt instanceof Date
        ? c.expiresAt.getTime()
        : new Date(c.expiresAt).getTime();
      if (Number.isFinite(exp) && exp < now) continue;
    }
    const remaining =
      typeof c.remainingCents === 'number'
        ? c.remainingCents
        : Math.max(0, (c.creditAmountCents ?? 0) - (c.usedAmountCents ?? 0));
    if (remaining > 0) total += remaining;
  }
  return total;
}

/**
 * Canonical "Owed" breakdown rendered by every parent-facing balance surface.
 * Memberships now flow through the cart alongside enrollments, so credits
 * apply across the full owed amount and `netDueCents === payableNowCents`.
 */
export interface OutstandingBreakdown {
  enrollmentsCents: number;
  enrollmentCount: number;
  membershipsCents: number;
  membershipCount: number;
  totalOwedCents: number;
  creditsAvailableCents: number;
  /** @deprecated use `creditsAvailableCents`. */
  creditsCents: number;
  /**
   * Credits applied across the full owed amount (enrollments + memberships).
   * Field name retained for back-compat; the historical
   * "credits-can-only-touch-enrollments" cap was removed when memberships
   * became cart-payable.
   */
  creditsAppliedToEnrollments: number;
  payableNowCents: number;
  netDueCents: number;
  displayCents: number;
  showCreditsLine: boolean;
  /** @deprecated memberships are no longer "paid separately". Always false. */
  showMembershipLine: boolean;
}

/**
 * Compute the canonical outstanding-balance breakdown. Pass raw `credits`
 * records when available; otherwise pass a pre-aggregated `creditsCents`.
 */
export function computeOutstandingBreakdown(input: {
  enrollments: ParentEnrollmentBalanceFields[] | null | undefined;
  memberships: ParentMembershipBalanceFields[] | null | undefined;
  credits?: ParentCreditRecord[] | null;
  creditsCents?: number | null;
}): OutstandingBreakdown {
  let enrollmentsCents = 0;
  let enrollmentCount = 0;
  for (const enrollment of input.enrollments ?? []) {
    const balance = Math.max(0, getEnrollmentEffectiveBalance(enrollment));
    if (balance > 0) {
      enrollmentsCents += balance;
      enrollmentCount += 1;
    }
  }

  let membershipsCents = 0;
  let membershipCount = 0;
  for (const membership of input.memberships ?? []) {
    const balance = getMembershipOutstandingBalance(membership);
    if (balance > 0) {
      membershipsCents += balance;
      membershipCount += 1;
    }
  }

  const creditsAvailableCents = input.credits
    ? sumSpendableCredits(input.credits)
    : safeNumber(input.creditsCents ?? 0);

  const totalOwedCents = enrollmentsCents + membershipsCents;
  // Credits now apply across the full owed amount because memberships flow
  // through the cart alongside enrollments. The previous cap at
  // `enrollmentsCents` was a workaround for memberships being paid separately.
  const creditsAppliedToEnrollments = Math.min(
    creditsAvailableCents,
    totalOwedCents,
  );
  const payableNowCents = Math.max(
    0,
    totalOwedCents - creditsAppliedToEnrollments,
  );
  const netDueCents = payableNowCents;

  return {
    enrollmentsCents,
    enrollmentCount,
    membershipsCents,
    membershipCount,
    totalOwedCents,
    creditsAvailableCents,
    creditsCents: creditsAvailableCents,
    creditsAppliedToEnrollments,
    payableNowCents,
    netDueCents,
    displayCents: netDueCents,
    showCreditsLine: creditsAvailableCents > 0 && totalOwedCents > 0,
    showMembershipLine: false,
  };
}

export const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * Client-side mirror of `server/utils/manualPayCredits.ts:computeManualPayCredits`.
 * Drives the Pay Now dialog's displayed breakdown and the `expectedChargeAmount`
 * the dialog sends to /pay; the server is still the sole authority and 409s on
 * any divergence > 1¢. Keep the rules in lockstep with the server helper.
 */
export function computeManualPayDisplay(input: {
  amount: number;
  availableCredits: number;
  applyCredits: boolean;
}): {
  creditsToApply: number;
  amountAfterCredits: number;
  isFullyCoveredByCredits: boolean;
} {
  const amount = safeNumber(input.amount);
  const availableCredits = safeNumber(input.availableCredits);
  const applyCredits = input.applyCredits !== false;

  let creditsToApply = 0;
  if (applyCredits && availableCredits > 0 && amount > 0) {
    if (availableCredits >= amount) {
      creditsToApply = amount;
    } else {
      const maxForPartial = amount - STRIPE_MIN_CHARGE_CENTS;
      creditsToApply = availableCredits <= maxForPartial
        ? availableCredits
        : Math.max(0, maxForPartial);
    }
  }
  const amountAfterCredits = Math.max(0, amount - creditsToApply);
  return {
    creditsToApply,
    amountAfterCredits,
    isFullyCoveredByCredits: amountAfterCredits === 0 && creditsToApply > 0,
  };
}
