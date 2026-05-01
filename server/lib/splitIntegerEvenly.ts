/**
 * Deterministic integer split utility
 * 
 * Splits a total amount (in cents) into N parts that sum exactly to the total.
 * Uses floor + remainder distribution to handle odd amounts.
 * 
 * Example: splitIntegerEvenly(100, 3) => [34, 33, 33] (sums to 100)
 */
export function splitIntegerEvenly(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('total must be non-negative integer');
  }
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('parts must be positive integer');
  }

  const base = Math.floor(total / parts);
  let remainder = total % parts;
  const result: number[] = [];

  for (let i = 0; i < parts; i++) {
    if (remainder > 0) {
      result.push(base + 1);
      remainder -= 1;
    } else {
      result.push(base);
    }
  }

  const sum = result.reduce((s, v) => s + v, 0);
  if (sum !== total) {
    throw new Error(`split mismatch: ${sum} !== ${total}`);
  }

  return result;
}

/**
 * Split a total amount across specific enrollment IDs
 * Returns an array of { enrollmentId, amountCents } objects
 */
export function splitAmountAcrossEnrollments(
  totalCents: number,
  enrollmentIds: number[]
): { enrollmentId: number; amountCents: number }[] {
  if (enrollmentIds.length === 0) {
    return [];
  }

  const amounts = splitIntegerEvenly(totalCents, enrollmentIds.length);
  
  return enrollmentIds.map((enrollmentId, index) => ({
    enrollmentId,
    amountCents: amounts[index]
  }));
}

/**
 * Input row for the balance-aware allocator. `effectiveBalanceCents` should
 * be the canonical `effective_balance` column (or the `computeEffectiveBalance`
 * fallback) — never `remainingBalance`.
 */
export interface EnrollmentBalanceInput {
  enrollmentId: number;
  effectiveBalanceCents: number;
}

/**
 * Balance-aware payment allocator.
 *
 * Distributes `totalCents` across enrollments using each enrollment's positive
 * `effective_balance` as the weight. Fully-paid enrollments
 * (`effectiveBalanceCents <= 0`) receive `$0` and are NEVER allocated to.
 *
 * Allocation rules (matches the contract documented in the Puccia balance
 * task):
 *   1. Any enrollment with `effectiveBalanceCents <= 0` is allocated `0`.
 *   2. If `totalCents <= sum(positive balances)`: allocate proportionally to
 *      each enrollment's positive balance using floor + remainder so the
 *      result sums exactly to `totalCents` and no allocation exceeds its
 *      enrollment's balance.
 *   3. If `totalCents > sum(positive balances)` (rare overpayment): each
 *      owing enrollment is paid up to its full balance, and the leftover is
 *      placed on the largest-balance owing enrollment(s). When multiple
 *      enrollments are tied for the largest balance the leftover is split
 *      evenly across those tied lines (with `splitIntegerEvenly` semantics)
 *      so the result is deterministic. This is the rule that produces the
 *      Puccia fixture: a $2,720 payment against [$0, $0, $1,300, $1,300]
 *      pays each owing line $1,300 in full and splits the $120 leftover
 *      evenly across the two tied $1,300 lines → [$0, $0, $1,360, $1,360].
 *   4. If every enrollment is fully paid (no positive balances): the entire
 *      `totalCents` is placed on the first enrollment so the payment record
 *      still reconciles to its allocations. This is intentionally loud
 *      rather than silently dropping money.
 *
 * Always preserves the invariant that the sum of returned `amountCents`
 * equals the input `totalCents`. Output preserves input order.
 */
export function allocatePaymentByBalance(
  totalCents: number,
  enrollments: EnrollmentBalanceInput[]
): { enrollmentId: number; amountCents: number }[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (enrollments.length === 0) {
    return [];
  }

  const result = enrollments.map((e) => ({
    enrollmentId: e.enrollmentId,
    amountCents: 0,
  }));

  if (totalCents === 0) {
    return result;
  }

  // Identify owing enrollments (positive balance only).
  const owingIndexes: number[] = [];
  let positiveBalanceSum = 0;
  for (let i = 0; i < enrollments.length; i++) {
    const bal = enrollments[i].effectiveBalanceCents;
    if (Number.isInteger(bal) && bal > 0) {
      owingIndexes.push(i);
      positiveBalanceSum += bal;
    }
  }

  // Edge case: no enrollment owes anything. Park the full amount on the first
  // enrollment so the payment record sums correctly. This is intentionally
  // loud (the resulting enrollment will go negative on effective_balance and
  // surface in audit reports) rather than silent.
  if (owingIndexes.length === 0) {
    result[0].amountCents = totalCents;
    return result;
  }

  if (totalCents <= positiveBalanceSum) {
    // Proportional split using BigInt floor + remainder so the result sums
    // exactly to `totalCents`. Per-line amounts are bounded by their
    // balance via the proportional formula (since totalCents <= positiveSum).
    const floors: number[] = [];
    const remainders: { index: number; remainder: number }[] = [];
    let allocated = 0;
    for (const idx of owingIndexes) {
      const balance = enrollments[idx].effectiveBalanceCents;
      const numerator = BigInt(totalCents) * BigInt(balance);
      const floorAmount = Number(numerator / BigInt(positiveBalanceSum));
      const remainder = Number(numerator % BigInt(positiveBalanceSum));
      floors.push(floorAmount);
      allocated += floorAmount;
      remainders.push({ index: idx, remainder });
    }
    for (let k = 0; k < owingIndexes.length; k++) {
      result[owingIndexes[k]].amountCents = floors[k];
    }
    let leftover = totalCents - allocated;
    if (leftover > 0) {
      const sortedByRemainder = [...remainders].sort((a, b) =>
        b.remainder !== a.remainder
          ? b.remainder - a.remainder
          : a.index - b.index,
      );
      let cursor = 0;
      while (leftover > 0) {
        const slot = sortedByRemainder[cursor % sortedByRemainder.length];
        const balance = enrollments[slot.index].effectiveBalanceCents;
        if (result[slot.index].amountCents < balance) {
          result[slot.index].amountCents += 1;
          leftover -= 1;
        }
        cursor += 1;
      }
    }
    return result;
  }

  // Overpayment branch: pay each owing line in full, then place the leftover
  // on the largest-balance owing enrollment(s). When multiple enrollments tie
  // for the largest balance, the leftover is split evenly across them so
  // results stay deterministic and parents with two equally-sized owing
  // enrollments don't see a lopsided over-allocation on just one of them.
  for (const idx of owingIndexes) {
    result[idx].amountCents = enrollments[idx].effectiveBalanceCents;
  }
  const overflow = totalCents - positiveBalanceSum;
  if (overflow > 0) {
    let largestBalance = 0;
    for (const idx of owingIndexes) {
      if (enrollments[idx].effectiveBalanceCents > largestBalance) {
        largestBalance = enrollments[idx].effectiveBalanceCents;
      }
    }
    const tiedLargest = owingIndexes.filter(
      (idx) => enrollments[idx].effectiveBalanceCents === largestBalance,
    );
    const overflowShares = splitIntegerEvenly(overflow, tiedLargest.length);
    for (let k = 0; k < tiedLargest.length; k++) {
      result[tiedLargest[k]].amountCents += overflowShares[k];
    }
  }
  return result;
}
