export interface ParsedCentsResult {
  value: number | null;
  malformed: boolean;
}

/**
 * Parse an optional cents input.
 * - null/undefined/empty-string => { value: null, malformed: false }
 * - integer number / integer string => parsed integer cents
 * - everything else => malformed
 */
export function parseOptionalIntegerCents(input: unknown): ParsedCentsResult {
  if (input === null || input === undefined || input === '') {
    return { value: null, malformed: false };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      return { value: null, malformed: true };
    }
    return { value: input, malformed: false };
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return { value: null, malformed: true };
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { value: null, malformed: true };
    }

    return { value: parsed, malformed: false };
  }

  return { value: null, malformed: true };
}

/** Parse a required integer-cents value. Returns null when malformed. */
export function parseRequiredIntegerCents(input: unknown): number | null {
  const parsed = parseOptionalIntegerCents(input);
  return parsed.malformed || parsed.value === null ? null : parsed.value;
}

/** True only for finite integer cents >= 0. */
export function isNonNegativeIntegerCents(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input) && Number.isInteger(input) && input >= 0;
}

/**
 * Normalize cents for arithmetic:
 * - malformed/missing -> 0
 * - valid -> clamped at 0 minimum
 */
export function normalizeToNonNegativeIntegerCents(input: unknown): number {
  const parsed = parseRequiredIntegerCents(input);
  if (parsed === null) return 0;
  return Math.max(0, parsed);
}

/**
 * Split an integer cents total across recipients while preserving exact sum.
 * Remainder cents are distributed from index 0 onward.
 */
export function splitCentsEvenly(totalCents: number, recipientCount: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (!Number.isInteger(recipientCount) || recipientCount <= 0) {
    throw new Error('recipientCount must be a positive integer');
  }

  const base = Math.floor(totalCents / recipientCount);
  const remainder = totalCents % recipientCount;
  return Array.from({ length: recipientCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Allocate integer cents by non-negative integer weights with exact-sum preservation.
 * Any remainder cents are assigned by largest fractional remainder, then lower index.
 */
export function allocateCentsByWeights(totalCents: number, weights: number[]): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error('weights must be a non-empty array');
  }
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
    throw new Error('weights must contain only non-negative integers');
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) {
    return splitCentsEvenly(totalCents, weights.length);
  }

  const exactShares = weights.map((weight) => (totalCents * weight) / totalWeight);
  const baseShares = exactShares.map((share) => Math.floor(share));
  let remainder = totalCents - baseShares.reduce((sum, share) => sum + share, 0);

  const rankedIndexes = exactShares
    .map((share, index) => ({
      index,
      fraction: share - Math.floor(share),
    }))
    .sort((a, b) => {
      if (b.fraction !== a.fraction) return b.fraction - a.fraction;
      return a.index - b.index;
    });

  let rank = 0;
  while (remainder > 0) {
    const target = rankedIndexes[rank % rankedIndexes.length];
    baseShares[target.index] += 1;
    remainder -= 1;
    rank += 1;
  }

  return baseShares;
}
