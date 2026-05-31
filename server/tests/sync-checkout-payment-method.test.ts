import { parentHasMemberIdForCheckout } from '../utils/cart-pricing';

/**
 * Lightweight guard — full sync requires Stripe integration tests.
 * Ensures checkout autopay work stayed aligned with member-id helper export.
 */
describe('sync-checkout-payment-method (smoke)', () => {
  it('parentHasMemberIdForCheckout is available for checkout guards', () => {
    expect(parentHasMemberIdForCheckout('ASA-2025-ABC123')).toBe(true);
    expect(parentHasMemberIdForCheckout(null)).toBe(false);
  });
});
