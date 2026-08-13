/**
 * @jest-environment node
 */
import { StoreAffiliateCartError } from '../lib/store-pricing';

describe('StoreAffiliateCartError', () => {
  it('exposes a stable name for route handlers', () => {
    const err = new StoreAffiliateCartError('no cart');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StoreAffiliateCartError');
    expect(err.message).toBe('no cart');
  });
});
