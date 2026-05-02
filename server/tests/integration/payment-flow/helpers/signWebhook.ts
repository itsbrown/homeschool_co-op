/** Sign a Stripe webhook payload with the t=…,v1=… HMAC scheme. */
import crypto from 'crypto';

export interface SignWebhookOptions {
  secret?: string;
  timestamp?: number;
  extraHeaders?: Record<string, string>;
}

export interface SignedWebhook {
  headers: Record<string, string>;
  body: string;
}

export function signWebhook(
  event: unknown,
  options: SignWebhookOptions = {},
): SignedWebhook {
  const secret = options.secret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('signWebhook: STRIPE_WEBHOOK_SECRET is required.');
  }
  const body = typeof event === 'string' ? event : JSON.stringify(event);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return {
    headers: {
      'stripe-signature': `t=${timestamp},v1=${v1}`,
      'content-type': 'application/json',
      ...(options.extraHeaders ?? {}),
    },
    body,
  };
}
