/**
 * Classroom allergy alerts: which allergies should notify other families
 * in the class, without naming the student.
 *
 * Structured tags (`shared/child-allergy-tags.ts`) win when present.
 * Peanut / tree nut / sesame (including a bare "nut") are always restrictions.
 * Other foods notify only when marked severe (tag severity, or anaphylaxis / EpiPen).
 *
 * Parent copy lists the named foods from the note when we have them
 * (e.g. tree nuts (pistachios, cashews, and hazelnuts)). Never name the student.
 */

import { parseStructuredAllergyTags, type ChildAllergyTag } from "./child-allergy-tags";

export type ClassroomAllergen = {
  key: string;
  display: string;
  examples?: string[];
};

type AllergenPattern = { re: RegExp; example?: string };

type RestrictRule = {
  key: string;
  display: string;
  patterns: AllergenPattern[];
};

const ALWAYS_RESTRICT: RestrictRule[] = [
  {
    key: "peanut",
    display: "peanut",
    patterns: [
      { re: /\bpeanut\s*butter\b/i, example: "peanut butter" },
      { re: /\bpeanuts?\b/i, example: "peanuts" },
    ],
  },
  {
    key: "tree_nut",
    display: "tree nuts",
    patterns: [
      { re: /\bpistachios?\b/i, example: "pistachios" },
      { re: /\bcashews?\b/i, example: "cashews" },
      { re: /\bhazelnuts?\b/i, example: "hazelnuts" },
      { re: /\balmonds?\b/i, example: "almonds" },
      { re: /\bwalnuts?\b/i, example: "walnuts" },
      { re: /\bpecans?\b/i, example: "pecans" },
      { re: /\bbrazil\s*nuts?\b/i, example: "Brazil nuts" },
      { re: /\bmacadamia\b/i, example: "macadamia nuts" },
      { re: /\btree\s*nuts?\b/i },
      { re: /\bnuts?\b/i },
    ],
  },
  {
    key: "sesame",
    display: "sesame",
    patterns: [
      { re: /\btahini\b/i, example: "tahini" },
      { re: /\bsesame\b/i, example: "sesame" },
    ],
  },
];

const CONDITIONAL_RESTRICT: RestrictRule[] = [
  {
    key: "shellfish",
    display: "shellfish",
    patterns: [
      { re: /\bshrimp\b/i, example: "shrimp" },
      { re: /\bprawns?\b/i, example: "prawns" },
      { re: /\bcrab\b/i, example: "crab" },
      { re: /\blobster\b/i, example: "lobster" },
      { re: /\bshellfish\b/i, example: "shellfish" },
    ],
  },
  { key: "egg", display: "egg", patterns: [{ re: /\beggs?\b/i, example: "eggs" }] },
  {
    key: "dairy",
    display: "dairy",
    patterns: [
      { re: /\bmilk\b/i, example: "milk" },
      { re: /\bdairy\b/i, example: "dairy" },
    ],
  },
  { key: "wheat", display: "wheat", patterns: [{ re: /\bwheat\b/i, example: "wheat" }] },
  {
    key: "soy",
    display: "soy",
    patterns: [
      { re: /\bsoya\b/i, example: "soy" },
      { re: /\bsoy\b/i, example: "soy" },
    ],
  },
  { key: "fish", display: "fish", patterns: [{ re: /\bfish\b/i, example: "fish" }] },
];

const DEFAULT_TREE_NUT_EXAMPLES = [
  "almonds",
  "cashews",
  "walnuts",
  "pistachios",
  "hazelnuts",
];

const SEVERITY_MARKER =
  /\b(severe|anaphyla\w*|epi[\s-]?pen|life[\s-]?threat(?:ening)?)\b/i;

const GENERIC_SEVERE: ClassroomAllergen = {
  key: "severe_food",
  display: "severe food",
};

function uniqueExamples(values?: Array<string | undefined> | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sameFoodLabel(a: string, b: string): boolean {
  const fold = (value: string) => value.trim().toLowerCase().replace(/s\b/, "");
  return fold(a) === fold(b);
}

function collectExamples(text: string, patterns: AllergenPattern[]): string[] {
  return uniqueExamples(
    patterns.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.example),
  );
}

