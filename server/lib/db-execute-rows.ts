/**
 * Normalize drizzle `db.execute()` results across postgres-js driver versions.
 * Some environments return an array directly; others use `{ rows: [] }`.
 */
export function rowsFromExecute<T extends Record<string, unknown> = Record<string, unknown>>(
  result: unknown,
): T[] {
  if (result == null) {
    return [];
  }
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }
  return [];
}
