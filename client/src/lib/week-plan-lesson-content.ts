/** Helpers for week-plan lesson teaching content (cards, print, detail sheet). */

import { collectLessonLinks, expandLessonLinkFields } from "@shared/lesson-links";

export { expandLessonLinkFields };

export type WeekPlanGroup =
  | string
  | {
      name?: string | null;
      students?: string | null;
      notes?: string | null;
    };

export function asTrimmedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Unique lesson URLs: primary `lessonLink` first, then `resources`, no empties/dupes. */
export function lessonLinksFromBlock(block: {
  lessonLink?: string | null;
  resources?: unknown;
}): string[] {
  return collectLessonLinks(block);
}

/** Persist first URL on `lesson_link` and the full unique list on `resources` (legacy readers keep working). */
export function splitLessonLinks(links: unknown): {
  lessonLink: string | null;
  resources: string[];
} {
  const unique = lessonLinksFromBlock({ resources: links });
  return {
    lessonLink: unique[0] || null,
    resources: unique,
  };
}

export function lessonLinksForForm(block: {
  lessonLink?: string | null;
  resources?: unknown;
}): string[] {
  const links = lessonLinksFromBlock(block);
  return links.length ? links : [""];
}

export type LessonLinkAssetLabel = {
  title?: string | null;
  name?: string | null;
  webViewLink?: string | null;
};

function driveFileIdOrNull(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/\/(?:document|file|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/)
    || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

/** Title of the catalog file this URL actually opens, when we have one. */
export function lessonLinkAssetTitle(url: string, assets?: LessonLinkAssetLabel[]): string | null {
  const fileId = driveFileIdOrNull(url);
  const match = (assets || []).find((asset) => {
    const link = (asset.webViewLink || "").trim();
    if (!link) return false;
    if (fileId && driveFileIdOrNull(link) === fileId) return true;
    return link === url.trim();
  });
  const title = (match?.title || match?.name || "").trim();
  return title || null;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * Link text on a week card or lesson sheet.
 * The first link uses the lesson title, so a stale catalog name or "Open Drive"
 * is not shown in its place. Any other link uses the catalog file name when
 * that file is the URL, otherwise the site name.
 */
export function lessonLinkButtonLabel(
  url: string,
  index: number,
  options?: {
    lessonTitle?: string | null;
    assets?: LessonLinkAssetLabel[];
  },
): string {
  const lessonTitle = (options?.lessonTitle || "").trim();
  const fileTitle = lessonLinkAssetTitle(url, options?.assets);
  if (index === 0 && lessonTitle) return lessonTitle;
  if (fileTitle) return fileTitle;
  if (index === 0) return "Open lesson";
  return hostLabel(url);
}

/** Same rules as `lessonLinkButtonLabel`, with a number when two links would share a label. */
export function lessonLinkLabels(
  urls: string[],
  options?: {
    lessonTitle?: string | null;
    assets?: LessonLinkAssetLabel[];
  },
): string[] {
  const raw = urls.map((url, index) => lessonLinkButtonLabel(url, index, options));
  const totals = new Map<string, number>();
  for (const label of raw) totals.set(label, (totals.get(label) || 0) + 1);
  const seen = new Map<string, number>();
  return raw.map((label) => {
    if ((totals.get(label) || 0) < 2) return label;
    const n = (seen.get(label) || 0) + 1;
    seen.set(label, n);
    return `${label} (${n})`;
  });
}

/** First non-empty paragraph of a lesson description, optionally truncated for dense grids/print. */
export function firstDescriptionParagraph(
  description: string | null | undefined,
  maxChars = 180,
): string | null {
  if (!description) return null;
  const first = description
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) return null;
  if (first.length <= maxChars) return first;
  const clipped = first.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  return `${clipped || first.slice(0, maxChars).trim()}…`;
}

/**
 * Several opening lines for a week-grid card.
 * Morning scripts often start with a heading ("1. Welcome & Greeting", "Pre-K Group:")
 * and put the activity on the next line. The first line alone hides that.
 */
export function descriptionPreviewText(
  description: string | null | undefined,
  maxChars = 320,
  maxLines = 6,
): string | null {
  if (!description) return null;
  const lines = description
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const picked: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (picked.length >= maxLines) break;
    const separator = picked.length > 0 ? 1 : 0;
    const room = maxChars - used - separator;
    if (room <= 8) break;
    if (line.length <= room) {
      picked.push(line);
      used += separator + line.length;
      continue;
    }
    const clipped = line.slice(0, room).replace(/\s+\S*$/, "").trim();
    picked.push(`${clipped || line.slice(0, room).trim()}…`);
    break;
  }
  return picked.join("\n");
}

export function formatGroupLabel(group: WeekPlanGroup): string {
  if (typeof group === "string") return group.trim();
  if (!group || typeof group !== "object") return "";
  const name = String(group.name || "").trim();
  if (!name) return "";
  const extra = [group.students, group.notes]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");
  return extra ? `${name}: ${extra}` : name;
}

export function formatGroupLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => formatGroupLabel(item as WeekPlanGroup)).filter(Boolean);
}

export type LessonTeachingPreview = {
  descriptionPreview: string | null;
  objectives: string[];
  materials: string[];
};

/** Compact teaching summary for week-grid cards (not the full timed script). */
export function lessonTeachingPreview(block: {
  description?: string | null;
  objectives?: unknown;
  materials?: unknown;
  maxDescriptionChars?: number;
  maxObjectives?: number;
  maxMaterials?: number;
}): LessonTeachingPreview {
  const maxObjectives = block.maxObjectives ?? 3;
  const maxMaterials = block.maxMaterials ?? 2;
  return {
    descriptionPreview: descriptionPreviewText(
      block.description,
      block.maxDescriptionChars ?? 320,
      6,
    ),
    objectives: asTrimmedStrings(block.objectives).slice(0, maxObjectives),
    materials: asTrimmedStrings(block.materials).slice(0, maxMaterials),
  };
}
