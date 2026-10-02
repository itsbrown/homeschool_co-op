import { describe, it, expect } from '@jest/globals';
import { keepActiveRecipientIds } from '../../lib/active-notification-recipients';

describe('keepActiveRecipientIds', () => {
  it('drops inactive ids, unknown ids, and duplicates', () => {
    const active = new Set([2, 4]);
    expect(keepActiveRecipientIds([1, 2, 2, 3, 4, 0, -1], active)).toEqual([2, 4]);
  });

  it('returns an empty list when nobody is active', () => {
    expect(keepActiveRecipientIds([8, 9], new Set())).toEqual([]);
  });
});
