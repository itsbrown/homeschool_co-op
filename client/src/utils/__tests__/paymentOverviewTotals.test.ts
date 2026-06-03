import {
  computeNetTotalRemainingCents,
  computePaymentOverviewTotals,
  resolveEnrollmentOutstandingForOverview,
  countBillingOutstandingEnrollments,
} from '../paymentOverviewTotals';

describe('computePaymentOverviewTotals', () => {
  it('sums future scheduled installments as plan remaining when enrollments show $0', () => {
    const overview = computePaymentOverviewTotals({
      enrollmentOutstandingCents: 0,
      paidSoFarCents: 33_796,
      upcomingPayments: [
        { amount: 33_796, dueDate: '2026-06-11', status: 'pending' },
        { amount: 33_796, dueDate: '2026-06-25', status: 'pending' },
      ],
    });

    expect(overview.dueNowCents).toBe(0);
    expect(overview.planRemainingCents).toBe(67_592);
    expect(overview.totalRemainingCents).toBe(67_592);
    expect(overview.upcomingInstallmentCount).toBe(2);
    expect(overview.nextPayment?.amountCents).toBe(33_796);
  });

  it('treats overdue and failed installments as due now', () => {
    const overview = computePaymentOverviewTotals({
      enrollmentOutstandingCents: 5_000,
      paidSoFarCents: 0,
      upcomingPayments: [
        { amount: 10_000, dueDate: '2026-01-01', status: 'pending', overdue: true },
        { amount: 10_000, dueDate: '2026-02-01', status: 'failed' },
        { amount: 10_000, dueDate: '2026-03-01', status: 'pending' },
      ],
    });

    expect(overview.dueNowCents).toBe(25_000);
    expect(overview.planRemainingCents).toBe(10_000);
    expect(overview.totalRemainingCents).toBe(35_000);
  });

  it('includes enrollment-only balance when no schedule exists', () => {
    const overview = computePaymentOverviewTotals({
      enrollmentOutstandingCents: 12_500,
      paidSoFarCents: 0,
      upcomingPayments: [],
    });

    expect(overview.totalRemainingCents).toBe(12_500);
    expect(overview.planRemainingCents).toBe(0);
  });
});

describe('resolveEnrollmentOutstandingForOverview', () => {
  it('prefers billing summary enrollment balance over cart filter ($0 cart)', () => {
    const cents = resolveEnrollmentOutstandingForOverview({
      billingSummary: {
        enrollmentBalance: 141_500,
        enrollmentDetails: [
          { balance: 70_750 },
          { balance: 70_750 },
        ],
      },
      cartOutstandingCents: 0,
    });
    expect(cents).toBe(141_500);
  });

  it('falls back to cart outstanding when billing summary is not loaded', () => {
    const cents = resolveEnrollmentOutstandingForOverview({
      billingSummary: null,
      cartOutstandingCents: 12_500,
    });
    expect(cents).toBe(12_500);
  });
});

describe('countBillingOutstandingEnrollments', () => {
  it('counts enrollment detail rows with positive balance', () => {
    expect(
      countBillingOutstandingEnrollments({
        enrollmentDetails: [{ balance: 100 }, { balance: 0 }, { balance: 50 }],
      }),
    ).toBe(2);
  });
});

describe('computeNetTotalRemainingCents', () => {
  it('applies credits to plan remaining before due now', () => {
    const overview = computePaymentOverviewTotals({
      enrollmentOutstandingCents: 0,
      paidSoFarCents: 0,
      upcomingPayments: [
        { amount: 20_000, dueDate: '2026-06-01', status: 'pending' },
      ],
    });
    overview.dueNowCents = 5_000;
    overview.planRemainingCents = 20_000;
    overview.totalRemainingCents = 25_000;

    expect(computeNetTotalRemainingCents(overview, 15_000)).toBe(10_000);
  });
});
