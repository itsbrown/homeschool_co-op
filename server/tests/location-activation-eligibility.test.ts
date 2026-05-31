import {
  enrollmentShouldExcludeFromCart,
} from '@shared/enrollment-cart-eligibility';
import {
  isLegacyActiveLocation,
  isLocationCollectingWishlist,
  locationAllowsNewWishlistSignups,
} from '@shared/location-activation';

describe('location activation helpers', () => {
  it('treats null threshold as legacy active', () => {
    expect(isLegacyActiveLocation({ activationThreshold: null, activationStatus: null })).toBe(true);
    expect(locationAllowsNewWishlistSignups({ activationThreshold: null, activationStatus: null })).toBe(
      false,
    );
  });

  it('allows wishlist signups only while collecting', () => {
    const loc = { activationThreshold: 10, activationStatus: 'collecting' as const };
    expect(isLocationCollectingWishlist(loc)).toBe(true);
    expect(locationAllowsNewWishlistSignups(loc)).toBe(true);
  });

  it('excludes location_wishlist from cart checkout', () => {
    expect(
      enrollmentShouldExcludeFromCart({ id: 1, status: 'location_wishlist', totalPaid: 0 }),
    ).toBe(true);
  });

  it('does not exclude normal pending_payment', () => {
    expect(
      enrollmentShouldExcludeFromCart({ id: 1, status: 'pending_payment', totalPaid: 0 }),
    ).toBe(false);
  });
});
