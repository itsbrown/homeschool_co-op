import { describe, expect, it } from '@jest/globals';
import {
  lexileFromGradeLevel,
  parseGradeLevelScore,
  parseLexileRange,
} from '../lib/parse-lexile-range';

describe('parseLexileRange', () => {
  it('parses single Lexile values', () => {
    expect(parseLexileRange('400L')).toEqual({
      low: 400,
      high: 400,
      midpoint: 400,
      raw: '400L',
    });
    expect(parseLexileRange('896L')).toMatchObject({ midpoint: 896 });
  });

  it('parses BR prefixed values', () => {
    expect(parseLexileRange('BR400L')).toMatchObject({ midpoint: 400 });
    expect(parseLexileRange('BR 200')).toMatchObject({ midpoint: 200 });
  });

  it('parses ranges with and without L suffix', () => {
    expect(parseLexileRange('400-600')).toMatchObject({ low: 400, high: 600, midpoint: 500 });
    expect(parseLexileRange('400L-600L')).toMatchObject({ low: 400, high: 600, midpoint: 500 });
  });

  it('swaps inverted ranges', () => {
    expect(parseLexileRange('600-400')).toMatchObject({ low: 400, high: 600, midpoint: 500 });
  });

  it('returns null for unparseable input', () => {
    expect(parseLexileRange('')).toBeNull();
    expect(parseLexileRange(null)).toBeNull();
    expect(parseLexileRange('reading level 3')).toBeNull();
  });
});

describe('parseGradeLevelScore', () => {
  it('accepts valid grade levels', () => {
    expect(parseGradeLevelScore('3.5')).toBe(3.5);
    expect(parseGradeLevelScore('12')).toBe(12);
  });

  it('rejects out of range', () => {
    expect(parseGradeLevelScore('21')).toBeNull();
    expect(parseGradeLevelScore('-1')).toBeNull();
    expect(parseGradeLevelScore('abc')).toBeNull();
  });
});

describe('lexileFromGradeLevel', () => {
  it('uses ASA formula 200 + grade * 100', () => {
    expect(lexileFromGradeLevel(4)).toBe(600);
    expect(lexileFromGradeLevel(0)).toBe(200);
  });
});
