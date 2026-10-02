/** Helpers for week-plan lesson teaching content (cards, print, detail sheet). */

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