function matchesAny(text: string, patterns: AllergenPattern[]): boolean {
  return patterns.some((pattern) => pattern.re.test(text));
}

function allergenFromRule(rule: RestrictRule, text: string): ClassroomAllergen {
  return {
    key: rule.key,
    display: rule.display,
    examples: collectExamples(text, rule.patterns),
  };
}

export function allergyTextHasSeverityMarker(value: unknown): boolean {
  const text = normalizeAllergiesText(value);
  return text ? SEVERITY_MARKER.test(text) : false;
}

export function normalizeAllergiesText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  return String(value).trim();
}

function extractSevereAllergensFromText(text: string, forceSevere = false): ClassroomAllergen[] {
  if (!text) return [];

  const found: ClassroomAllergen[] = [];
  const add = (allergen: ClassroomAllergen) => {
    const next = mergeClassroomAllergens(found, [allergen]);
    found.splice(0, found.length, ...next);
  };

  for (const rule of ALWAYS_RESTRICT) {
    if (matchesAny(text, rule.patterns)) add(allergenFromRule(rule, text));
  }

  const severe = forceSevere || SEVERITY_MARKER.test(text);
  if (severe) {
    for (const rule of CONDITIONAL_RESTRICT) {
      if (matchesAny(text, rule.patterns)) add(allergenFromRule(rule, text));
    }
    // "severe feeding restrictions" is not a pack-this-food classroom ban.
    if (found.length === 0 && !/\bfeed/i.test(text)) add(GENERIC_SEVERE);
  }

  return found;
}

function classroomAllergensFromTags(tags: ChildAllergyTag[]): ClassroomAllergen[] {
  let merged: ClassroomAllergen[] = [];
  for (const tag of tags) {
    if (tag.kind === "medication" || tag.kind === "environmental") continue;
    const fromName = extractSevereAllergensFromText(tag.name, tag.severity === "severe");
    if (fromName.length > 0) {
      merged = mergeClassroomAllergens(merged, fromName);
      continue;
    }
    if (tag.kind === "food" && tag.severity === "severe") {
      merged = mergeClassroomAllergens(merged, [
        { key: `custom:${tag.name.toLowerCase()}`, display: tag.name.trim(), examples: [tag.name.trim()] },
      ]);
    }
  }
  return merged;
}

export function extractSevereAllergens(value: unknown): ClassroomAllergen[] {
  const structured = parseStructuredAllergyTags(value);
  if (structured) return classroomAllergensFromTags(structured);
  return extractSevereAllergensFromText(normalizeAllergiesText(value));
}

export function mergeClassroomAllergens(
  existing: ClassroomAllergen[],
  incoming: ClassroomAllergen[],
): ClassroomAllergen[] {
  const byKey = new Map<string, ClassroomAllergen>();
  for (const item of [...existing, ...incoming]) {
    const prev = byKey.get(item.key);
    if (!prev) {
      byKey.set(item.key, { ...item, examples: uniqueExamples(item.examples) });
      continue;
    }
    byKey.set(item.key, {
      ...prev,
      examples: uniqueExamples([...(prev.examples ?? []), ...(item.examples ?? [])]),
    });
  }
  return [...byKey.values()];
}

export function formatAllergenWithExamples(allergen: ClassroomAllergen): string {
  const extras = uniqueExamples(allergen.examples).filter(
    (example) => !sameFoodLabel(example, allergen.display),
  );
  if (extras.length === 0) {
    if (allergen.key === "tree_nut") {
      return `${allergen.display} (${formatAllergenList(DEFAULT_TREE_NUT_EXAMPLES)})`;
    }
    return allergen.display;
  }
  return `${allergen.display} (${formatAllergenList(extras)})`;
}

export function allergenKeys(allergens: ClassroomAllergen[]): string[] {
  return allergens.map((item) => item.key);
}

export function newlyIntroducedAllergens(
  candidate: ClassroomAllergen[],
  alreadyPresent: ClassroomAllergen[],
): ClassroomAllergen[] {
  const existing = new Set(alreadyPresent.map((item) => item.key));
  return candidate.filter((item) => !existing.has(item.key));
}

