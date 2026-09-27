/**
 * School notification sends must skip deactivated accounts.
 * Children, payments, and other linked rows are unrelated to this filter.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { users } from '@shared/schema';
import { getDb } from '../db';

export function keepActiveRecipientIds(ids: number[], activeIds: ReadonlySet<number>): number[] {
  const seen = new Set<number>();
  const kept: number[] = [];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    if (!activeIds.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept;
}

/** Drop ids whose users.is_active is false, and ids with no user row. */
export async function excludeInactiveUserIds(ids: number[]): Promise<number[]> {
  const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return [];

  const db = await getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), eq(users.isActive, true)));

  return keepActiveRecipientIds(
    unique,
    new Set(rows.map((row: { id: number }) => row.id)),
  );
}
