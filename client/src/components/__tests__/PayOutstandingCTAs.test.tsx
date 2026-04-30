import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useUnpaidEnrollments,
  usePayOutstanding,
  type UnpaidEnrollment,
} from '@/hooks/useUnpaidEnrollments';
import { formatCurrency } from '@/lib/utils';

const mockAddItem = jest.fn();
const mockOpenCart = jest.fn();
let mockCartItems: Array<{ enrollmentId?: number | null }> = [];

jest.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    cart: { items: mockCartItems },
    addItem: mockAddItem,
    openCart: mockOpenCart,
  }),
}));

function makeWrapper(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
  seed(qc);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function DashboardCTAHarness() {
  const {
    unpaidEnrollments,
    totalOutstandingCents,
    netDueCents,
    isLoading,
  } = useUnpaidEnrollments();
  const payOutstanding = usePayOutstanding();
  if (totalOutstandingCents === 0) return null;
  return (
    <button
      onClick={() => payOutstanding(unpaidEnrollments)}
      disabled={isLoading || unpaidEnrollments.length === 0}
      data-testid="button-pay-outstanding-dashboard"
    >
      {netDueCents > 0 ? `Pay ${formatCurrency(netDueCents)}` : 'Pay Now'}
    </button>
  );
}

function OverviewCTAHarness() {
  const {
    unpaidEnrollments,
    netDueCents,
    displayCents,
    isLoading,
  } = useUnpaidEnrollments();
  const payOutstanding = usePayOutstanding();
  const showButton = isLoading || displayCents > 0;
  if (!showButton) return null;
  return (
    <button
      onClick={() => payOutstanding(unpaidEnrollments)}
      disabled={isLoading || unpaidEnrollments.length === 0}
      data-testid="button-pay-outstanding-overview"
    >
      {isLoading
        ? 'Loading...'
        : netDueCents > 0
        ? `Pay ${formatCurrency(netDueCents)}`
        : 'Pay Now'}
    </button>
  );
}

function WhatYouOweHarness() {
  const { unpaidEnrollments } = useUnpaidEnrollments();
  const payOutstanding = usePayOutstanding();
  if (unpaidEnrollments.length === 0) return null;
  const total = unpaidEnrollments.reduce((s, e) => s + e.effectiveBalance, 0);
  return (
    <div>
      {unpaidEnrollments.map((e) => (
        <button
          key={e.id}
          onClick={() => payOutstanding([e])}
          data-testid={`button-pay-unpaid-enrollment-${e.id}`}
        >
          Pay {formatCurrency(e.effectiveBalance)}
        </button>
      ))}
      {unpaidEnrollments.length > 1 && (
        <button
          onClick={() => payOutstanding(unpaidEnrollments)}
          data-testid="button-pay-all-unpaid"
        >
          Pay All ({formatCurrency(total)})
        </button>
      )}
    </div>
  );
}

const baseEnrollment = {
  childId: 10,
  childName: 'Ava',
  className: 'Spanish 101',
  marketplaceClassId: 500,
  classType: 'regular',
  totalCost: 50_000,
  totalPaid: 25_000,
  enrollmentDate: '2026-01-01T00:00:00Z',
  status: 'pending_payment',
  paymentStatus: 'pending',
};

describe('Task 182: Pay Outstanding CTAs (UI-level)', () => {
  beforeEach(() => {
    mockAddItem.mockReset();
    mockOpenCart.mockReset();
    mockCartItems = [];
  });

  it('Dashboard CTA renders the credits-aware net amount and pays through the cart', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 1, effectiveBalance: 12_500 },
      ]);
      qc.setQueryData(['/api/parent/credits'], { totalAvailableCents: 2_500 });
    });

    render(<DashboardCTAHarness />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-dashboard');
    expect(btn).toHaveTextContent('Pay $100.00');
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem.mock.calls[0][0]).toMatchObject({
      enrollmentId: 1,
      price: 12_500,
      remainingBalance: 12_500,
    });
    expect(mockAddItem.mock.calls[0][1]).toBe(true);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('Dashboard CTA does not render when there is no outstanding balance', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 1, effectiveBalance: 0 },
      ]);
    });

    render(<DashboardCTAHarness />, { wrapper });
    expect(
      screen.queryByTestId('button-pay-outstanding-dashboard'),
    ).not.toBeInTheDocument();
  });

  it('Overview CTA shows the disabled "Loading..." state while enrollments are loading', () => {
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };

    render(<OverviewCTAHarness />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-overview');
    expect(btn).toHaveTextContent('Loading...');
    expect(btn).toBeDisabled();
  });

  it('Overview CTA stays hidden when there is genuinely $0 outstanding (no membership false-positive)', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], []);
      qc.setQueryData(['/api/parent/credits'], { totalAvailableCents: 0 });
    });

    render(<OverviewCTAHarness />, { wrapper });
    expect(
      screen.queryByTestId('button-pay-outstanding-overview'),
    ).not.toBeInTheDocument();
  });

  it('Overview CTA renders enrollment-only Pay amount and pays through the cart', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 9, effectiveBalance: 9_900 },
      ]);
    });

    render(<OverviewCTAHarness />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-overview');
    expect(btn).toHaveTextContent('Pay $99.00');
    fireEvent.click(btn);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 9, price: 9_900 }),
      true,
    );
  });

  it('"What you owe" renders one Pay button per enrollment plus a Pay All when >1', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 1, effectiveBalance: 12_500 },
        {
          ...baseEnrollment,
          id: 2,
          marketplaceClassId: 501,
          className: 'Math',
          effectiveBalance: 7_500,
        },
      ]);
    });

    render(<WhatYouOweHarness />, { wrapper });

    const payOne = screen.getByTestId('button-pay-unpaid-enrollment-1');
    const payTwo = screen.getByTestId('button-pay-unpaid-enrollment-2');
    const payAll = screen.getByTestId('button-pay-all-unpaid');

    expect(payOne).toHaveTextContent('Pay $125.00');
    expect(payTwo).toHaveTextContent('Pay $75.00');
    expect(payAll).toHaveTextContent('Pay All ($200.00)');

    fireEvent.click(payOne);
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem.mock.calls[0][0]).toMatchObject({ enrollmentId: 1 });
    expect(mockOpenCart).toHaveBeenCalledTimes(1);

    mockAddItem.mockClear();
    mockOpenCart.mockClear();
    fireEvent.click(payAll);
    expect(mockAddItem).toHaveBeenCalledTimes(2);
    expect(mockAddItem.mock.calls.map((c) => c[0].enrollmentId).sort()).toEqual([
      1, 2,
    ]);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('"What you owe" hides the Pay All button when only one enrollment is unpaid', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 1, effectiveBalance: 5_000 },
      ]);
    });

    render(<WhatYouOweHarness />, { wrapper });
    expect(screen.getByTestId('button-pay-unpaid-enrollment-1')).toBeInTheDocument();
    expect(screen.queryByTestId('button-pay-all-unpaid')).not.toBeInTheDocument();
  });
});
