import { splitIntegerEvenly, splitAmountAcrossEnrollments } from '../lib/splitIntegerEvenly';

describe('splitIntegerEvenly', () => {
  describe('basic splitting', () => {
    test('splits evenly when divisible', () => {
      expect(splitIntegerEvenly(100, 4)).toEqual([25, 25, 25, 25]);
      expect(splitIntegerEvenly(300, 3)).toEqual([100, 100, 100]);
    });

    test('distributes remainder to first parts', () => {
      expect(splitIntegerEvenly(100, 3)).toEqual([34, 33, 33]);
      expect(splitIntegerEvenly(10, 3)).toEqual([4, 3, 3]);
      expect(splitIntegerEvenly(7, 3)).toEqual([3, 2, 2]);
    });

    test('handles single part', () => {
      expect(splitIntegerEvenly(100, 1)).toEqual([100]);
      expect(splitIntegerEvenly(1, 1)).toEqual([1]);
    });

    test('handles zero total', () => {
      expect(splitIntegerEvenly(0, 5)).toEqual([0, 0, 0, 0, 0]);
      expect(splitIntegerEvenly(0, 1)).toEqual([0]);
    });

    test('handles large numbers', () => {
      const result = splitIntegerEvenly(1000000, 7);
      expect(result.reduce((a, b) => a + b, 0)).toBe(1000000);
      expect(result.length).toBe(7);
    });
  });

  describe('sum integrity', () => {
    test('sum always equals total', () => {
      const testCases = [
        { total: 100, parts: 3 },
        { total: 99, parts: 7 },
        { total: 1, parts: 10 },
        { total: 12345, parts: 13 },
        { total: 50000, parts: 17 },
      ];

      for (const { total, parts } of testCases) {
        const result = splitIntegerEvenly(total, parts);
        const sum = result.reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
        expect(result.length).toBe(parts);
      }
    });
  });

  describe('error handling', () => {
    test('throws on negative total', () => {
      expect(() => splitIntegerEvenly(-1, 3)).toThrow('total must be non-negative integer');
    });

    test('throws on non-integer total', () => {
      expect(() => splitIntegerEvenly(10.5, 3)).toThrow('total must be non-negative integer');
    });

    test('throws on zero parts', () => {
      expect(() => splitIntegerEvenly(100, 0)).toThrow('parts must be positive integer');
    });

    test('throws on negative parts', () => {
      expect(() => splitIntegerEvenly(100, -1)).toThrow('parts must be positive integer');
    });

    test('throws on non-integer parts', () => {
      expect(() => splitIntegerEvenly(100, 2.5)).toThrow('parts must be positive integer');
    });
  });
});

describe('splitAmountAcrossEnrollments', () => {
  test('splits amount across enrollment IDs', () => {
    const result = splitAmountAcrossEnrollments(100, [1, 2, 3]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 34 },
      { enrollmentId: 2, amountCents: 33 },
      { enrollmentId: 3, amountCents: 33 },
    ]);
  });

  test('handles single enrollment', () => {
    const result = splitAmountAcrossEnrollments(500, [42]);
    expect(result).toEqual([
      { enrollmentId: 42, amountCents: 500 },
    ]);
  });

  test('handles empty enrollments', () => {
    const result = splitAmountAcrossEnrollments(100, []);
    expect(result).toEqual([]);
  });

  test('preserves enrollment ID order', () => {
    const result = splitAmountAcrossEnrollments(10, [99, 1, 50]);
    expect(result.map(r => r.enrollmentId)).toEqual([99, 1, 50]);
  });

  test('sum of amounts equals total', () => {
    const result = splitAmountAcrossEnrollments(12345, [1, 2, 3, 4, 5, 6, 7]);
    const sum = result.reduce((a, r) => a + r.amountCents, 0);
    expect(sum).toBe(12345);
  });
});
