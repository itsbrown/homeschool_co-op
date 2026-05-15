import { describe, it, expect } from '@jest/globals';
import {
  parsePaymentSettlementCents,
  paymentSettlementToDisplayFields,
} from '../lib/payment-settlement-display';

describe('payment-settlement-display', () => {
  it('parses card + credits from payment metadata (Forte scenario)', () => {
    const settlement = parsePaymentSettlementCents({
      amount: 154600,
      metadata: {
        creditsAppliedCents: 17500,
        stripeChargedCents: 154600,
        originalAmountCents: 172100,
      },
    });
    expect(settlement.cardAmountCents).toBe(154600);
    expect(settlement.creditsAppliedCents).toBe(17500);
    expect(settlement.totalSettlementCents).toBe(172100);
    expect(settlement.hasCreditsBreakdown).toBe(true);

    const display = paymentSettlementToDisplayFields(settlement);
    expect(display.cardAmount).toBe(1546);
    expect(display.creditsApplied).toBe(175);
    expect(display.totalSettlement).toBe(1721);
  });

  it('parses credits from Stripe PI string metadata on stripe-only rows', () => {
    const settlement = parsePaymentSettlementCents({
      amount: 154600,
      metadata: {
        creditsAppliedCents: '17500',
        originalAmountCents: '172100',
      },
    });
    expect(settlement.creditsAppliedCents).toBe(17500);
    expect(settlement.totalSettlementCents).toBe(172100);
  });

  it('card-only payment has no credits breakdown', () => {
    const settlement = parsePaymentSettlementCents({
      amount: 5000,
      metadata: {},
    });
    expect(settlement.hasCreditsBreakdown).toBe(false);
    expect(settlement.cardAmountCents).toBe(5000);
    expect(settlement.creditsAppliedCents).toBe(0);
  });
});
