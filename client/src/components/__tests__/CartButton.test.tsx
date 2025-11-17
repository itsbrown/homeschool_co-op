import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CartButton from '../cart/CartButton';

// Mock CartContext
const mockUseCart = jest.fn();
jest.mock('@/contexts/CartContext', () => ({
  useCart: () => mockUseCart(),
}));

// Mock SupabaseProvider
jest.mock('@/components/SupabaseProvider', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com' },
    isAuthenticated: true,
  }),
}));

// Mock wouter
jest.mock('wouter', () => ({
  useLocation: () => ['/', jest.fn()],
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('CartButton', () => {
  beforeEach(() => {
    mockUseCart.mockReturnValue({
      cart: {
        items: [],
        subtotal: 0,
        total: 0,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0,
        },
      },
      isOpen: false,
      openCart: jest.fn(),
      closeCart: jest.fn(),
      getItemCount: jest.fn(() => 0),
    });
  });

  it('should render cart icon with correct item count', () => {
    mockUseCart.mockReturnValue({
      cart: {
        items: [
          { id: '1', className: 'Test', childName: 'Child', price: 100 },
          { id: '2', className: 'Test 2', childName: 'Child 2', price: 200 },
        ],
        subtotal: 300,
        total: 300,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0,
        },
      },
      isOpen: false,
      openCart: jest.fn(),
      closeCart: jest.fn(),
      getItemCount: jest.fn(() => 2),
    });

    render(<CartButton />, { wrapper: createWrapper() });

    // Check that the count badge appears with correct number
    const badge = screen.getByText('2');
    expect(badge).toBeInTheDocument();
  });

  it('should not show badge when cart is empty', () => {
    mockUseCart.mockReturnValue({
      cart: {
        items: [],
        subtotal: 0,
        total: 0,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0,
        },
      },
      isOpen: false,
      openCart: jest.fn(),
      closeCart: jest.fn(),
      getItemCount: jest.fn(() => 0),
    });

    render(<CartButton />, { wrapper: createWrapper() });

    // Badge should not appear when count is 0
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should display correct count for 4 items', () => {
    const mockItems = [
      { id: '1', className: 'Test 1', childName: 'Child 1', price: 100 },
      { id: '2', className: 'Test 2', childName: 'Child 2', price: 200 },
      { id: '3', className: 'Test 3', childName: 'Child 3', price: 300 },
      { id: '4', className: 'Test 4', childName: 'Child 4', price: 400 },
    ];

    mockUseCart.mockReturnValue({
      cart: {
        items: mockItems,
        subtotal: 1000,
        total: 1000,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0,
        },
      },
      isOpen: false,
      openCart: jest.fn(),
      closeCart: jest.fn(),
      getItemCount: jest.fn(() => 4),
    });

    render(<CartButton />, { wrapper: createWrapper() });

    const badge = screen.getByText('4');
    expect(badge).toBeInTheDocument();
  });
});
