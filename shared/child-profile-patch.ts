/**
 * Sanitize parent/admin child-profile updates before `storage.updateChild`.
 * `children.allergies` is a text column — arrays from older clients must be joined.
 */

export function normalizeAllergiesInput(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(", ");
    return joined || null;
  }
  const text = String(value).trim();
  return text || null;
}

export function allergiesToFormValue(value: unknown): string {
  return normalizeAllergiesInput(value) ?? "";
}

const CHILD_UPDATE_COLUMNS = new Set([
  "firstName",
  "lastName",
  "birthdate",
  "gradeLevel",
  "gender",
  "school",
  "schoolId",
  "locationId",
  "learningStyle",
  "specialNeeds",
  "interests",
  "allergies",
  "medicalInfo",
  "profileImage",
  "emergencyContact",
  "additionalLanguages",
  "notes",
  "parentEmail",
  "currentLexileRange",
  "currentReadingGradeLevel",
  "currentBookList",
]);

/**
 * Pick known `children` columns and map legacy aliases (`grade`, `medicalNotes`).
 * Drops `parentId` / unknown keys so Drizzle does not SET a missing column.
 */
export function buildChildProfilePatch(
  body: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};

  const patch: Record<string, unknown> = {};

  if (body.grade != null && body.gradeLevel == null) {
    const grade = String(body.grade).trim();
    if (grade) patch.gradeLevel = grade;
  }
  if (body.medicalNotes != null && body.medicalInfo == null) {
    patch.medicalInfo =
      typeof body.medicalNotes === "string"
        ? body.medicalNotes
        : String(body.medicalNotes);
  } else if (
    body.medicalConditions != null &&
    body.medicalInfo == null &&
    body.medicalNotes == null
  ) {
    patch.medicalInfo = Array.isArray(body.medicalConditions)
      ? body.medicalConditions.map((item) => String(item).trim()).filter(Boolean).join(", ")
      : String(body.medicalConditions);
  }

  for (const key of CHILD_UPDATE_COLUMNS) {
    if (body[key] === undefined) continue;
    if (key === "allergies") {
      patch.allergies = normalizeAllergiesInput(body[key]);
      continue;
    }
    if (key === "gender") {
      const gender = body[key];
      patch.gender =
        gender == null || String(gender).trim() === "" ? null : String(gender).trim();
      continue;
    }
    patch[key] = body[key];
  }

  return patch;
}
