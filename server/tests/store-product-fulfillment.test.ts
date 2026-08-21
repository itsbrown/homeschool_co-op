import {
  formatStoreProductDeliveryLabel,
  storeProductDeliverySchema,
  assertStoreProductDeliveryAllowed,
  StorePickupOnlyError,
} from '../lib/store-product-fulfillment';

describe('store product fulfillment', () => {
  it('accepts pickup without address', () => {
    const parsed = storeProductDeliverySchema.parse({ method: 'pickup' });
    expect(parsed.method).toBe('pickup');
    expect(formatStoreProductDeliveryLabel(parsed)).toBe('Pick up at school');
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

  it('rejects shipping when pickup is required', () => {
    expect(() =>
      assertStoreProductDeliveryAllowed(
        {
          method: 'shipping',
          shippingAddress: {
            line1: '1 Main',
            line2: '',
            city: 'Albany',
            state: 'NY',
            postalCode: '12203',
          },
        },
        true,
      ),
    ).toThrow(StorePickupOnlyError);
    expect(() => assertStoreProductDeliveryAllowed({ method: 'pickup' }, true)).not.toThrow();
    expect(() =>
      assertStoreProductDeliveryAllowed(
        {
          method: 'shipping',
          shippingAddress: {
            line1: '1 Main',
            line2: '',
            city: 'Albany',
            state: 'NY',
            postalCode: '12203',
          },
        },
        false,
      ),
    ).not.toThrow();
  });
});
