import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider, useCart } from '../CartContext';

// Mock dependencies
jest.mock('@/components/SupabaseProvider', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

jest.mock('@/contexts/RoleContext', () => ({
  useRole: () => ({
    activeRole: 'parent',
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock fetch for API calls
global.fetch = jest.fn() as jest.Mock;

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
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Cart Hydration', () => {
    it('should skip localStorage hydration for authenticated parents', async () => {
      // Mock API response with enrollments
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      // Initially, cart should be empty and not hydrated
      expect(result.current.cart.items).toHaveLength(0);
      expect(result.current.cartHydrated).toBe(false);

      // Wait for API call to complete
      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      // Verify localStorage was not used for hydration
      expect(localStorage.getItem('asa_cart_test@example.com')).toBeNull();
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
          child: { firstName: 'Test', lastName: 'Child' },
          marketplaceClass: { name: 'Test Class' },
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEnrollments,
      });

      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      expect(result.current.cartHydrated).toBe(false);

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      // Cart should have processed the enrollment
      expect(result.current.cart.items.length).toBeGreaterThan(0);
    });
  });

  describe('Cart Operations', () => {
    it('should calculate correct item count', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.cartHydrated).toBe(true);
      });

      expect(result.current.getItemCount()).toBe(0);
    });

    it('should clear cart correctly', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

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
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

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
});
