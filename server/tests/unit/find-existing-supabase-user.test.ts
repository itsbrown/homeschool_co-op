import { describe, it, expect } from '@jest/globals';
import {
  fetchSupabaseAdminUsersPage,
  findExistingSupabaseUserId,
  SUPABASE_USER_LIST_MAX_PAGES,
  SUPABASE_USER_LIST_PER_PAGE,
  type AuthUserPage,
  type FindExistingSupabaseUserDeps,
} from '../helpers/findExistingSupabaseUser';

function page(users: Array<{ id: string; email: string }>, total?: number): AuthUserPage {
  return { users, total: total ?? null };
}

function filler(pageNum: number, count: number): AuthUserPage {
  return page(
    Array.from({ length: count }, (_, index) => ({
      id: `p${pageNum}-${index}`,
      email: `other-${pageNum}-${index}@test.com`,
    })),
  );
}

describe('findExistingSupabaseUserId', () => {
  it('returns the user from the email filter and does not scan the full list', async () => {
    let pages = 0;
    let lookups = 0;
    const id = await findExistingSupabaseUserId('Hours_Super_1@test.com', {
      listByEmailFilter: async () =>
        page([{ id: 'auth-1', email: 'hours_super_1@test.com' }]),
      lookupByEmail: async () => {
        lookups += 1;
        return null;
      },
      listPage: async () => {
        pages += 1;
        return page([]);
      },
    });

    expect(id).toBe('auth-1');
    expect(lookups).toBe(0);
    expect(pages).toBe(0);
  });

  it('keeps reading filtered pages until the exact email appears', async () => {
    const id = await findExistingSupabaseUserId('hours_super_1@test.com', {
      listByEmailFilter: async (_email, pageNum) => {
        if (pageNum === 1) {
          return page([{ id: 'other', email: 'hours_super_1@test.com.extra' }]);
        }
        return page([{ id: 'auth-2', email: 'hours_super_1@test.com' }]);
      },
      lookupByEmail: async () => null,
      listPage: async () => page([]),
    });

    expect(id).toBe('auth-2');
  });

  it('stops an ignored filter and uses the exact lookup', async () => {
    let filterPages = 0;
    const id = await findExistingSupabaseUserId('hours_super_1@test.com', {
      listByEmailFilter: async () => {
        filterPages += 1;
        return page([{ id: 'newest', email: 'someone-else@test.com' }]);
      },
      lookupByEmail: async () => 'from-link',
      listPage: async () => {
        throw new Error('full scan should not run after an exact lookup hit');
      },
    });

    expect(id).toBe('from-link');
    expect(filterPages).toBe(1);
  });

  it('finds a user past the old 10-page cap', async () => {
    const targetPage = 11;
    const id = await findExistingSupabaseUserId('hours_mentor_1@test.com', {
      listByEmailFilter: async () => page([]),
      lookupByEmail: async () => null,
      listPage: async (pageNum, perPage) => {
        expect(perPage).toBe(SUPABASE_USER_LIST_PER_PAGE);
        if (pageNum > targetPage) return page([]);
        const users = filler(pageNum, perPage);
        if (pageNum === targetPage) {
          users.users[perPage - 1] = {
            id: 'buried',
            email: 'hours_mentor_1@test.com',
          };
        }
        return users;
      },
    });

    expect(id).toBe('buried');
  });

  it('does not treat a short page as the last page when the server caps per_page', async () => {
    const requested: number[] = [];
    const id = await findExistingSupabaseUserId('hours_super_4@test.com', {
      listByEmailFilter: async () => null,
      lookupByEmail: async () => null,
      listPage: async (pageNum) => {
        requested.push(pageNum);
        const count = 50;
        const users = filler(pageNum, count);
        if (pageNum === 3) {
          users.users[10] = { id: 'capped', email: 'hours_super_4@test.com' };
        }
        if (pageNum > 3) return page([]);
        return users;
      },
    });

    expect(id).toBe('capped');
    expect(requested).toEqual([1, 2, 3]);
  });

  it('stops when a later page repeats an earlier page', async () => {
    let calls = 0;
    const id = await findExistingSupabaseUserId('missing@test.com', {
      listByEmailFilter: async () => page([]),
      lookupByEmail: async () => null,
      listPage: async () => {
        calls += 1;
        return filler(1, 50);
      },
    });

    expect(id).toBeNull();
    expect(calls).toBe(2);
  });

  it('stops walking once X-Total-Count is covered', async () => {
    const requested: number[] = [];
    const deps: FindExistingSupabaseUserDeps = {
      listByEmailFilter: async () => page([]),
      lookupByEmail: async () => null,
      listPage: async (pageNum) => {
        requested.push(pageNum);
        return page(
          [{ id: `only-${pageNum}`, email: `only-${pageNum}@test.com` }],
          1,
        );
      },
    };

    const id = await findExistingSupabaseUserId('hours_super_9@test.com', deps);
    expect(id).toBeNull();
    expect(requested).toEqual([1]);
  });

  it('gives up after the page cap', async () => {
    let calls = 0;
    const id = await findExistingSupabaseUserId('never@test.com', {
      listByEmailFilter: async () => page([]),
      lookupByEmail: async () => null,
      listPage: async (pageNum) => {
        calls += 1;
        return filler(pageNum, 1);
      },
    });

    expect(id).toBeNull();
    expect(calls).toBe(SUPABASE_USER_LIST_MAX_PAGES);
  });
});

describe('fetchSupabaseAdminUsersPage', () => {
  it('sends the email filter and reads X-Total-Count', async () => {
    let requested = '';
    const result = await fetchSupabaseAdminUsersPage({
      supabaseUrl: 'https://example.supabase.co/',
      serviceKey: 'service-role',
      page: 2,
      perPage: 200,
      filter: 'hours_super_1@test.com',
      fetchImpl: async (input, init) => {
        requested = String(input);
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer service-role');
        expect(headers.get('apikey')).toBe('service-role');
        return new Response(
          JSON.stringify({
            users: [{ id: 'auth-1', email: 'hours_super_1@test.com' }],
          }),
          { status: 200, headers: { 'x-total-count': '1' } },
        );
      },
    });

    const url = new URL(requested);
    expect(url.pathname).toBe('/auth/v1/admin/users');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('per_page')).toBe('200');
    expect(url.searchParams.get('filter')).toBe('hours\\_super\\_1@test.com');
    expect(result).toEqual({
      users: [{ id: 'auth-1', email: 'hours_super_1@test.com' }],
      total: 1,
    });
  });

  it('returns null when the admin API rejects the request', async () => {
    const result = await fetchSupabaseAdminUsersPage({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-role',
      page: 1,
      perPage: 200,
      fetchImpl: async () => new Response('nope', { status: 400 }),
    });
    expect(result).toBeNull();
  });
});
