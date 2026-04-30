import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockAddItem = jest.fn();
const mockOpenCart = jest.fn();
let mockCartItems: Array<{ enrollmentId?: number | null }> = [];

jest.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    cart: { items: mockCartItems },
    addItem: mockAddItem,
    openCart: mockOpenCart,
    isOpen: false,
    closeCart: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
  }),
}));

jest.mock('@/components/SupabaseProvider', () => ({
  useAuth: () => ({
    user: { id: 'parent-1', email: 'p@example.com' },
    session: { access_token: 'test-token' },
    isAuthenticated: true,
    loading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
  useSupabaseAuth: () => ({
    user: { id: 'parent-1', email: 'p@example.com' },
    session: { access_token: 'test-token' },
    isAuthenticated: true,
    loading: false,
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
  toast: jest.fn(),
}));

jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

jest.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve(null),
}));

jest.mock('@/config/stripe', () => ({
  stripePromise: Promise.resolve(null),
}));

jest.mock('@/components/onboarding/OnboardingTour', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/calendar/ParentCalendarView', () => ({
  __esModule: true,
  default: () => null,
}));

import ParentDashboard from '@/components/dashboards/ParentDashboard';
import PaymentManagement from '@/components/payments/PaymentManagement';

const fixtureEnrollment = {
  id: 4242,
  childId: 11,
  childName: 'Ava Smith',
  className: 'Spanish 101',
  marketplaceClassId: 700,
  classType: 'regular',
  totalCost: 50_000,
  totalPaid: 0,
  effectiveBalance: 50_000,
  remainingBalance: 0,
  paymentSystemVersion: 'v1',
  status: 'pending_payment',
  paymentStatus: 'pending',
  enrollmentDate: '2026-01-15T00:00:00Z',
};

function makeWrapper(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  });
  seed(qc);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedParentQueries(qc: QueryClient) {
  qc.setQueryData(['/api/parent/enrollments'], [fixtureEnrollment]);
  qc.setQueryData(['/api/parent/credits'], { totalAvailableCents: 0 });
  qc.setQueryData(['/api/parent/children'], []);
  qc.setQueryData(['/api/parent/classes'], []);
  qc.setQueryData(['/api/parent/memberships'], []);
  qc.setQueryData(['/api/parent/membership-status'], { memberships: [] });
  qc.setQueryData(['/api/parent/upcoming-payments'], []);
  qc.setQueryData(['/api/payment-history', 'history'], {
    success: true,
    payments: [],
  });
  qc.setQueryData(['/api/scheduled-payments'], []);
  qc.setQueryData(['/api/scheduled-payments/upcoming'], []);
  qc.setQueryData(['/api/scheduled-payments/grouped'], []);
  qc.setQueryData(['/api/parent/credits/usage-history'], []);
  qc.setQueryData(['/api/parent/discounts/active'], []);
  qc.setQueryData(['/api/notifications'], []);
  qc.setQueryData(['/api/announcements'], []);
  qc.setQueryData(['/api/parent/fundraiser-links'], []);
  qc.setQueryData(['/api/parent/fundraiser-orders'], []);
  qc.setQueryData(['/api/parent/auto-pay'], { enabled: false });
}

describe('Task 182: Pay Outstanding CTAs (integration)', () => {
  beforeEach(() => {
    mockAddItem.mockReset();
    mockOpenCart.mockReset();
    mockCartItems = [];
  });

  it('ParentDashboard renders the Pay Now CTA with the credits-aware amount and routes the click into the cart', () => {
    const wrapper = makeWrapper(seedParentQueries);

    render(<ParentDashboard />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-dashboard');
    expect(btn).toHaveTextContent('Pay $500.00');
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem.mock.calls[0][0]).toMatchObject({
      enrollmentId: 4242,
      childId: 11,
      price: 50_000,
      remainingBalance: 50_000,
      status: 'pending_payment',
    });
    expect(mockAddItem.mock.calls[0][1]).toBe(true);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('PaymentManagement Overview tab renders the Pay Now CTA and routes the click into the cart', () => {
    const wrapper = makeWrapper(seedParentQueries);

    render(<PaymentManagement defaultTab="overview" />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-overview');
    expect(btn).toHaveTextContent('Pay $500.00');
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 4242, price: 50_000 }),
      true,
    );
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('PaymentManagement Upcoming Payments tab renders "What you owe" with a per-row Pay Now CTA', () => {
    const wrapper = makeWrapper(seedParentQueries);

    render(<PaymentManagement defaultTab="upcoming" />, { wrapper });

    const card = screen.getByTestId('card-what-you-owe');
    const btn = within(card).getByTestId('button-pay-unpaid-enrollment-4242');
    expect(btn).toBeInTheDocument();
    expect(card).toHaveTextContent('$500.00');

    // Single unpaid enrollment → no "Pay All" button.
    expect(screen.queryByTestId('button-pay-all-unpaid')).not.toBeInTheDocument();

    fireEvent.click(btn);

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 4242, price: 50_000 }),
      true,
    );
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('PaymentManagement Upcoming tab shows "Pay All" when there is more than one unpaid enrollment', () => {
    const wrapper = makeWrapper((qc) => {
      seedParentQueries(qc);
      qc.setQueryData(['/api/parent/enrollments'], [
        fixtureEnrollment,
        {
          ...fixtureEnrollment,
          id: 4243,
          marketplaceClassId: 701,
          className: 'Math',
          effectiveBalance: 25_000,
          totalCost: 25_000,
        },
      ]);
    });

    render(<PaymentManagement defaultTab="upcoming" />, { wrapper });

    expect(screen.getByTestId('button-pay-unpaid-enrollment-4242')).toBeInTheDocument();
    expect(screen.getByTestId('button-pay-unpaid-enrollment-4243')).toBeInTheDocument();
    const payAll = screen.getByTestId('button-pay-all-unpaid');
    expect(payAll).toHaveTextContent('Pay All ($750.00)');

    fireEvent.click(payAll);

    expect(mockAddItem).toHaveBeenCalledTimes(2);
    expect(
      mockAddItem.mock.calls.map((c) => c[0].enrollmentId).sort(),
    ).toEqual([4242, 4243]);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });
});
