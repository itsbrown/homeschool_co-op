/**
 * FIFO credit allocation across installments sorted by due date (earliest first).
 * Used for parent UX hints only; server remains source of truth for actual charges.
 */
export function computeCreditCoverageFifo(
  rowsSortedByDue: Array<{ key: string; amountCents: number }>,
  totalAvailableCents: number
): Map<string, { creditAppliedCents: number; fullyCovered: boolean }> {
  let remaining = Math.max(0, Math.round(totalAvailableCents));
  const out = new Map<string, { creditAppliedCents: number; fullyCovered: boolean }>();

  for (const row of rowsSortedByDue) {
    const amt = Math.max(0, Math.round(row.amountCents));
    const applied = Math.min(amt, remaining);
    remaining -= applied;
    out.set(row.key, {
      creditAppliedCents: applied,
      fullyCovered: amt > 0 && applied >= amt,
    });
  }

  return out;
}
