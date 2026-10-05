import { normalizeEmailForLookup } from '@shared/parent-identity';

export type AuthUserRecord = { id: string; email?: string | null };

export type AuthUserPage = {
  users: AuthUserRecord[];
  /** From `X-Total-Count` when the admin API sends it. */
  total?: number | null;
};

export type FindExistingSupabaseUserDeps = {
  /**
   * `GET /auth/v1/admin/users?filter=<email>`.
   * Return null when that request fails so the caller can try another strategy.
   */
  listByEmailFilter: (
    email: string,
    page: number,
    perPage: number,
  ) => Promise<AuthUserPage | null>;
  /** Exact lookup that does not scan pages (`generateLink`). */
  lookupByEmail: (email: string) => Promise<string | null>;
  /** One offset page of the full user list. Return null on request failure. */
  listPage: (page: number, perPage: number) => Promise<AuthUserPage | null>;
};

export const SUPABASE_USER_LIST_PER_PAGE = 200;
/** 200 pages × 200 users. Stops a stuck cursor from walking forever. */
export const SUPABASE_USER_LIST_MAX_PAGES = 200;
const FILTER_MAX_PAGES = 20;

function exactId(users: AuthUserRecord[], email: string): string | null {
  const match = users.find((user) => normalizeEmailForLookup(user.email) === email);
  return match?.id ?? null;
}

function pageHead(users: AuthUserRecord[]): string {
  return users[0]?.id ?? '';
}

/**
 * Auth admin `listUsers` is newest-first and only returns one page unless the
 * caller asks for the next. CI reuses emails such as `hours_super_1@test.com`
 * while the Supabase project keeps every previous run, so the match sits past
 * the first pages. A short page is not the end of the list either: some
 * servers cap `per_page` below the requested size and still have more rows.
 */
export async function findExistingSupabaseUserId(
  email: string,
  deps: FindExistingSupabaseUserDeps,
): Promise<string | null> {
  const normalized = normalizeEmailForLookup(email);
  if (!normalized) return null;

  const seenFilterHeads = new Set<string>();
  let filteredFetched = 0;
  for (let page = 1; page <= FILTER_MAX_PAGES; page++) {
    const filtered = await deps.listByEmailFilter(
      normalized,
      page,
      SUPABASE_USER_LIST_PER_PAGE,
    );
    if (!filtered || filtered.users.length === 0) break;

    const head = pageHead(filtered.users);
    if (head && seenFilterHeads.has(head)) break;
    if (head) seenFilterHeads.add(head);

    const id = exactId(filtered.users, normalized);
    if (id) return id;

    const filterApplied = filtered.users.every((user) =>
      normalizeEmailForLookup(user.email).includes(normalized),
    );
    if (!filterApplied) break;

    filteredFetched += filtered.users.length;
    if (filtered.total != null && filteredFetched >= filtered.total) break;
  }

  const linked = await deps.lookupByEmail(normalized);
  if (linked) return linked;

  const seenHeads = new Set<string>();
  let fetched = 0;
  for (let page = 1; page <= SUPABASE_USER_LIST_MAX_PAGES; page++) {
    const result = await deps.listPage(page, SUPABASE_USER_LIST_PER_PAGE);
    if (!result || result.users.length === 0) break;

    const head = pageHead(result.users);
    if (head && seenHeads.has(head)) break;
    if (head) seenHeads.add(head);

    const id = exactId(result.users, normalized);
    if (id) return id;

    fetched += result.users.length;
    if (result.total != null && fetched >= result.total) break;
  }

  return null;
}

/** Escape LIKE metacharacters. GoTrue wraps `filter` in `%…%`. */
export function escapeSupabaseUserFilter(email: string): string {
  return email.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function fetchSupabaseAdminUsersPage(args: {
  supabaseUrl: string;
  serviceKey: string;
  page: number;
  perPage: number;
  filter?: string;
  fetchImpl?: typeof fetch;
}): Promise<AuthUserPage | null> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const base = args.supabaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/auth/v1/admin/users`);
  url.searchParams.set('page', String(args.page));
  url.searchParams.set('per_page', String(args.perPage));
  if (args.filter) {
    url.searchParams.set('filter', escapeSupabaseUserFilter(args.filter));
  }

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${args.serviceKey}`,
      apikey: args.serviceKey,
    },
  });
  if (!response.ok) return null;

  let body: { users?: AuthUserRecord[] };
  try {
    body = (await response.json()) as { users?: AuthUserRecord[] };
  } catch {
    return null;
  }

  const totalHeader = response.headers.get('x-total-count');
  const total = totalHeader != null && totalHeader !== '' ? Number(totalHeader) : null;

  return {
    users: Array.isArray(body.users) ? body.users : [],
    total: total != null && Number.isFinite(total) ? total : null,
  };
}
