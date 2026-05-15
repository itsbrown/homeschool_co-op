import { normalizeEmailForLookup } from '@shared/parent-identity';

/** Stripe Customer Search query literals must escape backslashes and single quotes. */
export function escapeStripeCustomerSearchValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function paginateStripeSearch<T extends { data: unknown[]; has_more: boolean }>(
  fetchPage: (page?: string) => Promise<T>,
): Promise<T['data']> {
  const all: T['data'] = [];
  let searchPage: string | undefined;
  for (;;) {
    const res = await fetchPage(searchPage);
    all.push(...(res.data as T['data']));
    const nextPage =
      res.has_more && typeof (res as { next_page?: string }).next_page === 'string'
        ? (res as { next_page: string }).next_page
        : undefined;
    if (!nextPage) break;
    searchPage = nextPage;
  }
  return all;
}

/**
 * Fallback: find PaymentIntents via Stripe Search — receipt_email and app metadata.
 */
export async function mergePaymentIntentsFromStripeSearchByEmail(
  stripe: { paymentIntents: { search: (p: Record<string, unknown>) => Promise<any> } },
  email: string,
  into: Map<string, any>,
): Promise<void> {
  const trimmed = email.trim();
  const normalized = normalizeEmailForLookup(trimmed);
  const variants = Array.from(
    new Set([trimmed, normalized].filter((v): v is string => v.length > 0)),
  );
  const queries: string[] = [];
  for (const v of variants) {
    const escaped = escapeStripeCustomerSearchValue(v);
    queries.push(
      `receipt_email:'${escaped}'`,
      `metadata['parentEmail']:'${escaped}'`,
      `metadata['userEmail']:'${escaped}'`,
    );
  }
  const uniqueQueries = Array.from(new Set(queries));
  for (const query of uniqueQueries) {
    try {
      const intents = await paginateStripeSearch((page) =>
        stripe.paymentIntents.search({
          query,
          limit: 100,
          ...(page ? { page } : {}),
        }),
      );
      for (const intent of intents as any[]) {
        into.set(intent.id, intent);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  paymentIntents.search skipped (${query.slice(0, 48)}…):`, msg);
    }
  }
}

export async function discoverStripeCustomerIdsByEmail(
  stripe: { customers: { search: (p: Record<string, unknown>) => Promise<any> } },
  email: string,
): Promise<string[]> {
  const ids = new Set<string>();
  const trimmed = email.trim();
  const normalized = normalizeEmailForLookup(trimmed);
  for (const v of Array.from(new Set([trimmed, normalized].filter(Boolean)))) {
    try {
      const escaped = escapeStripeCustomerSearchValue(v);
      const customers = await paginateStripeSearch((page) =>
        stripe.customers.search({
          query: `email:'${escaped}'`,
          limit: 100,
          ...(page ? { page } : {}),
        }),
      );
      for (const c of customers as { id: string }[]) {
        ids.add(c.id);
      }
    } catch (err: unknown) {
      console.warn('⚠️  Stripe customer search failed:', err instanceof Error ? err.message : err);
    }
  }
  return Array.from(ids);
}
