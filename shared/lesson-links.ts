/** Unique lesson URLs: primary `lessonLink` first, then `resources`. */
export function collectLessonLinks(block: {
  lessonLink?: string | null;
  resources?: unknown;
}): string[] {
  const primary = (block.lessonLink || "").trim();
  const extra = Array.isArray(block.resources)
    ? block.resources
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [primary, ...extra]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** URLs from one pasted blob or CSV cell. Several http(s) links split; otherwise the trimmed text. */
export function urlsFromLessonLinkText(value: string): string[] {
  const hits = value.match(/https?:\/\/[^\s|,]+/gi) ?? [];
  const cleaned = hits.map((hit) => hit.replace(/[)\].,;|]+$/g, ""));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of cleaned) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  if (out.length > 0) return out;
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * When one row contains two or more URLs (paste or space-separated),
 * expand them into separate fields. A single in-progress URL stays as typed.
 */
export function expandLessonLinkFields(fields: string[]): string[] {
  const out: string[] = [];
  for (const field of fields) {
    const urls = urlsFromLessonLinkText(field);
    if (urls.length > 1) {
      out.push(...urls);
      continue;
    }
    out.push(field);
  }
  return out.length ? out : [""];
}
