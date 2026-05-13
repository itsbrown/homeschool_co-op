// Regression: do not show "biweekly" when the date window collapses to one payment
// (same headline amount as pay-in-full).

const mockGetClassById = jest.fn();

jest.mock('../db', () => ({
  getDb: jest.fn().mockRejectedValue(new Error('test: db disabled')),
}));

jest.mock('../storage', () => ({
  storage: {
    getClassById: mockGetClassById,
  },
}));

import { calculatePaymentPlans } from '../utils/cart-pricing';

describe('calculatePaymentPlans', () => {
  beforeEach(() => {
    mockGetClassById.mockReset();
  });

  it('returns only full plan when the biweekly window is shorter than one interval', async () => {
    mockGetClassById.mockResolvedValue({
      id: 1,
      startDate: '2030-01-01',
      endDate: '2030-01-10',
    });
    const plans = await calculatePaymentPlans(391500, [
      { id: 'i1', classId: 1, childId: 1, childName: 'Test' },
    ]);
    expect(plans.map((p) => p.id)).toEqual(['full']);
  });

  it('includes biweekly when the class span supports multiple installments', async () => {
    mockGetClassById.mockResolvedValue({
      id: 1,
      startDate: '2030-01-01',
      endDate: '2030-06-01',
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
});
