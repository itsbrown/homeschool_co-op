import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('@/hooks/useParentCredits', () => ({
  useParentCredits: () => ({
    totalAvailableCents: 0,
    creditsData: undefined,
    isLoading: false,
    error: null as Error | null,
  }),
}));

import ParentDashboard from '@/components/dashboards/ParentDashboard';

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
  qc.setQueryData(['parent-credits'], {
    user: { id: 1, name: '', email: 'p@example.com' },
    schoolId: null,
    credits: [],
    availableCredits: [],
    totalAvailableCents: 0,
  });
}

describe('Task 182: Pay Outstanding CTAs (integration)', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    mockAddItem.mockReset();
    mockOpenCart.mockReset();
    mockCartItems = [];

    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/api/cart/calculate')) {
        try {
          const body = init?.body ? JSON.parse(String(init.body)) : { items: [] as unknown[] };
          const total = (body.items as Array<{ remainingBalance?: number }>).reduce(
            (s, i) => s + (typeof i.remainingBalance === 'number' ? i.remainingBalance : 0),
            0,
          );
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                total,
                subtotal: total,
                discounts: {
                  totalDiscountAmount: 0,
                  siblingDiscount: 0,
                  freeAfterThree: 0,
                  appliedDiscounts: [],
                },
              }),
          }) as Promise<Response>;
        } catch {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ total: 0 }),
          }) as Promise<Response>;
        }
      }
      if (typeof origFetch === 'function') {
        return origFetch(input as RequestInfo, init);
      }
      return Promise.reject(new Error(`Unmocked fetch: ${url}`));
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('ParentDashboard renders the Pay Now CTA with the credits-aware amount and routes the click into the cart', async () => {
    const wrapper = makeWrapper(seedParentQueries);

    render(<ParentDashboard />, { wrapper });

    const btn = screen.getByTestId('button-pay-outstanding-dashboard');
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveTextContent('Pay $500.00');

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
});
