/**
 * Covers: AUTOPAY_REQUIRE_METADATA_AUTO_PAY flag — when false/unset all rows pass through;
 * when true only rows with metadata.autoPay===true are eligible, others are emitted as skipped.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { filterAutoPayCandidatesByMetadata } from '../services/autopay-policy';

afterEach(() => {
  delete process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY;
});

const baseCandidate = {
  id: 1,
  retryCount: 0,
  dueDate: '2026-05-11T00:00:00.000Z',
  status: 'pending' as const,
};

describe('AUTOPAY_REQUIRE_METADATA_AUTO_PAY=false (or unset)', () => {
  it('passes all candidates through when flag is not set', () => {
    delete process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY;

    const candidates = [
      { ...baseCandidate, id: 1, metadata: undefined },
      { ...baseCandidate, id: 2, metadata: { autoPay: true } },
      { ...baseCandidate, id: 3, metadata: { autoPay: false } },
      { ...baseCandidate, id: 4, metadata: {} },
    ];

    const { eligible, skipped } = filterAutoPayCandidatesByMetadata(candidates);
    expect(eligible).toHaveLength(4);
    expect(skipped).toHaveLength(0);
  });

  it('passes all candidates through when flag is explicitly "false"', () => {
    process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY = 'false';

    const candidates = [
      { ...baseCandidate, id: 1, metadata: undefined },
      { ...baseCandidate, id: 2, metadata: {} },
    ];

    const { eligible, skipped } = filterAutoPayCandidatesByMetadata(candidates);
    expect(eligible).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });
});

describe('AUTOPAY_REQUIRE_METADATA_AUTO_PAY=true', () => {
  it('only admits rows with metadata.autoPay===true', () => {
    process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY = 'true';

    const candidates = [
      { ...baseCandidate, id: 10, metadata: { autoPay: true } },
      { ...baseCandidate, id: 11, metadata: { autoPay: false } },
      { ...baseCandidate, id: 12, metadata: {} },
      { ...baseCandidate, id: 13, metadata: undefined },
    ];

    const { eligible, skipped } = filterAutoPayCandidatesByMetadata(candidates);
    expect(eligible.map((c) => c.id)).toEqual([10]);
    expect(skipped.map((c) => c.id)).toEqual([11, 12, 13]);
  });

  it('returns empty eligible and all skipped when no rows have the autoPay flag', () => {
    process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY = 'true';

    const candidates = [
      { ...baseCandidate, id: 20, metadata: {} },
      { ...baseCandidate, id: 21, metadata: { autoPay: 'yes' } }, // non-boolean truthy is NOT admitted
    ];

    const { eligible, skipped } = filterAutoPayCandidatesByMetadata(candidates);
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });

  it('returns all eligible when every row has autoPay===true', () => {
    process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY = 'true';

    const candidates = [
      { ...baseCandidate, id: 30, metadata: { autoPay: true } },
      { ...baseCandidate, id: 31, metadata: { autoPay: true } },
    ];

    const { eligible, skipped } = filterAutoPayCandidatesByMetadata(candidates);
    expect(eligible).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('emits skipped metric keys for filtered rows (names available for logging)', () => {
    process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY = 'true';

    const candidates = [
      { ...baseCandidate, id: 40, metadata: { autoPay: true } },
      { ...baseCandidate, id: 41, metadata: {} },
    ];

    const { skipped } = filterAutoPayCandidatesByMetadata(candidates);
    // skipped array is the signal for callers to emit a metric/log per skipped row
    expect(skipped[0].id).toBe(41);
  });
});