export function formatAllergenList(displays: string[]): string {
  const unique = [...new Set(displays.map((item) => item.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

export type HouseholdAllergyAlert = {
  classId: number;
  className: string;
  allergens: ClassroomAllergen[];
  children?: Array<{ firstName: string }>;
};

export function householdAllergySignature(alerts: HouseholdAllergyAlert[]): string {
  return alerts
    .map((alert) => {
      const keys = alert.allergens
        .map((item) => `${item.key}:${uniqueExamples(item.examples).slice().sort().join("+")}`)
        .sort()
        .join(",");
      return `${alert.classId}:${keys}`;
    })
    .sort()
    .join("|");
}

export function namedClassroomAllergens(allergens: ClassroomAllergen[]): ClassroomAllergen[] {
  return allergens.filter((item) => item.key !== GENERIC_SEVERE.key);
}

export function classroomAllergyChipLabel(allergens: ClassroomAllergen[]): string {
  const named = namedClassroomAllergens(allergens);
  const list = formatAllergenList(named.map((item) => item.display));
  return list ? `No ${list}` : "Severe allergy";
}

export function householdAllergyAlerts(alerts: HouseholdAllergyAlert[]): HouseholdAllergyAlert[] {
  return alerts
    .map((alert) => ({ ...alert, allergens: namedClassroomAllergens(alert.allergens) }))
    .filter((alert) => alert.allergens.length > 0);
}

export function householdAllergyCardCopy(alerts: HouseholdAllergyAlert[]): {
  title: string;
  summary: string;
  rows: Array<{
    classId: number;
    className: string;
    allergenLabel: string;
    childrenLabel: string;
    label: string;
  }>;
} {
  const visible = householdAllergyAlerts(alerts);
  return {
    title: "Classroom food restrictions",
    summary: "A student in these classes has a severe allergy. Do not pack the foods listed.",
    rows: visible.map((alert) => {
      const allergenLabel = formatAllergenList(alert.allergens.map((item) => formatAllergenWithExamples(item)));
      const kids = formatAllergenList(
        (alert.children ?? []).map((child) => child.firstName.trim()).filter(Boolean),
      );
      const className = alert.className.trim() || "this class";
      const childrenLabel = kids ? `Your children in this class: ${kids}` : "";
      return {
        classId: alert.classId,
        className,
        allergenLabel,
        childrenLabel,
        label: `${className}: do not pack ${allergenLabel}`,
      };
    }),
  };
}

export function classroomAllergyReminderCopy(
  className: string,
  allergens: ClassroomAllergen[],
): { subject: string; content: string; bannerTitle: string; bannerBody: string } {
  const list = formatAllergenList(allergens.map((item) => formatAllergenWithExamples(item))) || "severe food";
  const titleName = className.trim() || "this class";
  return {
    subject: `Allergy reminder: ${titleName}`,
    content:
      `A student in ${titleName} has a ${list} allergy. ` +
      `Please do not pack ${list} or foods that contain ${list}. ` +
      `This reminder never names the student.`,
    bannerTitle: `Allergy reminder for ${titleName}`,
    bannerBody:
      `A student in this class has a ${list} allergy. ` +
      `Please do not pack ${list} or foods that contain ${list}. ` +
      `We never share the student's name.`,
  };
}

export function classroomAllergyAdminCopy(
  className: string,
  allergens: ClassroomAllergen[],
): { bannerTitle: string; bannerBody: string } {
  const list = formatAllergenList(allergens.map((item) => formatAllergenWithExamples(item))) || "severe food";
  const titleName = className.trim() || "this class";
  return {
    bannerTitle: `Severe allergy in ${titleName}`,
    bannerBody:
      `A seated student has a ${list} allergy. ` +
      `Do not allow ${list} snacks or materials in this classroom. ` +
      `This reminder never names the student.`,
  };
}

export function classAllergySummary(allergens: ClassroomAllergen[]): {
  hasSevereAllergy: boolean;
  severeAllergens: ClassroomAllergen[];
} {
  return {
    hasSevereAllergy: allergens.length > 0,
    severeAllergens: allergens,
  };
}

export function childHasSevereClassroomAllergy(child: {
  allergies?: unknown;
  hasSevereAllergies?: unknown;
}): boolean {
  if (extractSevereAllergens(child?.allergies).length > 0) return true;
  return Boolean(child?.hasSevereAllergies);
}
