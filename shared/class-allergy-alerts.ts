/**
 * Classroom allergy alerts: which free-text allergies should notify
 * other families in the class, without naming the student.
 *
 * Peanut / tree nut / sesame are always treated as classroom restrictions.
 * Other foods notify only when the text marks them severe (anaphylaxis, EpiPen).
 */

export type ClassroomAllergen = {
  key: string;
  display: string;
};

const ALWAYS_RESTRICT: Array<{ key: string; display: string; patterns: RegExp }> = [
  { key: "peanut", display: "peanut", patterns: [/\bpeanuts?\b/i, /\bpeanut\s*butter\b/i] },
  {
    key: "tree_nut",
    display: "tree nut",
    patterns: [
      /\btree\s*nuts?\b/i,
      /\balmonds?\b/i,
      /\bwalnuts?\b/i,
      /\bcashews?\b/i,
      /\bpecans?\b/i,
      /\bpistachios?\b/i,
      /\bhazelnuts?\b/i,
      /\bbrazil\s*nuts?\b/i,
      /\bmacadamia\b/i,
    ],
  },
  { key: "sesame", display: "sesame", patterns: [/\bsesame\b/i, /\btahini\b/i] },
];

const CONDITIONAL_RESTRICT: Array<{ key: string; display: string; patterns: RegExp }> = [
  {
    key: "shellfish",
    display: "shellfish",
    patterns: [/\bshellfish\b/i, /\bshrimp\b/i, /\bprawns?\b/i, /\bcrab\b/i, /\blobster\b/i],
  },
  { key: "egg", display: "egg", patterns: [/\beggs?\b/i] },
  { key: "dairy", display: "dairy", patterns: [/\bdairy\b/i, /\bmilk\b/i] },
  { key: "wheat", display: "wheat", patterns: [/\bwheat\b/i] },
  { key: "soy", display: "soy", patterns: [/\bsoy\b/i, /\bsoya\b/i] },
  { key: "fish", display: "fish", patterns: [/\bfish\b/i] },
];

const SEVERITY_MARKER =
  /\b(severe|anaphyla\w*|epi[\s-]?pen|life[\s-]?threat(?:ening)?)\b/i;

const GENERIC_SEVERE: ClassroomAllergen = {
  key: "severe_food",
  display: "severe food",
};

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
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

export function extractSevereAllergens(value: unknown): ClassroomAllergen[] {
  const text = normalizeAllergiesText(value);
  if (!text) return [];

  const found: ClassroomAllergen[] = [];
  const seen = new Set<string>();
  const add = (allergen: ClassroomAllergen) => {
    if (seen.has(allergen.key)) return;
    seen.add(allergen.key);
    found.push(allergen);
  };

  for (const allergen of ALWAYS_RESTRICT) {
    if (matchesAny(text, allergen.patterns)) {
      add({ key: allergen.key, display: allergen.display });
    }
  }

  const severe = SEVERITY_MARKER.test(text);
  if (severe) {
    for (const allergen of CONDITIONAL_RESTRICT) {
      if (matchesAny(text, allergen.patterns)) {
        add({ key: allergen.key, display: allergen.display });
      }
    }
    if (found.length === 0) add(GENERIC_SEVERE);
  }

  return found;
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

export function classroomAllergyReminderCopy(
  className: string,
  allergens: ClassroomAllergen[],
): { subject: string; content: string; bannerTitle: string; bannerBody: string } {
  const list = formatAllergenList(allergens.map((item) => item.display)) || "severe food";
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

export function childHasSevereClassroomAllergy(child: {
  allergies?: unknown;
  hasSevereAllergies?: unknown;
}): boolean {
  if (extractSevereAllergens(child?.allergies).length > 0) return true;
  return Boolean(child?.hasSevereAllergies);
}
