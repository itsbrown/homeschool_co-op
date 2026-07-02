import { z } from 'zod';

export const storeProductFulfillmentMethods = ['pickup', 'shipping'] as const;
export type StoreProductFulfillmentMethod = (typeof storeProductFulfillmentMethods)[number];

export const storeShippingAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional().default(''),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  postalCode: z.string().min(5),
});

export type StoreShippingAddress = z.infer<typeof storeShippingAddressSchema>;

export const storeProductDeliverySchema = z
  .object({
    method: z.enum(storeProductFulfillmentMethods),
    shippingAddress: storeShippingAddressSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'shipping' && !value.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping address is required when shipping is selected',
        path: ['shippingAddress'],
      });
    }
  });

export type StoreProductDelivery = z.infer<typeof storeProductDeliverySchema>;

export function formatStoreShippingAddress(address: StoreShippingAddress): string {
  const parts = [
    address.line1,
    address.line2?.trim() ? address.line2.trim() : null,
    `${address.city}, ${address.state} ${address.postalCode}`,
  ].filter(Boolean);
  return parts.join(', ');
}

export function formatStoreProductDeliveryLabel(delivery: StoreProductDelivery): string {
  if (delivery.method === 'pickup') {
    return 'Pick up at campus';
  }
  if (!delivery.shippingAddress) {
    return 'Ship to address';
  }
  return `Ship to: ${formatStoreShippingAddress(delivery.shippingAddress)}`;
}
