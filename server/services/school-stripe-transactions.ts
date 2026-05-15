import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { normalizeEmailForLookup } from '@shared/parent-identity';
import {
  discoverStripeCustomerIdsByEmail,
  mergePaymentIntentsFromStripeSearchByEmail,
} from '../lib/stripe-search-helpers';

export type SchoolStripePaymentIntent = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: string;
  parentEmail: string | null;
  description: string;
  paymentMethod: string;
};

/**
 * Live Stripe PaymentIntents for a school (succeeded), keyed by intent id.
 * Caps parent emails processed to avoid Stripe rate limits.
 */
export async function fetchSucceededPaymentIntentsForSchool(
  schoolId: number,
  options: { maxParents?: number; maxIntentsPerCustomer?: number } = {},
): Promise<Map<string, SchoolStripePaymentIntent>> {
  const maxParents = options.maxParents ?? 150;
  const maxPerCustomer = options.maxIntentsPerCustomer ?? 50;
  const result = new Map<string, SchoolStripePaymentIntent>();

  if (process.env.NODE_ENV === 'test') {
    return result;
  }

  const parents = await storage.getParentsBySchoolId(schoolId);
  const enrollmentEmails = await storage.getDistinctParentEmailsForSchool(schoolId);
  const emailSet = new Set<string>();
  for (const p of parents) {
    const n = normalizeEmailForLookup(p.email);
    if (n) emailSet.add(n);
  }
  for (const e of enrollmentEmails) {
    if (e) emailSet.add(e);
  }

  const emails = Array.from(emailSet).slice(0, maxParents);
  if (emails.length === 0) return result;

  const stripe = await getStripeClient();
  const customerToEmail = new Map<string, string>();

  for (const email of emails) {
    const fromEnrollments = await storage.getStripeCustomerIdsByParentEmail(email);
    for (const id of fromEnrollments) {
      customerToEmail.set(id, email);
    }
    const discovered = await discoverStripeCustomerIdsByEmail(stripe, email);
    for (const id of discovered) {
      customerToEmail.set(id, email);
    }
  }

  const intentsByEmail = new Map<string, Map<string, any>>();

  for (const [customerId, email] of customerToEmail) {
    try {
      const list = await stripe.paymentIntents.list({
        customer: customerId,
        limit: maxPerCustomer,
      });
      if (!intentsByEmail.has(email)) intentsByEmail.set(email, new Map());
      const bucket = intentsByEmail.get(email)!;
      for (const intent of list.data) {
        if (intent.status === 'succeeded') {
          bucket.set(intent.id, intent);
        }
      }
    } catch (err: unknown) {
      console.warn(`⚠️  paymentIntents.list failed for customer ${customerId}:`, err);
    }
  }

  for (const email of emails) {
    const searchBucket = new Map<string, any>();
    await mergePaymentIntentsFromStripeSearchByEmail(stripe, email, searchBucket);
    if (!intentsByEmail.has(email)) intentsByEmail.set(email, new Map());
    const bucket = intentsByEmail.get(email)!;
    for (const [id, intent] of searchBucket) {
      if (intent.status === 'succeeded') {
        bucket.set(id, intent);
      }
    }
  }

  for (const [email, bucket] of intentsByEmail) {
    for (const [, intent] of bucket) {
      const created =
        intent.created != null
          ? new Date(intent.created * 1000).toISOString()
          : new Date().toISOString();
      result.set(intent.id, {
        id: intent.id,
        amount: intent.amount ?? 0,
        currency: intent.currency ?? 'usd',
        status: intent.status ?? 'succeeded',
        created,
        parentEmail: email,
        description:
          intent.description ||
          (intent.metadata?.className ? `Payment for ${intent.metadata.className}` : 'Stripe payment'),
        paymentMethod: intent.payment_method_types?.[0] || 'card',
      });
    }
  }

  return result;
}
