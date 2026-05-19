import type { CreditStatus } from '@shared/schema';

/** Statuses whose unused balance can be applied at checkout (FIFO). */
export const SPENDABLE_CREDIT_STATUSES: CreditStatus[] = ['approved', 'partially_used'];

export interface CreditSummaryInput {
  status: CreditStatus | string;
  creditAmountCents: number;
  usedAmountCents: number;
  expiresAt?: Date | string | null;
}

/** Remaining cents on a single credit row (0 when not spendable or expired). */
export function getCreditRemainingCents(credit: CreditSummaryInput, now = new Date()): number {
  if (!SPENDABLE_CREDIT_STATUSES.includes(credit.status as CreditStatus)) {
    return 0;
  }
  if (credit.expiresAt) {
    const expiresAt =
      credit.expiresAt instanceof Date ? credit.expiresAt : new Date(credit.expiresAt);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
      return 0;
    }
  }
  return Math.max(0, credit.creditAmountCents - (credit.usedAmountCents ?? 0));
}

export interface CreditsSummaryTotals {
  /** Count of credit rows shown in admin history. */
  creditCount: number;
  /** Sum of original face value for non-revoked / non-rejected / non-pending credits. */
  totalIssuedCents: number;
  /** Sum of consumed amounts across all credits (including used/revoked rows). */
  totalUsedCents: number;
  /** Spendable remaining balance (matches checkout / getAvailableCredits). */
  availableBalanceCents: number;
}

/**
 * Admin-facing credit totals. Revoked, rejected, and pending credits do not
 * contribute to issued or available balances.
 */
export function computeCreditsSummaryTotals(
  credits: CreditSummaryInput[],
  now = new Date(),
): CreditsSummaryTotals {
  let totalIssuedCents = 0;
  let totalUsedCents = 0;
  let availableBalanceCents = 0;

  for (const credit of credits) {
    totalUsedCents += credit.usedAmountCents ?? 0;

    if (['revoked', 'rejected', 'pending'].includes(credit.status)) {
      continue;
    }

    totalIssuedCents += credit.creditAmountCents;
    availableBalanceCents += getCreditRemainingCents(credit, now);
  }

  return {
    creditCount: credits.length,
    totalIssuedCents,
    totalUsedCents,
    availableBalanceCents,
  };
}
