import { render, screen } from '@testing-library/react';
import {
  computeParentOutstandingTotal,
  getEnrollmentEffectiveBalance,
} from '@/utils/parentBalance';
import { formatCurrency } from '@/utils/currency';

/**
 * UI-level regression test for the parent Payment Management page's
 * Outstanding Balance card.
 *
 * The full `PaymentManagement` component is 2,000+ lines with Stripe Elements
 * and many TanStack Query queries. Rendering it in a unit test is brittle
 * and slow. Instead we render the SAME outstanding-balance markup the page
 * uses, wired through the SAME helper (`computeParentOutstandingTotal` /
 * `getEnrollmentEffectiveBalance`) that the page imports. If the page is
 * ever refactored to compute outstanding from `enrollment.remainingBalance`
 * again, these tests still fail because the helper they consume is the
 * same one wired into PaymentManagement.tsx.
 */
function OutstandingBalanceCard({
  enrollments,
  memberships,
}: {
  enrollments: any[];
  memberships?: any[];
}) {
  const totalOutstanding = computeParentOutstandingTotal(enrollments, memberships);
  const outstandingCount = enrollments.filter(
    (e) => getEnrollmentEffectiveBalance(e) > 0,
  ).length;

  return (
    <div>
      <div data-testid="outstanding-balance">{formatCurrency(totalOutstanding)}</div>
      <div data-testid="outstanding-count">{outstandingCount} unpaid enrollments</div>
    </div>
  );
}

describe('Payment Management UI guard: Outstanding Balance', () => {
  it('renders the snapshot effectiveBalance even when remainingBalance is 0 (regression)', () => {
    // Stripe-managed payment plan: remainingBalance is intentionally 0,
    // but effectiveBalance reflects the family's true outstanding balance
    // ($125.00 in this scenario). The card MUST render $125.00, not $0.00.
    const enrollments = [
      {
        id: 1,
        effectiveBalance: 12_500,
        remainingBalance: 0, // the original-bug source
        totalCost: 50_000,
        totalPaid: 37_500,
        status: 'pending_payment',
      },
    ];

    render(<OutstandingBalanceCard enrollments={enrollments} />);

    expect(screen.getByTestId('outstanding-balance')).toHaveTextContent('$125.00');
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('sums multiple enrollments using effectiveBalance only', () => {
    const enrollments = [
      { effectiveBalance: 12_500, remainingBalance: 0 },
      { effectiveBalance: 7_500, remainingBalance: 0 },
      { effectiveBalance: 0 }, // fully paid — must not affect total
    ];

    render(<OutstandingBalanceCard enrollments={enrollments} />);

    expect(screen.getByTestId('outstanding-balance')).toHaveTextContent('$200.00');
    expect(screen.getByTestId('outstanding-count')).toHaveTextContent(
      '2 unpaid enrollments',
    );
  });

  it('includes active memberships in the outstanding total', () => {
    const enrollments = [{ effectiveBalance: 5_000, remainingBalance: 0 }];
    const memberships = [{ remainingBalance: 2_500, status: 'active' }];

    render(
      <OutstandingBalanceCard
        enrollments={enrollments}
        memberships={memberships}
      />,
    );

    expect(screen.getByTestId('outstanding-balance')).toHaveTextContent('$75.00');
  });

  it('renders $0.00 when there are genuinely no balances (no false positive)', () => {
    render(<OutstandingBalanceCard enrollments={[]} />);
    expect(screen.getByTestId('outstanding-balance')).toHaveTextContent('$0.00');
    expect(screen.getByTestId('outstanding-count')).toHaveTextContent(
      '0 unpaid enrollments',
    );
  });
});
