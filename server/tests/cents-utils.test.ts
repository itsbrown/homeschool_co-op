import { describe, expect, it } from '@jest/globals';
import {
  calculateEnrollmentOwedCents,
  allocateCentsByWeights,
  isNonNegativeIntegerCents,
  normalizeToNonNegativeIntegerCents,
  parseOptionalIntegerCents,
  parseRequiredIntegerCents,
  splitCentsEvenly,
} from '../services/cents-utils';

describe('cents-utils helper primitives', () => {
  describe('parseOptionalIntegerCents', () => {
    it('treats missing inputs as optional/non-malformed', () => {
      expect(parseOptionalIntegerCents(undefined)).toEqual({ value: null, malformed: false });
      expect(parseOptionalIntegerCents(null)).toEqual({ value: null, malformed: false });
      expect(parseOptionalIntegerCents('')).toEqual({ value: null, malformed: false });
    });

    it('parses integer cents from numbers and strings', () => {
      expect(parseOptionalIntegerCents(1099)).toEqual({ value: 1099, malformed: false });
      expect(parseOptionalIntegerCents('1099')).toEqual({ value: 1099, malformed: false });
      expect(parseOptionalIntegerCents('-20')).toEqual({ value: -20, malformed: false });
    });

    it('marks malformed/fractional values', () => {
      expect(parseOptionalIntegerCents('12.34')).toEqual({ value: null, malformed: true });
      expect(parseOptionalIntegerCents(12.34)).toEqual({ value: null, malformed: true });
      expect(parseOptionalIntegerCents('abc')).toEqual({ value: null, malformed: true });
      expect(parseOptionalIntegerCents({ value: 1 })).toEqual({ value: null, malformed: true });
    });
  });

  describe('parseRequiredIntegerCents + normalize', () => {
    it('returns null for malformed or missing required cents', () => {
      expect(parseRequiredIntegerCents(undefined)).toBeNull();
      expect(parseRequiredIntegerCents('12.34')).toBeNull();
    });

    it('normalizes malformed and negative inputs for arithmetic', () => {
      expect(normalizeToNonNegativeIntegerCents('abc')).toBe(0);
      expect(normalizeToNonNegativeIntegerCents(undefined)).toBe(0);
      expect(normalizeToNonNegativeIntegerCents(-5)).toBe(0);
      expect(normalizeToNonNegativeIntegerCents('250')).toBe(250);
    });

    it('validates non-negative integer cents shape', () => {
      expect(isNonNegativeIntegerCents(0)).toBe(true);
      expect(isNonNegativeIntegerCents(250)).toBe(true);
      expect(isNonNegativeIntegerCents(-1)).toBe(false);
      expect(isNonNegativeIntegerCents(2.5)).toBe(false);
      expect(isNonNegativeIntegerCents('100')).toBe(false);
    });
  });

  describe('splitCentsEvenly', () => {
    it('preserves exact sum for odd-cent totals', () => {
      const split = splitCentsEvenly(10001, 3);
      expect(split).toEqual([3334, 3334, 3333]);
      expect(split.reduce((sum, value) => sum + value, 0)).toBe(10001);
    });

    it('works for zero and even totals', () => {
      expect(splitCentsEvenly(0, 3)).toEqual([0, 0, 0]);
      expect(splitCentsEvenly(1200, 3)).toEqual([400, 400, 400]);
    });

    it('throws for invalid split inputs', () => {
      expect(() => splitCentsEvenly(-1, 2)).toThrow('totalCents must be a non-negative integer');
      expect(() => splitCentsEvenly(100, 0)).toThrow('recipientCount must be a positive integer');
      expect(() => splitCentsEvenly(100.5, 2)).toThrow('totalCents must be a non-negative integer');
    });
  });

  describe('allocateCentsByWeights', () => {
    it('preserves exact sum with odd cents and weighted shares', () => {
      const allocation = allocateCentsByWeights(101, [2, 1]);
      expect(allocation).toEqual([67, 34]);
      expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(101);
    });

    it('falls back deterministically to even split when all weights are zero', () => {
      const allocation = allocateCentsByWeights(5, [0, 0, 0]);
      expect(allocation).toEqual([2, 2, 1]);
      expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(5);
    });

    it('throws for invalid weights inputs', () => {
      expect(() => allocateCentsByWeights(10, [])).toThrow('weights must be a non-empty array');
      expect(() => allocateCentsByWeights(10, [1, -1])).toThrow('weights must contain only non-negative integers');
      expect(() => allocateCentsByWeights(10, [1, 1.5])).toThrow('weights must contain only non-negative integers');
    });
  });

  describe('calculateEnrollmentOwedCents', () => {
    it('prefers remainingBalance when valid integer cents', () => {
      expect(
        calculateEnrollmentOwedCents({
          totalCostCents: 10000,
          totalPaidCents: 9000,
          remainingBalanceCents: 400,
        }),
      ).toBe(400);
    });

    it('falls back to totalCost-totalPaid when remainingBalance is malformed', () => {
      expect(
        calculateEnrollmentOwedCents({
          totalCostCents: 10000,
          totalPaidCents: 2500,
          remainingBalanceCents: '12.34',
        }),
      ).toBe(7500);
    });

    it('never returns negative owed amount', () => {
      expect(
        calculateEnrollmentOwedCents({
          totalCostCents: 1000,
          totalPaidCents: 2000,
        }),
      ).toBe(0);
    });
  });
});
