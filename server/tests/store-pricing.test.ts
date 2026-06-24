/**
 * Unit tests for store snapshot membership rules (no DB).
 */
import { parentHasMemberIdForCheckout } from '../utils/cart-pricing';

describe('store pricing helpers', () => {
  it('parentHasMemberIdForCheckout returns true for non-empty member id', () => {
    expect(parentHasMemberIdForCheckout('ASA-2025-ABC')).toBe(true);
    expect(parentHasMemberIdForCheckout('')).toBe(false);
    expect(parentHasMemberIdForCheckout(null)).toBe(false);
  });
});
