/**
 * scripts/lib/computeReallocationPlan.ts
 *
 * Pure reallocation planner shared by the production-data remediation script
 * (`scripts/fix-allocator-data-corruption.ts`) and the regression test suite
 * (`server/tests/allocator-reallocation.test.ts`).
 *
 * Lifting it into its own module is the single allowed code change for Task
 * #201 — the script and the tests must both consume the **same** function so
 * a future regression in the planner surfaces in the test suite immediately.
 *
 * The implementation is byte-identical to the previous in-script version
 * (former lines 249-282 of `scripts/fix-allocator-data-corruption.ts`).
 *
 * For each over enrollment (sorted deterministically by id) we call the
 * shared production helper `allocatePaymentByBalance(overAmount,
 * remainingUnders)`, which performs a BigInt floor + Hamilton's
 * largest-remainder split bounded by each target's remaining underpayment.
 * This is the same math the live payment path uses to allocate an incoming
 * payment across sibling enrollments, so the remediation script and the
 * production allocator agree on what "fair" means.
 *
 * Gated on `p.pureAllocatorBugVictim` (per-parent net = 0): under that
 * precondition, each target's accumulated proportional shares from every
 * source sum exactly to its underpayment, so every enrollment ends at
 * effective_balance $0 and `sum(moves) == sum(overpayments) ==
 * sum(underpayments)` — no cents are dropped, invented, or stranded.
 */

import { allocatePaymentByBalance } from '../../server/lib/splitIntegerEvenly';
import type { MoveSpec } from '../../server/services/PaymentReallocationService';

export interface PlannerEnrollment {
  enrollment_id: number;
  effective_balance: number;
}

export interface PlannerInput {
  /** Net per-parent effective_balance in cents. Must be 0 for moves to be emitted. */
  netCents: number;
  enrollments: PlannerEnrollment[];
}

export function computeReallocationPlan(p: PlannerInput): MoveSpec[] {
  if (p.netCents !== 0) return [];
  const overs = p.enrollments
    .filter((e) => e.effective_balance < 0)
    .sort((a, b) => a.enrollment_id - b.enrollment_id)
    .map((e) => ({ id: e.enrollment_id, overCents: -e.effective_balance }));
  const undersOrdered = p.enrollments
    .filter((e) => e.effective_balance > 0)
    .sort((a, b) => a.enrollment_id - b.enrollment_id);
  if (overs.length === 0 || undersOrdered.length === 0) return [];

  const remaining = new Map<number, number>(
    undersOrdered.map((u) => [u.enrollment_id, u.effective_balance]),
  );
  const moves: MoveSpec[] = [];

  for (const src of overs) {
    const targets = undersOrdered
      .map((u) => ({
        enrollmentId: u.enrollment_id,
        effectiveBalanceCents: remaining.get(u.enrollment_id)!,
      }))
      .filter((t) => t.effectiveBalanceCents > 0);
    if (targets.length === 0) break;
    const split = allocatePaymentByBalance(src.overCents, targets);
    for (const s of split) {
      if (s.amountCents <= 0) continue;
      moves.push({
        sourceEnrollmentId: src.id,
        targetEnrollmentId: s.enrollmentId,
        amountCents: s.amountCents,
      });
      remaining.set(s.enrollmentId, (remaining.get(s.enrollmentId) ?? 0) - s.amountCents);
    }
  }
  return moves;
}
