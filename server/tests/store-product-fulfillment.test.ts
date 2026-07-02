import {
  formatStoreProductDeliveryLabel,
  storeProductDeliverySchema,
} from '../lib/store-product-fulfillment';

describe('store product fulfillment', () => {
  it('accepts pickup without address', () => {
    const parsed = storeProductDeliverySchema.parse({ method: 'pickup' });
    expect(parsed.method).toBe('pickup');
    expect(formatStoreProductDeliveryLabel(parsed)).toBe('Pick up at campus');
  });

  it('requires shipping address when method is shipping', () => {
    expect(() => storeProductDeliverySchema.parse({ method: 'shipping' })).toThrow();
    const parsed = storeProductDeliverySchema.parse({
      method: 'shipping',
      shippingAddress: {
        line1: '123 Main St',
        line2: '',
        city: 'Albany',
        state: 'NY',
        postalCode: '12203',
      },
    });
    expect(formatStoreProductDeliveryLabel(parsed)).toContain('123 Main St');
  });
});
