import {
  computeCreditsSummaryTotals,
  getCreditRemainingCents,
} from '../utils/credit-summary';

describe('credit-summary', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('returns 0 remaining for revoked credits', () => {
    expect(
      getCreditRemainingCents(
        {
          status: 'revoked',
          creditAmountCents: 18_000,
          usedAmountCents: 0,
        },
        now,
      ),
    ).toBe(0);
  });

  it('excludes revoked credits from available balance totals', () => {
    const totals = computeCreditsSummaryTotals(
      [
        { status: 'approved', creditAmountCents: 9_000, usedAmountCents: 0 },
        { status: 'used', creditAmountCents: 9_000, usedAmountCents: 9_000 },
        { status: 'revoked', creditAmountCents: 18_000, usedAmountCents: 0 },
      ],
      now,
    );
    expect(totals.totalIssuedCents).toBe(18_000);
    expect(totals.totalUsedCents).toBe(9_000);
    expect(totals.availableBalanceCents).toBe(9_000);
  });

  it('treats expired approved credits as non-spendable', () => {
    const totals = computeCreditsSummaryTotals(
      [
        {
          status: 'approved',
          creditAmountCents: 5_000,
          usedAmountCents: 0,
          expiresAt: '2020-01-01T00:00:00Z',
        },
      ],
      now,
    );
    expect(totals.totalIssuedCents).toBe(5_000);
    expect(totals.availableBalanceCents).toBe(0);
  });
});
