import { describe, it, expect } from '@jest/globals';
import {
  normalizeEmailForLookup,
  emailsMatch,
  enrollmentMatchesParent,
} from '@shared/parent-identity';
import {
  resolveParentDbUser,
  getChildrenForAuthenticatedParent,
  resolveSchoolIdsForParentSessions,
} from '../lib/parent-auth-scope';
import type { IStorage } from '../storage';
import type { User, Child } from '@shared/schema';

function mockStorage(partial: Partial<IStorage>): IStorage {
  return partial as IStorage;
}

describe('parent-identity helpers', () => {
  it('normalizeEmailForLookup trims and lowercases', () => {
    expect(normalizeEmailForLookup('  Foo@BAR.Com ')).toBe('foo@bar.com');
    expect(normalizeEmailForLookup(null)).toBe('');
  });

  it('emailsMatch ignores case and surrounding whitespace', () => {
    expect(emailsMatch('A@B.COM', ' a@b.com ')).toBe(true);
    expect(emailsMatch('a@b.com', 'c@d.com')).toBe(false);
    expect(emailsMatch('', 'a@b.com')).toBe(false);
  });

  it('enrollmentMatchesParent accepts parent_id or normalized email', () => {
    expect(
      enrollmentMatchesParent({ parentId: 5, parentEmail: 'old@example.com' }, 5, 'parent@test.com'),
    ).toBe(true);
    expect(
      enrollmentMatchesParent({ parentId: 99, parentEmail: ' Parent@Test.COM ' }, 5, 'parent@test.com'),
    ).toBe(true);
    expect(
      enrollmentMatchesParent({ parentId: 99, parentEmail: 'other@test.com' }, 5, 'parent@test.com'),
    ).toBe(false);
  });
});

describe('resolveParentDbUser', () => {
  it('falls back to supabase id when email lookup misses', async () => {
    const user: User = {
      id: 42,
      email: 'stored@example.com',
      supabaseId: 'sb-uuid',
      auth0Id: null,
    } as User;

    const storage = mockStorage({
      async getUserByEmail() {
        return undefined;
      },
      async getUserBySupabaseId(id: string) {
        return id === 'sb-uuid' ? user : undefined;
      },
      async getUserByAuth0Id() {
        return undefined;
      },
    });

    const resolved = await resolveParentDbUser(storage, {
      email: 'jwt-different@example.com',
      supabaseId: 'sb-uuid',
    });
    expect(resolved?.id).toBe(42);
  });
});

describe('getChildrenForAuthenticatedParent', () => {
  it('uses parent id when user resolves', async () => {
    const parent = { id: 7 } as User;
    const kids: Child[] = [{ id: 1, parentId: 7 } as Child];

    const storage2 = mockStorage({
      async getUserByEmail() {
        return parent;
      },
      async getUserBySupabaseId() {
        return undefined;
      },
      async getUserByAuth0Id() {
        return undefined;
      },
      async getChildrenByParentId(pid: number) {
        return pid === 7 ? kids : [];
      },
      async getChildrenByParentEmail() {
        return [];
      },
    });

    const children = await getChildrenForAuthenticatedParent(storage2, { email: 'ANY@x.com' });
    expect(children).toEqual(kids);
  });

  it('merges children by parent_id and by denormalized parent_email', async () => {
    const parent = { id: 7 } as User;
    const byIdKid = { id: 1, parentId: 7 } as Child;
    const byEmailKid = { id: 2, parentId: 999, parentEmail: 'parent@test.com' } as Child;

    const storage = mockStorage({
      async getUserByEmail() {
        return parent;
      },
      async getUserBySupabaseId() {
        return undefined;
      },
      async getUserByAuth0Id() {
        return undefined;
      },
      async getChildrenByParentId(pid: number) {
        return pid === 7 ? [byIdKid] : [];
      },
      async getChildrenByParentEmail() {
        return [byEmailKid];
      },
    });

    const children = await getChildrenForAuthenticatedParent(storage, { email: 'parent@test.com' });
    expect(children.map((c) => c.id).sort()).toEqual([1, 2]);
  });
});

describe('resolveSchoolIdsForParentSessions', () => {
  it('uses parent schoolId when child schoolId is null', async () => {
    const parent = { id: 7, schoolId: 42 } as User;
    const kids: Child[] = [{ id: 1, parentId: 7, schoolId: null } as Child];

    const storage = mockStorage({
      async getUserByEmail() {
        return parent;
      },
      async getUserBySupabaseId() {
        return undefined;
      },
      async getUserByAuth0Id() {
        return undefined;
      },
      async getChildrenByParentId(pid: number) {
        return pid === 7 ? kids : [];
      },
      async getChildrenByParentEmail() {
        return [];
      },
    });

    const { schoolIds, children } = await resolveSchoolIdsForParentSessions(storage, {
      email: 'parent@test.com',
    });
    expect(children).toHaveLength(1);
    expect(schoolIds).toEqual([42]);
  });

  it('merges school ids from children and parent', async () => {
    const parent = { id: 7, schoolId: 42 } as User;
    const kids: Child[] = [
      { id: 1, parentId: 7, schoolId: 10 } as Child,
      { id: 2, parentId: 7, schoolId: 11 } as Child,
    ];

    const storage = mockStorage({
      async getUserByEmail() {
        return parent;
      },
      async getUserBySupabaseId() {
        return undefined;
      },
      async getUserByAuth0Id() {
        return undefined;
      },
      async getChildrenByParentId(pid: number) {
        return pid === 7 ? kids : [];
      },
      async getChildrenByParentEmail() {
        return [];
      },
    });

    const { schoolIds } = await resolveSchoolIdsForParentSessions(storage, { email: 'parent@test.com' });
    expect(schoolIds.sort((a, b) => a - b)).toEqual([10, 11, 42]);
  });
});
