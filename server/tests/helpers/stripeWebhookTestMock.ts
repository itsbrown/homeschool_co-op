import type { jest } from '@jest/globals';

/**
 * Integration tests send Stripe event JSON as the raw body. Parse it in the mock
 * instead of throwing to force STRIPE_WEBHOOK_DEV_BYPASS (avoids noisy console.error).
 */
export function mockStripeConstructEventParsesBody(
  mockConstructEvent: jest.Mock,
): void {
  mockConstructEvent.mockImplementation((payload: Buffer | string) => {
    const raw = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
    return JSON.parse(raw);
  });
}
