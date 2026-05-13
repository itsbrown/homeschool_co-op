/**
 * GET /api/parent/children returns a JSON array of child rows.
 * If the cache or a proxy ever holds a wrapped object, coerce to an array
 * so `.map` / `.length` never run on a non-array.
 */
export function normalizeParentChildrenResponse(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.children)) return o.children;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}
