import { jest } from '@jest/globals';
import { normalizeEmailForLookup } from '@shared/parent-identity';

export type MockSupabaseAuthUser = {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

const authUsersByEmail = new Map<string, MockSupabaseAuthUser>();
let nextAuthId = 1;

function normalizeKey(email: string): string {
  return normalizeEmailForLookup(email) || email.trim().toLowerCase();
}

export function resetSupabaseAuthMock(): void {
  authUsersByEmail.clear();
  nextAuthId = 1;
}

/** Auth user exists in Supabase but not in Postgres (orphan fixture). */
export function seedOrphanSupabaseAuthUser(email: string, id?: string): MockSupabaseAuthUser {
  const user: MockSupabaseAuthUser = {
    id: id ?? `orphan-auth-${nextAuthId++}`,
    email: email.trim(),
  };
  authUsersByEmail.set(normalizeKey(email), user);
  return user;
}

export function getSupabaseAuthMockUsers(): MockSupabaseAuthUser[] {
  return Array.from(authUsersByEmail.values());
}

export function installSupabaseAuthMock(): void {
  resetSupabaseAuthMock();
}

const mockCreateUser = jest.fn(async (params: {
  email: string;
  password?: string;
  email_confirm?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}) => {
  const key = normalizeKey(params.email);
  if (authUsersByEmail.has(key)) {
    return {
      data: { user: null },
      error: { message: 'User already registered' },
    };
  }
  const user: MockSupabaseAuthUser = {
    id: `mock-supabase-${nextAuthId++}`,
    email: params.email,
    app_metadata: params.app_metadata,
    user_metadata: params.user_metadata,
  };
  authUsersByEmail.set(key, user);
  return { data: { user }, error: null };
});

const mockDeleteUser = jest.fn(async (id: string) => {
  for (const [key, u] of authUsersByEmail.entries()) {
    if (u.id === id) {
      authUsersByEmail.delete(key);
      return { data: {}, error: null };
    }
  }
  return { data: {}, error: null };
});

const mockListUsers = jest.fn(async ({ page = 1, perPage = 200 }: { page?: number; perPage?: number }) => {
  const all = Array.from(authUsersByEmail.values());
  const start = (page - 1) * perPage;
  const slice = all.slice(start, start + perPage);
  return { data: { users: slice }, error: null };
});

const mockGetUser = jest.fn(async () => ({
  data: { user: null },
  error: { message: 'not used in production-path mock' },
}));

/** Factory for jest.mock('@supabase/supabase-js', () => ...) — must be hoisted in test files. */
export function supabaseJsMockFactory() {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: mockGetUser,
        admin: {
          listUsers: mockListUsers,
          createUser: mockCreateUser,
          deleteUser: mockDeleteUser,
        },
      },
    })),
  };
}

export function getSupabaseAuthMockFns() {
  return { mockCreateUser, mockDeleteUser, mockListUsers };
}
