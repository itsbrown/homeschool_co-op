/**
 * Canonical grade-level slugs and normalization for Grade Placement.
 * Class forms store slugs (e.g. "1st-grade"); children often store labels ("1st Grade").
 */

export const CANONICAL_GRADE_SLUGS = [
  "littles",
  "pre-k",
  "kindergarten",
  "1st-grade",
  "2nd-grade",
  "3rd-grade",
  "4th-grade",
  "5th-grade",
  "6th-grade",
  "7th-grade",
  "8th-grade",
  "9th-grade",
  "10th-grade",
  "11th-grade",
  "12th-grade",
] as const;

export type CanonicalGradeSlug = (typeof CANONICAL_GRADE_SLUGS)[number];

const SLUG_SET = new Set<string>(CANONICAL_GRADE_SLUGS);

/** Display labels for admin/parent UI */
export const GRADE_LEVEL_OPTIONS: { label: string; value: CanonicalGradeSlug }[] = [
  { label: "Littles", value: "littles" },
  { label: "Pre-K", value: "pre-k" },
  { label: "Kindergarten", value: "kindergarten" },
  { label: "1st Grade", value: "1st-grade" },
  { label: "2nd Grade", value: "2nd-grade" },
  { label: "3rd Grade", value: "3rd-grade" },
  { label: "4th Grade", value: "4th-grade" },
  { label: "5th Grade", value: "5th-grade" },
  { label: "6th Grade", value: "6th-grade" },
  { label: "7th Grade", value: "7th-grade" },
  { label: "8th Grade", value: "8th-grade" },
  { label: "9th Grade", value: "9th-grade" },
  { label: "10th Grade", value: "10th-grade" },
  { label: "11th Grade", value: "11th-grade" },
  { label: "12th Grade", value: "12th-grade" },
];

const ALIAS_TO_SLUG: Record<string, CanonicalGradeSlug> = {
  littles: "littles",
  little: "littles",
  "pre-k": "pre-k",
  prek: "pre-k",
  "pre k": "pre-k",
  "pre_k": "pre-k",
  preschool: "pre-k",
  kindergarten: "kindergarten",
  kinder: "kindergarten",
  k: "kindergarten",
  "kinder garten": "kindergarten",
  "1st": "1st-grade",
  "1st-grade": "1st-grade",
  "1st grade": "1st-grade",
  first: "1st-grade",
  "first grade": "1st-grade",
  "grade 1": "1st-grade",
  "1": "1st-grade",
  "2nd": "2nd-grade",
  "2nd-grade": "2nd-grade",
  "2nd grade": "2nd-grade",
  second: "2nd-grade",
  "second grade": "2nd-grade",
  "grade 2": "2nd-grade",
  "2": "2nd-grade",
  "3rd": "3rd-grade",
  "3rd-grade": "3rd-grade",
  "3rd grade": "3rd-grade",
  third: "3rd-grade",
  "third grade": "3rd-grade",
  "grade 3": "3rd-grade",
  "3": "3rd-grade",
  "4th": "4th-grade",
  "4th-grade": "4th-grade",
  "4th grade": "4th-grade",
  fourth: "4th-grade",
  "fourth grade": "4th-grade",
  "grade 4": "4th-grade",
  "4": "4th-grade",
  "5th": "5th-grade",
  "5th-grade": "5th-grade",
  "5th grade": "5th-grade",
  fifth: "5th-grade",
  "fifth grade": "5th-grade",
  "grade 5": "5th-grade",
  "5": "5th-grade",
  "6th": "6th-grade",
  "6th-grade": "6th-grade",
  "6th grade": "6th-grade",
  sixth: "6th-grade",
  "sixth grade": "6th-grade",
  "grade 6": "6th-grade",
  "6": "6th-grade",
  "7th": "7th-grade",
  "7th-grade": "7th-grade",
  "7th grade": "7th-grade",
  seventh: "7th-grade",
  "seventh grade": "7th-grade",
  "grade 7": "7th-grade",
  "7": "7th-grade",
  "8th": "8th-grade",
  "8th-grade": "8th-grade",
  "8th grade": "8th-grade",
  eighth: "8th-grade",
  "eighth grade": "8th-grade",
  "grade 8": "8th-grade",
  "8": "8th-grade",
  "9th": "9th-grade",
  "9th-grade": "9th-grade",
  "9th grade": "9th-grade",
  ninth: "9th-grade",
  "ninth grade": "9th-grade",
  "grade 9": "9th-grade",
  "9": "9th-grade",
  "10th": "10th-grade",
  "10th-grade": "10th-grade",
  "10th grade": "10th-grade",
  tenth: "10th-grade",
  "tenth grade": "10th-grade",
  "grade 10": "10th-grade",
  "10": "10th-grade",
  "11th": "11th-grade",
  "11th-grade": "11th-grade",
  "11th grade": "11th-grade",
  eleventh: "11th-grade",
  "eleventh grade": "11th-grade",
  "grade 11": "11th-grade",
  "11": "11th-grade",
  "12th": "12th-grade",
  "12th-grade": "12th-grade",
  "12th grade": "12th-grade",
  twelfth: "12th-grade",
  "twelfth grade": "12th-grade",
  "grade 12": "12th-grade",
  "12": "12th-grade",
};

function collapseKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\./g, "");
}

/**
 * Normalize a free-form grade string to a canonical slug, or null if unknown.
 */
export function normalizeGradeLevel(raw: string | null | undefined): CanonicalGradeSlug | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const asSlug = trimmed.toLowerCase().replace(/\s+/g, "-");
  if (SLUG_SET.has(asSlug)) {
    return asSlug as CanonicalGradeSlug;
  }

  const key = collapseKey(trimmed);
  if (ALIAS_TO_SLUG[key]) {
    return ALIAS_TO_SLUG[key];
  }

  // "1st-Grade" / "1ST GRADE" already handled; try hyphenated ordinals
  const hyphenKey = key.replace(/ /g, "-");
  if (ALIAS_TO_SLUG[hyphenKey]) {
    return ALIAS_TO_SLUG[hyphenKey];
  }

  return null;
}

/**
 * True if the child's grade matches any of the class grade-level slugs.
 */
export function gradesMatch(
  childGrade: string | null | undefined,
  classGradeSlugs: string[] | null | undefined,
): boolean {
  if (!classGradeSlugs?.length) return false;
  const childSlug = normalizeGradeLevel(childGrade);
  if (!childSlug) return false;
  return classGradeSlugs.some((g) => normalizeGradeLevel(g) === childSlug);
}

export function gradeSlugToLabel(slug: string | null | undefined): string {
  const normalized = normalizeGradeLevel(slug);
  if (!normalized) return slug?.trim() || "Unknown";
  return GRADE_LEVEL_OPTIONS.find((o) => o.value === normalized)?.label ?? normalized;
}
