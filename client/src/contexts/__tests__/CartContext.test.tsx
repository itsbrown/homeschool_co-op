import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { CartProvider, useCart } from '../CartContext';

const mockAuthState = {
  user: { email: 'test@example.com' } as { email: string } | null,
  isAuthenticated: true,
  isLoading: false,
  session: { access_token: 'test-access-token' } as { access_token: string } | null,
};

const mockUseAuth = jest.fn(() => mockAuthState);

jest.mock('@/lib/analytics', () => ({
  trackAddToCart: jest.fn(),
  trackRemoveFromCart: jest.fn(),
  trackViewCart: jest.fn(),
}));

jest.mock('@/components/SupabaseProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/RoleContext', () => ({
  useRole: () => ({
    activeRole: 'parent',
    availableRoles: [{ role: 'parent' }],
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

function mockFetchJson(body: unknown = []) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CartProvider>{children}</CartProvider>
    </QueryClientProvider>
  );
};

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockAuthState.user = { email: 'test@example.com' };
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;
    mockAuthState.session = { access_token: 'test-access-token' };
    mockUseAuth.mockImplementation(() => mockAuthState);
    global.fetch = jest.fn(() => mockFetchJson([])) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    queryClient.clear();
  });

  describe('Cart Hydration', () => {
    it('should not hydrate cart line items from stale localStorage for authenticated parents', async () => {
      localStorage.setItem(
        'asa_cart_test@example.com',
        JSON.stringify({
          items: [
            {
              id: 'stale-1',
              childId: 99,
              classId: 99,
              className: 'Stale Class',
              childName: 'Stale Child',
              price: 9999,
              status: 'pending_payment',
            },
          ],
          subtotal: 9999,
          total: 9999,
          discounts: {
            siblingDiscount: 0,
            freeAfterThree: 0,
            appliedDiscounts: [],
            totalDiscountAmount: 0,
          },
          membership: null,
          appliedPromoCode: null,
        }),
      );

      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      expect(result.current.cart.items).toHaveLength(0);
    });

    it('should set cartHydrated to true after API loads data', async () => {
      const mockEnrollments = [
        {
          id: 1,
          schoolId: 1,
          childId: 1,
          classType: 'marketplace',
          marketplaceClassId: 1,
          price: 100,
          status: 'pending_payment',
          amountPaid: 0,
          effectiveBalance: 100,
          child: { firstName: 'Test', lastName: 'Child' },
          marketplaceClass: { name: 'Test Class' },
        },
      ];

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes('/api/parent/enrollments')) {
          return mockFetchJson(mockEnrollments);
        }
        return mockFetchJson([]);
      });

      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      expect(result.current.cartHydrated).toBe(false);

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      expect(result.current.cart.items.length).toBeGreaterThan(0);
    });
  });

  describe('Cart Operations', () => {
    it('should calculate correct item count', async () => {
      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      expect(result.current.getItemCount()).toBe(0);
    });

    it('should clear cart correctly', async () => {
      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      result.current.clearCart();

      expect(result.current.cart.items).toHaveLength(0);
      expect(result.current.cart.total).toBe(0);
    });
  });

  describe('RefreshCart', () => {
    it('should return a Promise when called', async () => {
      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      const refreshPromise = result.current.refreshCart();
      expect(refreshPromise).toBeInstanceOf(Promise);
      await refreshPromise;
    });
  });

  describe('Logout cache handling', () => {
    it('clears the shared parent enrollments query cache on logout', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <CartProvider>{children}</CartProvider>
        </QueryClientProvider>
      );

      const { rerender } = renderHook(() => useCart(), { wrapper });

      await waitFor(() => {
        expect(queryClient.getQueryData(['/api/parent/enrollments'])).toBeDefined();
      });

      queryClient.setQueryData(['/api/parent/enrollments'], [{ id: 123 }]);

      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        session: null,
      });
      rerender();

      await waitFor(() => {
        expect(queryClient.getQueryData(['/api/parent/enrollments'])).toEqual([]);
      });
    });
  });
});
