import { CurrencyUtils } from '@shared/currency-utils';
import { parseBalanceIntentCredits } from './balance-payment-metadata';

export type PaymentSettlementCents = {
  cardAmountCents: number;
  creditsAppliedCents: number;
  totalSettlementCents: number;
  hasCreditsBreakdown: boolean;
};

function readCentsField(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

/**
 * Derive card vs credits vs total settlement from a payment row and/or Stripe PI metadata.
 * DB `payments.amount` is card charged (cents); credits live in metadata when used at checkout.
 */
export function parsePaymentSettlementCents(payment: {
  amount?: number | null;
  metadata?: unknown;
}): PaymentSettlementCents {
  const meta =
    payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};

  const fromPiStrings = parseBalanceIntentCredits(
    meta as Record<string, string | undefined>,
  );

  let creditsAppliedCents = readCentsField(meta.creditsAppliedCents);
  if (creditsAppliedCents <= 0 && fromPiStrings.creditsAppliedCents > 0) {
    creditsAppliedCents = fromPiStrings.creditsAppliedCents;
  }

  let cardAmountCents = readCentsField(meta.stripeChargedCents);
  if (cardAmountCents <= 0) {
    cardAmountCents = Math.max(0, Math.round(payment.amount ?? 0));
  }

  let totalSettlementCents = readCentsField(meta.originalAmountCents);
  if (totalSettlementCents <= 0 && fromPiStrings.originalAmountCents > 0) {
    totalSettlementCents = fromPiStrings.originalAmountCents;
  }
  if (totalSettlementCents <= 0) {
    totalSettlementCents =
      creditsAppliedCents > 0 ? cardAmountCents + creditsAppliedCents : cardAmountCents;
  }

  return {
    cardAmountCents,
    creditsAppliedCents,
    totalSettlementCents,
    hasCreditsBreakdown: creditsAppliedCents > 0,
  };
}

export function paymentSettlementToDisplayFields(settlement: PaymentSettlementCents) {
  return {
    /** Card charge (legacy `amount` field — same as cardAmount). */
    amount: CurrencyUtils.toDisplay(settlement.cardAmountCents),
    cardAmount: CurrencyUtils.toDisplay(settlement.cardAmountCents),
    creditsApplied: CurrencyUtils.toDisplay(settlement.creditsAppliedCents),
    totalSettlement: CurrencyUtils.toDisplay(settlement.totalSettlementCents),
    hasCreditsBreakdown: settlement.hasCreditsBreakdown,
  };
}
