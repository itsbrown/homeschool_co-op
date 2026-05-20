const mockGetClassById = jest.fn();
const mockGetProgramEnrollmentById = jest.fn();
const mockDbSelect = jest.fn();

jest.mock('../db', () => ({
  getDb: jest.fn().mockResolvedValue({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbSelect(),
        }),
      }),
    }),
  }),
}));

jest.mock('../storage', () => ({
  storage: {
    getClassById: mockGetClassById,
    getProgramEnrollmentById: mockGetProgramEnrollmentById,
  },
}));

import {
  resolveCartItemProgramDates,
  resolveCartProgramDateSpan,
} from '../lib/cart-program-dates';
import type { CartItem } from '../utils/cart-pricing';

describe('cart-program-dates', () => {
  beforeEach(() => {
    mockGetClassById.mockReset();
    mockGetProgramEnrollmentById.mockReset();
    mockDbSelect.mockReset();
  });

  it('uses session end date when sessionId is set (F001)', async () => {
    mockDbSelect.mockResolvedValue([
      { startDate: '2030-03-01', endDate: '2030-08-15' },
    ]);
    const item: CartItem = {
      id: 's1',
      childId: 1,
      childName: 'Kid',
      sessionId: 42,
    };
    const dates = await resolveCartItemProgramDates(item);
    expect(dates.startDate).toEqual(new Date('2030-03-01'));
    expect(dates.endDate).toEqual(new Date('2030-08-15'));
  });

  it('aggregates latest session end across cart lines', async () => {
    mockDbSelect
      .mockResolvedValueOnce([{ startDate: '2030-01-01', endDate: '2030-05-01' }])
      .mockResolvedValueOnce([{ startDate: '2030-02-01', endDate: '2030-09-01' }]);
    const items: CartItem[] = [
      { id: 'a', childId: 1, childName: 'A', sessionId: 1 },
      { id: 'b', childId: 2, childName: 'B', sessionId: 2 },
    ];
    const span = await resolveCartProgramDateSpan(items);
    expect(span.earliestStartDate).toEqual(new Date('2030-01-01'));
    expect(span.latestEndDate).toEqual(new Date('2030-09-01'));
  });

  it('prefers session dates over class dates when both exist', async () => {
    mockDbSelect.mockResolvedValue([
      { startDate: '2030-06-01', endDate: '2030-12-01' },
    ]);
    mockGetClassById.mockResolvedValue({
      id: 9,
      startDate: '2030-01-01',
      endDate: '2030-03-01',
    });
    const dates = await resolveCartItemProgramDates({
      id: 'x',
      childId: 1,
      childName: 'Kid',
      sessionId: 5,
      classId: 9,
    });
    expect(dates.endDate).toEqual(new Date('2030-12-01'));
  });
});
