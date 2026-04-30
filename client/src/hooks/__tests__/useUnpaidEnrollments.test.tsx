import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useUnpaidEnrollments,
  usePayOutstanding,
  type UnpaidEnrollment,
} from '@/hooks/useUnpaidEnrollments';

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

function makeWrapper(seedQueries: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
  seedQueries(qc);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const baseEnrollment = {
  childId: 10,
  childName: 'Ava',
  className: 'Spanish 101',
  marketplaceClassId: 500,
  classId: null,
  classType: 'regular',
  totalCost: 50_000,
  totalPaid: 25_000,
  enrollmentDate: '2026-01-01T00:00:00Z',
  status: 'pending_payment',
  paymentStatus: 'pending',
};

describe('useUnpaidEnrollments', () => {
  beforeEach(() => {
    mockAddItem.mockReset();
    mockOpenCart.mockReset();
    mockCartItems = [];
  });

  it('returns enrollments with effectiveBalance > 0 and credits-aware totals', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        { ...baseEnrollment, id: 1, effectiveBalance: 12_500 },
        { ...baseEnrollment, id: 2, marketplaceClassId: 501, effectiveBalance: 0 },
      ]);
      qc.setQueryData(['/api/parent/credits'], { totalAvailableCents: 5_000 });
    });

    const { result } = renderHook(() => useUnpaidEnrollments(), { wrapper });

    expect(result.current.unpaidEnrollments).toHaveLength(1);
    expect(result.current.unpaidEnrollments[0].id).toBe(1);
    expect(result.current.totalOutstandingCents).toBe(12_500);
    expect(result.current.creditsCents).toBe(5_000);
    expect(result.current.netDueCents).toBe(7_500);
    expect(result.current.showCreditsLine).toBe(true);
  });

  it('uses effectiveBalance even when remainingBalance is 0 (Stripe-managed plans)', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        {
          ...baseEnrollment,
          id: 7,
          effectiveBalance: 9_900,
          remainingBalance: 0,
          paymentSystemVersion: 'v2_stripe',
        },
      ]);
    });

    const { result } = renderHook(() => useUnpaidEnrollments(), { wrapper });

    expect(result.current.unpaidEnrollments).toHaveLength(1);
    expect(result.current.totalOutstandingCents).toBe(9_900);
  });

  it('selects every enrollment with effectiveBalance > 0 without suppressing paid siblings', () => {
    const wrapper = makeWrapper((qc) => {
      qc.setQueryData(['/api/parent/enrollments'], [
        {
          ...baseEnrollment,
          id: 1,
          effectiveBalance: 0,
          status: 'enrolled',
          paymentStatus: 'completed',
        },
        {
          ...baseEnrollment,
          id: 2,
          effectiveBalance: 5_000,
        },
        {
          ...baseEnrollment,
          id: 3,
          marketplaceClassId: 999,
          effectiveBalance: 8_000,
        },
      ]);
    });

    const { result } = renderHook(() => useUnpaidEnrollments(), { wrapper });

    expect(result.current.unpaidEnrollments.map((e) => e.id).sort()).toEqual([2, 3]);
    expect(result.current.totalOutstandingCents).toBe(13_000);
  });
});

describe('usePayOutstanding', () => {
  beforeEach(() => {
    mockAddItem.mockReset();
    mockOpenCart.mockReset();
    mockCartItems = [];
  });

  function wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  const enrollment: UnpaidEnrollment = {
    id: 42,
    childId: 10,
    childName: 'Ava',
    className: 'Spanish 101',
    classId: 500,
    marketplaceClassId: 500,
    classType: 'regular',
    effectiveBalance: 12_500,
    totalCost: 50_000,
    totalPaid: 37_500,
    compAmountCents: 0,
    depositRequired: 0,
    paymentSystemVersion: 'v1',
  };

  it('adds enrollment to cart with skipValidation=true and opens the drawer', () => {
    const { result } = renderHook(() => usePayOutstanding(), { wrapper });

    act(() => {
      result.current([enrollment]);
    });

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    const [item, skipValidation] = mockAddItem.mock.calls[0];
    expect(item).toMatchObject({
      enrollmentId: 42,
      classId: 500,
      childId: 10,
      price: 12_500,
      remainingBalance: 12_500,
      status: 'pending_payment',
    });
    expect(skipValidation).toBe(true);
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('dedupes against existing cart items with the same enrollmentId', () => {
    mockCartItems = [{ enrollmentId: 42 }];

    const { result } = renderHook(() => usePayOutstanding(), { wrapper });

    act(() => {
      result.current([enrollment]);
    });

    expect(mockAddItem).not.toHaveBeenCalled();
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });

  it('skips enrollments with non-positive effectiveBalance', () => {
    const { result } = renderHook(() => usePayOutstanding(), { wrapper });

    act(() => {
      result.current([{ ...enrollment, effectiveBalance: 0 }]);
    });

    expect(mockAddItem).not.toHaveBeenCalled();
    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });
});
