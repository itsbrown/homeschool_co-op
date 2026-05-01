import {
  splitIntegerEvenly,
  splitAmountAcrossEnrollments,
  allocatePaymentByBalance,
} from '../lib/splitIntegerEvenly';

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

describe('allocatePaymentByBalance', () => {
  const sumCents = (rows: { amountCents: number }[]) =>
    rows.reduce((s, r) => s + r.amountCents, 0);

  test('returns empty array for empty input', () => {
    expect(allocatePaymentByBalance(1000, [])).toEqual([]);
  });

  test('returns zeros when totalCents is 0', () => {
    const result = allocatePaymentByBalance(0, [
      { enrollmentId: 1, effectiveBalanceCents: 5000 },
      { enrollmentId: 2, effectiveBalanceCents: 7000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 0 },
      { enrollmentId: 2, amountCents: 0 },
    ]);
  });

  test('Puccia regression: skips already-paid enrollments and pays both owing lines $1,360 each', () => {
    // March 25 2026 incident: $2,720 payment was even-split across 4
    // enrollments — including 2 that were already fully paid — leaving a
    // $1,240 phantom outstanding. The balance-aware allocator must:
    //   - allocate $0 to the two fully-paid lines
    //   - pay each owing $1,300 line in full
    //   - split the $120 leftover evenly across the two tied largest
    //     balances → $60 each → [$0, $0, $1,360, $1,360]
    expect(
      allocatePaymentByBalance(272000, [
        { enrollmentId: 187, effectiveBalanceCents: 0 },
        { enrollmentId: 188, effectiveBalanceCents: 0 },
        { enrollmentId: 381, effectiveBalanceCents: 130000 },
        { enrollmentId: 382, effectiveBalanceCents: 130000 },
      ]),
    ).toEqual([
      { enrollmentId: 187, amountCents: 0 },
      { enrollmentId: 188, amountCents: 0 },
      { enrollmentId: 381, amountCents: 136000 },
      { enrollmentId: 382, amountCents: 136000 },
    ]);
  });

  test('overpayment with a single largest balance dumps the full leftover on that line', () => {
    // Pay $300 against $50 + $150 owed (sum $200) → both owing lines get
    // their full balance, and the $100 leftover lands entirely on the
    // larger ($150) balance.
    const result = allocatePaymentByBalance(30000, [
      { enrollmentId: 1, effectiveBalanceCents: 5000 },
      { enrollmentId: 2, effectiveBalanceCents: 15000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 5000 },
      { enrollmentId: 2, amountCents: 25000 },
    ]);
    expect(sumCents(result)).toBe(30000);
  });

  test('exact full payment fills each owing balance precisely', () => {
    const result = allocatePaymentByBalance(15000, [
      { enrollmentId: 1, effectiveBalanceCents: 5000 },
      { enrollmentId: 2, effectiveBalanceCents: 10000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 5000 },
      { enrollmentId: 2, amountCents: 10000 },
    ]);
  });

  test('proportional split when payment is less than total owed', () => {
    // $100 across balances of $50 and $150 → 25/75
    const result = allocatePaymentByBalance(10000, [
      { enrollmentId: 1, effectiveBalanceCents: 5000 },
      { enrollmentId: 2, effectiveBalanceCents: 15000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 2500 },
      { enrollmentId: 2, amountCents: 7500 },
    ]);
    expect(sumCents(result)).toBe(10000);
  });

  test('proportional split distributes remainder cents to largest fractional remainder', () => {
    // $1.00 split proportionally across balances of $1, $1, $1 with a
    // remainder of 1 cent — sum must equal $1.00 with no enrollment going
    // over its own balance.
    const result = allocatePaymentByBalance(100, [
      { enrollmentId: 1, effectiveBalanceCents: 100 },
      { enrollmentId: 2, effectiveBalanceCents: 100 },
      { enrollmentId: 3, effectiveBalanceCents: 100 },
    ]);
    expect(sumCents(result)).toBe(100);
    for (const r of result) {
      expect(r.amountCents).toBeLessThanOrEqual(100);
      expect(r.amountCents).toBeGreaterThanOrEqual(0);
    }
  });

  test('skips zero-balance lines but still pays positive ones proportionally', () => {
    const result = allocatePaymentByBalance(6000, [
      { enrollmentId: 1, effectiveBalanceCents: 0 },
      { enrollmentId: 2, effectiveBalanceCents: 4000 },
      { enrollmentId: 3, effectiveBalanceCents: 0 },
      { enrollmentId: 4, effectiveBalanceCents: 8000 },
    ]);
    expect(result.find(r => r.enrollmentId === 1)?.amountCents).toBe(0);
    expect(result.find(r => r.enrollmentId === 3)?.amountCents).toBe(0);
    // 6000 against 4000+8000 → 2000/4000 split
    expect(result.find(r => r.enrollmentId === 2)?.amountCents).toBe(2000);
    expect(result.find(r => r.enrollmentId === 4)?.amountCents).toBe(4000);
    expect(sumCents(result)).toBe(6000);
  });

  test('treats negative balances the same as zero balances', () => {
    const result = allocatePaymentByBalance(5000, [
      { enrollmentId: 1, effectiveBalanceCents: -1000 },
      { enrollmentId: 2, effectiveBalanceCents: 5000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 0 },
      { enrollmentId: 2, amountCents: 5000 },
    ]);
  });

  test('overpayment fills each owing line and dumps the leftover on the largest-balance line', () => {
    // $200 paid against $50 + $30 owed (sum $80) → both owing lines get
    // their full balance ($50 and $30), and the $120 leftover lands on
    // the larger-balance line (id 1, $50). The payment is never split
    // onto already-paid enrollments and never silently dropped.
    const result = allocatePaymentByBalance(20000, [
      { enrollmentId: 1, effectiveBalanceCents: 5000 },
      { enrollmentId: 2, effectiveBalanceCents: 3000 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 17000 },
      { enrollmentId: 2, amountCents: 3000 },
    ]);
    expect(sumCents(result)).toBe(20000);
  });

  test('overpayment with three-way tie splits leftover evenly with splitIntegerEvenly remainder distribution', () => {
    // Pay $1.03 against three $0.20 owed lines (sum $0.60) → each owing
    // line is paid in full ($0.20 = 20 cents), and the $0.43 (43 cents)
    // leftover is split across the three tied largest balances using
    // `splitIntegerEvenly` semantics → [15, 14, 14] cents → totals
    // [35, 34, 34] cents.
    const result = allocatePaymentByBalance(103, [
      { enrollmentId: 1, effectiveBalanceCents: 20 },
      { enrollmentId: 2, effectiveBalanceCents: 20 },
      { enrollmentId: 3, effectiveBalanceCents: 20 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 35 },
      { enrollmentId: 2, amountCents: 34 },
      { enrollmentId: 3, amountCents: 34 },
    ]);
    expect(sumCents(result)).toBe(103);
  });

  test('all-paid fallback parks the entire amount on the first enrollment', () => {
    // No enrollment owes anything — but we still must reconcile the
    // payment. The allocator parks the whole amount on the first
    // enrollment (loud, audit-visible) rather than silently dropping it.
    const result = allocatePaymentByBalance(2500, [
      { enrollmentId: 1, effectiveBalanceCents: 0 },
      { enrollmentId: 2, effectiveBalanceCents: 0 },
    ]);
    expect(result).toEqual([
      { enrollmentId: 1, amountCents: 2500 },
      { enrollmentId: 2, amountCents: 0 },
    ]);
  });

  test('preserves input enrollment order in output', () => {
    const result = allocatePaymentByBalance(1000, [
      { enrollmentId: 99, effectiveBalanceCents: 500 },
      { enrollmentId: 1, effectiveBalanceCents: 500 },
      { enrollmentId: 50, effectiveBalanceCents: 0 },
    ]);
    expect(result.map(r => r.enrollmentId)).toEqual([99, 1, 50]);
    expect(sumCents(result)).toBe(1000);
  });

  test('throws on negative totalCents', () => {
    expect(() =>
      allocatePaymentByBalance(-10, [{ enrollmentId: 1, effectiveBalanceCents: 100 }]),
    ).toThrow(/non-negative integer/);
  });

  test('throws on non-integer totalCents', () => {
    expect(() =>
      allocatePaymentByBalance(10.5, [{ enrollmentId: 1, effectiveBalanceCents: 100 }]),
    ).toThrow(/non-negative integer/);
  });

  test('legacy splitAmountAcrossEnrollments still produces unchanged even-split results', () => {
    // Regression guard: the legacy helper must keep its current behaviour
    // because webhooks, billing, and reconciliation services rely on it.
    expect(splitAmountAcrossEnrollments(100, [1, 2, 3])).toEqual([
      { enrollmentId: 1, amountCents: 34 },
      { enrollmentId: 2, amountCents: 33 },
      { enrollmentId: 3, amountCents: 33 },
    ]);
  });
});
