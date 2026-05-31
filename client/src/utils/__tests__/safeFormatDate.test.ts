import { safeFormatDate } from '../safeFormatDate';

describe('safeFormatDate', () => {
  it('formats valid ISO strings', () => {
    expect(safeFormatDate('2026-06-11T12:00:00.000Z', 'MMM d, yyyy')).toBe('Jun 11, 2026');
  });

  it('returns fallback for invalid dates', () => {
    expect(safeFormatDate('not-a-date', 'MMM d, yyyy')).toBe('—');
    expect(safeFormatDate(null, 'MMM d, yyyy', 'N/A')).toBe('N/A');
  });
});
