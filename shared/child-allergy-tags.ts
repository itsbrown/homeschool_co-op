export const ALLERGY_SEVERITIES = ["mild", "moderate", "severe"] as const;
export const ALLERGY_KINDS = ["food", "medication", "environmental", "other"] as const;

export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];
export type AllergyKind = (typeof ALLERGY_KINDS)[number];

export type ChildAllergyTag = {
  name: string;
  severity: AllergySeverity;
  kind: AllergyKind;
};

const NONE_NOTES = new Set([
  "none",
  "none.",
  "n/a",
  "na",
  "no",
  "no allergies",
  "no food allergies",
  "none aware",
  "unknown",
]);

export const COMMON_FOOD_ALLERGY_SUGGESTIONS = [
  "Peanut",
  "Tree nut",
  "Sesame",
  "Dairy",
  "Egg",
  "Wheat",
  "Soy",
  "Fish",
  "Shellfish",
] as const;

export function isAllergySeverity(value: unknown): value is AllergySeverity {
  return ALLERGY_SEVERITIES.includes(String(value) as AllergySeverity);
}

export function isAllergyKind(value: unknown): value is AllergyKind {
  return ALLERGY_KINDS.includes(String(value) as AllergyKind);
}

export function isChildAllergyTag(value: unknown): value is ChildAllergyTag {
  if (!value || typeof value !== "object") return false;
  const tag = value as Record<string, unknown>;
  return (
    typeof tag.name === "string" &&
    tag.name.trim().length > 0 &&
    isAllergySeverity(tag.severity) &&
    isAllergyKind(tag.kind)
  );
}

export function serializeChildAllergyTags(tags: ChildAllergyTag[]): string {
  const clean = tags
    .map((tag) => ({
      name: tag.name.trim(),
      severity: tag.severity,
      kind: tag.kind,
    }))
    .filter((tag) => tag.name);
  return clean.length ? JSON.stringify(clean) : "";
}

export function parseStructuredAllergyTags(value: unknown): ChildAllergyTag[] | null {
  if (Array.isArray(value) && value.length > 0 && value.every(isChildAllergyTag)) {
    return value.map((tag) => ({
      name: tag.name.trim(),
      severity: tag.severity,
      kind: tag.kind,
    }));
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isChildAllergyTag)) {
      return parsed.map((tag) => ({
        name: String(tag.name).trim(),
        severity: tag.severity,
        kind: tag.kind,
      }));
    }
  } catch {
    return null;
  }
  return null;
}

function looksLikeNone(text: string): boolean {
  return NONE_NOTES.has(text.trim().toLowerCase());
}

export function legacyAllergyTextToTags(value: unknown): ChildAllergyTag[] {
  const structured = parseStructuredAllergyTags(value);
  if (structured) return structured;
  if (value == null) return [];
  const text = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).join(", ")
    : String(value).trim();
  if (!text || looksLikeNone(text)) return [];

  const parts = text
    .split(/[,;\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts
    .filter((part) => !looksLikeNone(part))
    .map((name) => ({
      name,
      severity: /\b(severe|anaphyla\w*|epi[\s-]?pen|life[\s-]?threat)/i.test(name)
        ? "severe"
        : "moderate",
      kind: /\b(amoxicillin|zithromax|omnif|penicillin|antibiotic|inhaler|asthma|seasonal|latex|diabetes)\b/i.test(
        name,
      )
        ? name.toLowerCase().includes("latex")
          ? "environmental"
          : /\b(amoxicillin|zithromax|omnif|penicillin|antibiotic)\b/i.test(name)
            ? "medication"
            : "other"
        : "food",
    }));
}

export function formatAllergyTagsDisplay(value: unknown): string {
  const tags = parseStructuredAllergyTags(value) ?? legacyAllergyTextToTags(value);
  if (tags.length === 0) return "";
  return tags.map((tag) => `${tag.name} (${tag.severity})`).join(", ");
}

export function allergyFieldToStoredValue(value: unknown): string | null {
  const structured = parseStructuredAllergyTags(value);
  if (structured) {
    const serialized = serializeChildAllergyTags(structured);
    return serialized || null;
  }
  if (Array.isArray(value)) {
    if (value.every(isChildAllergyTag)) {
      const serialized = serializeChildAllergyTags(value);
      return serialized || null;
    }
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}
