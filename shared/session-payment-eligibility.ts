/**
 * Whether a child has paid toward an academic session enrollment
 * (card, credits applied, payment-plan first installment, or full comp / $0 activated).
 * Membership-only payment does not qualify — that never bumps session totalPaid.
 */

import { computeEffectiveBalance } from "./schema";

const TERMINAL_STATUSES = new Set([
  "cancelled",
  "withdrawn",
  "failed",
  "location_wishlist",
]);

export type SessionPaymentEnrollmentLike = {
  sessionId?: number | null;
  status?: string | null;
  totalCost?: number | null;
  totalPaid?: number | null;
  compAmountCents?: number | null;
  paymentStatus?: string | null;
};

/**
 * True if this enrollment row represents payment (or equivalent cover) toward its session.
 */
export function hasPaidTowardSession(e: SessionPaymentEnrollmentLike): boolean {
  if (e.sessionId == null) return false;
  const status = String(e.status ?? "").toLowerCase();
  if (TERMINAL_STATUSES.has(status)) return false;

  const paid = Number(e.totalPaid ?? 0);
  const cost = Number(e.totalCost ?? 0);
  const comp = Number(e.compAmountCents ?? 0);
  const owed = computeEffectiveBalance(cost, paid, comp);

  if (paid > 0) return true;

  if (owed === 0 && (status === "enrolled" || status === "completed")) {
    return true;
  }

  return false;
}

/** Placement enrollments must never appear as payable cart lines. */
export function isGradePlacementEnrollment(e: {
  placementSource?: string | null;
  placement_source?: string | null;
}): boolean {
  const src = e.placementSource ?? e.placement_source ?? null;
  return src === "grade";
}
