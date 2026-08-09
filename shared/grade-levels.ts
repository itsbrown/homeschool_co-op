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

/**
 * Age in completed years from a birthdate (YYYY-MM-DD or parseable date string).
 * Returns null when the date is missing/invalid.
 */
export function ageFromBirthdate(
  birthdate: string | Date | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (birthdate == null || birthdate === "") return null;
  const birth =
    birthdate instanceof Date
      ? birthdate
      : new Date(typeof birthdate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birthdate)
          ? `${birthdate}T12:00:00`
          : birthdate);
  if (Number.isNaN(birth.getTime())) return null;

  let age = asOf.getFullYear() - birth.getFullYear();
  const monthDiff = asOf.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birth.getDate())) {
    age--;
  }
  return age < 0 ? 0 : age;
}

const ORDINAL_GRADE_SLUGS: CanonicalGradeSlug[] = [
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
];

/**
 * School grade from age using age − 5:
 * ≤3 → Littles, 4 → Pre-K, 5 → Kindergarten, 6 → 1st … capped at 12th.
 */
export function gradeLevelFromAge(age: number | null | undefined): CanonicalGradeSlug | null {
  if (age == null || !Number.isFinite(age)) return null;
  const years = Math.floor(age);
  if (years <= 3) return "littles";
  if (years === 4) return "pre-k";
  if (years === 5) return "kindergarten";
  const gradeNum = years - 5; // 6→1 … 17→12
  if (gradeNum < 1) return "kindergarten";
  if (gradeNum > 12) return "12th-grade";
  return ORDINAL_GRADE_SLUGS[gradeNum - 1] ?? null;
}

/** Canonical grade slug from birthdate via age − 5. */
export function gradeLevelFromBirthdate(
  birthdate: string | Date | null | undefined,
  asOf: Date = new Date(),
): CanonicalGradeSlug | null {
  return gradeLevelFromAge(ageFromBirthdate(birthdate, asOf));
}

/** YYYY-MM-DD for `<input type="date">` from ISO or date-only strings. */
export function toDateInputValue(birthdate: string | Date | null | undefined): string {
  if (birthdate == null || birthdate === "") return "";
  if (birthdate instanceof Date) {
    if (Number.isNaN(birthdate.getTime())) return "";
    const y = birthdate.getFullYear();
    const m = String(birthdate.getMonth() + 1).padStart(2, "0");
    const d = String(birthdate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const trimmed = String(birthdate).trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}
