import type { IStorage } from '../storage';
import type { Child, User } from '@shared/schema';
import { normalizeEmailForLookup } from '@shared/parent-identity';

export type ParentAuthCriteria = {
  email?: string | null;
  supabaseId?: string | null;
  auth0Id?: string | null;
};

/**
 * Resolve the DB parent row from JWT/session identifiers.
 * Email uses case-insensitive + trim matching via storage.getUserByEmail.
 * Supabase / Auth0 IDs are used when email lookup fails (e.g. stale denormalized email on enrollments).
 */
export async function resolveParentDbUser(
  storage: IStorage,
  criteria: ParentAuthCriteria,
): Promise<User | undefined> {
  const emailNorm = normalizeEmailForLookup(criteria.email ?? '');
  if (emailNorm) {
    const byEmail = await storage.getUserByEmail(criteria.email!);
    if (byEmail) return byEmail;
  }

  const supabaseId = criteria.supabaseId?.trim();
  if (supabaseId) {
    const bySb = await storage.getUserBySupabaseId(supabaseId);
    if (bySb) return bySb;
  }

  const auth0Id = criteria.auth0Id?.trim();
  if (auth0Id) {
    const byAuth0 = await storage.getUserByAuth0Id(auth0Id);
    if (byAuth0) return byAuth0;
  }

  return undefined;
}

/**
 * Children for an authenticated parent: prefer parent_id via resolved DB user; fall back to email-based lookup.
 */
export async function getChildrenForAuthenticatedParent(
  storage: IStorage,
  criteria: ParentAuthCriteria,
): Promise<Child[]> {
  const parent = await resolveParentDbUser(storage, criteria);
  const emailNorm = normalizeEmailForLookup(criteria.email ?? '');

  const byParentId = parent ? await storage.getChildrenByParentId(parent.id) : [];
  const byEmail = emailNorm ? await storage.getChildrenByParentEmail(criteria.email!) : [];

  const merged = new Map<number, Child>();
  for (const c of byParentId) merged.set(c.id, c);
  for (const c of byEmail) merged.set(c.id, c);
  return [...merged.values()];
}
