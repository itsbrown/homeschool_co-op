// Regression: do not show "biweekly" when the date window collapses to one payment
// (same headline amount as pay-in-full).

const mockGetClassById = jest.fn();
const mockResolveCartProgramDateSpan = jest.fn();

jest.mock('../db', () => ({
  getDb: jest.fn().mockRejectedValue(new Error('test: db disabled')),
}));

jest.mock('../lib/cart-program-dates', () => ({
  resolveCartProgramDateSpan: (...args: unknown[]) => mockResolveCartProgramDateSpan(...args),
}));

jest.mock('../storage', () => ({
  storage: {
    getClassById: mockGetClassById,
  },
}));

import {
  assertBiweeklyPlanMatchesCheckout,
  getExpectedBiweeklyCheckout,
  GOLDEN_BIWEEKLY_CHECKOUT,
} from '../lib/biweekly-checkout-contract';
import { calculatePaymentPlans } from '../utils/cart-pricing';

describe('calculatePaymentPlans', () => {
  beforeEach(() => {
    mockGetClassById.mockReset();
    mockResolveCartProgramDateSpan.mockReset();
  });

  it('returns only full plan when the biweekly window is shorter than one interval', async () => {
    mockResolveCartProgramDateSpan.mockResolvedValue({
      earliestStartDate: new Date('2030-01-01'),
      latestEndDate: new Date('2030-01-10'),
    });
    const plans = await calculatePaymentPlans(391500, [
      { id: 'i1', classId: 1, childId: 1, childName: 'Test' },
    ]);
    expect(plans.map((p) => p.id)).toEqual(['full']);
  });

  it('includes biweekly when the program span supports multiple installments', async () => {
    mockResolveCartProgramDateSpan.mockResolvedValue({
      earliestStartDate: new Date('2030-01-01'),
      latestEndDate: new Date('2030-06-01'),
    });
    const plans = await calculatePaymentPlans(391500, [
      { id: 'i1', classId: 1, childId: 1, childName: 'Test' },
    ]);
    expect(plans.map((p) => p.id)).toEqual(['full', 'biweekly']);
    const biweekly = plans.find((p) => p.id === 'biweekly');
    expect(biweekly).toBeDefined();
    expect(biweekly!.numberOfPayments).toBeGreaterThanOrEqual(2);
    expect(biweekly!.amount).toBeLessThan(391500);
  });

  it('biweekly plan matches golden checkout contract when span uses golden dates', async () => {
    mockResolveCartProgramDateSpan.mockResolvedValue({
      earliestStartDate: GOLDEN_BIWEEKLY_CHECKOUT.programStart,
      latestEndDate: GOLDEN_BIWEEKLY_CHECKOUT.programEnd,
    });
    const expected = getExpectedBiweeklyCheckout();
    const plans = await calculatePaymentPlans(GOLDEN_BIWEEKLY_CHECKOUT.totalAmountCents, [
      { id: 'i1', childId: 1, childName: 'Test', sessionId: 1 },
    ]);
    const biweekly = plans.find((p) => p.id === 'biweekly');
    expect(biweekly).toBeDefined();
    assertBiweeklyPlanMatchesCheckout(
      {
        id: 'biweekly',
        amount: biweekly!.amount,
        numberOfPayments: biweekly!.numberOfPayments!,
        totalAmount: biweekly!.totalAmount!,
        finalPaymentAmount: biweekly!.finalPaymentAmount!,
      },
      expected,
    );
  });
});
