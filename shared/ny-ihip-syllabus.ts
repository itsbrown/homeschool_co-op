export const IHIP_SYLLABUS_TEMPLATE_VERSION = "2026-09-asa-v2";
export const IHIP_INSTRUCTOR = "Parent(s)";

export type IhipCoverage = "coop" | "home" | "both";

export type NyIhipBand = "early" | "lower" | "mid" | "upper" | "secondary";

export type NyIhipSubjectKey =
  | "reading"
  | "spelling"
  | "writing"
  | "english"
  | "math"
  | "science"
  | "history"
  | "health"
  | "music"
  | "visual_arts"
  | "pe"
  | "foreign_language";

export type NyIhipSubjectDef = {
  key: NyIhipSubjectKey;
  label: string;
  required: boolean;
};

/** Monroe One grades 1–6 form rows (CR 100.10 alternate template). */
const K6_SUBJECTS: NyIhipSubjectDef[] = [
  { key: "math", label: "Mathematics", required: true },
  { key: "reading", label: "Reading", required: true },
  { key: "spelling", label: "Spelling", required: true },
  { key: "writing", label: "Writing", required: true },
  { key: "english", label: "English", required: true },
  { key: "science", label: "Science", required: true },
  { key: "history", label: "History", required: true },
  { key: "health", label: "Health", required: true },
  { key: "visual_arts", label: "Visual Arts", required: true },
  { key: "pe", label: "Physical Education", required: true },
  { key: "music", label: "Music", required: true },
  { key: "foreign_language", label: "Foreign language", required: false },
];

const SECONDARY_SUBJECTS: NyIhipSubjectDef[] = [
  { key: "english", label: "English language arts", required: true },
  { key: "math", label: "Mathematics", required: true },
  { key: "science", label: "Science", required: true },
  { key: "history", label: "History, participation in government, and economics", required: true },
  { key: "health", label: "Health education", required: true },
  { key: "music", label: "Music", required: true },
  { key: "visual_arts", label: "Visual arts", required: true },
  { key: "pe", label: "Physical education", required: true },
  { key: "foreign_language", label: "Foreign language", required: true },
];

const SKIP_TITLE =
  /\b(snack|lunch|reset|dismiss|dismissal|pack|recess|break|arrival|transition|clean\s*up)\b/i;

const OTHER_AREA_MAP: Array<{ pattern: RegExp; key: NyIhipSubjectKey }> = [
  { pattern: /\b(latin|spanish|french|foreign|world language)\b/i, key: "foreign_language" },
  { pattern: /\b(math|arithmetic|algebra|geometry|astronomy)\b/i, key: "math" },
  { pattern: /\b(science|earth|specimen|biology|chemistry|physics)\b/i, key: "science" },
  { pattern: /\b(history|civics|preamble|constitution|geography|citizenship|social studies|convention|colonial)\b/i, key: "history" },
  { pattern: /\b(health)\b/i, key: "health" },
  { pattern: /\b(music|choir|song)\b/i, key: "music" },
  { pattern: /\b(art|drawing|painting)\b/i, key: "visual_arts" },
  { pattern: /\b(physical education|phys ed|\bpe\b|gym|athletics)\b/i, key: "pe" },
];

const ELA_FINE: Array<{ pattern: RegExp; key: NyIhipSubjectKey }> = [
  { pattern: /\b(reading|literacy|morning circle|phonics)\b/i, key: "reading" },
  { pattern: /\b(phonogram|orthography|spelling)\b/i, key: "spelling" },
  { pattern: /\b(writing|composition|handwriting)\b/i, key: "writing" },
  { pattern: /\b(language arts|literature|english|art of argument|debate|fallacy)\b/i, key: "english" },
];

export function requiredSubjectsForBand(band: NyIhipBand): NyIhipSubjectDef[] {
  return band === "secondary" ? SECONDARY_SUBJECTS : K6_SUBJECTS;
}

export function normalizeSubjectForBand(key: NyIhipSubjectKey, band: NyIhipBand): NyIhipSubjectKey {
  if (band === "secondary" && (key === "reading" || key === "spelling" || key === "writing")) {
    return "english";
  }
  return key;
}

export function isSkippedSyllabusBlock(title: string | null | undefined): boolean {
  return SKIP_TITLE.test((title || "").trim());
}

function mapElaFine(raw: string): NyIhipSubjectKey | null {
  const hits: NyIhipSubjectKey[] = [];
  for (const row of ELA_FINE) {
    if (row.pattern.test(raw) && !hits.includes(row.key)) hits.push(row.key);
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  if (hits.includes("reading")) return "reading";
  if (hits.includes("english")) return "english";
  return hits[0];
}

export function mapSlotToNySubject(
  subjectArea: string | null | undefined,
  title: string | null | undefined,
): NyIhipSubjectKey | null {
  const area = (subjectArea || "").trim();
  const name = (title || "").trim();
  if (isSkippedSyllabusBlock(name) || isSkippedSyllabusBlock(area)) return null;

  const tryMap = (raw: string): NyIhipSubjectKey | null => {
    if (!raw) return null;
    const ela = mapElaFine(raw);
    if (ela) return ela;
    for (const row of OTHER_AREA_MAP) {
      if (row.pattern.test(raw)) return row.key;
    }
    return null;
  };

  return tryMap(area) || tryMap(name);
}

export function schoolYearFromDate(from: Date = new Date()): string {
  const y = from.getFullYear();
  const start = from.getMonth() >= 6 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function ageFromBirthdate(birthdate: string | Date | null | undefined, on: Date = new Date()): number | null {
  if (!birthdate) return null;
  const d = typeof birthdate === "string" ? new Date(`${birthdate}T00:00:00`) : birthdate;
  if (Number.isNaN(d.getTime())) return null;
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function parseIsoDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMdY(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Four evenly spaced dates on [start, end], or school-year quarter defaults. */
export function suggestedQuarterlyDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  schoolYear: string,
): string[] {
  const start = startDate ? parseIsoDate(startDate) : null;
  const end = endDate ? parseIsoDate(endDate) : null;
  if (start && end && end.getTime() > start.getTime()) {
    const span = end.getTime() - start.getTime();
    return [0, 1, 2, 3].map((i) => {
      const t = start.getTime() + Math.round((span * (i + 1)) / 4);
      return formatMdY(new Date(t));
    });
  }
  const yearStart = parseInt(schoolYear.slice(0, 4), 10);
  if (Number.isNaN(yearStart)) {
    return ["Sep 15", "Nov 15", "Feb 15", "Apr 15"];
  }
  return [
    formatMdY(new Date(yearStart, 8, 15)),
    formatMdY(new Date(yearStart, 10, 15)),
    formatMdY(new Date(yearStart + 1, 1, 15)),
    formatMdY(new Date(yearStart + 1, 3, 15)),
  ];
}

export function parentCompletePrompt(label: string): string {
  return `Parent complete — add curriculum materials and learning objectives for ${label.toLowerCase()}.`;
}

/** @deprecated Use parentCompletePrompt — home subjects are blanks, not one-liners. */
export function homeGapCopy(label: string): string {
  return parentCompletePrompt(label);
}

export function buildCoverageNote(slotTitles: string[]): string {
  const slots = uniqueTrimmed(slotTitles).slice(0, 6);
  if (slots.length) {
    return `Taught during co-op meetings (${slots.join(", ")}). Parents continue this subject at home as needed.`;
  }
  return "Taught during co-op meetings. Parents continue this subject at home as needed.";
}

export function buildSyllabusParagraph(args: {
  label: string;
  coverage: IhipCoverage;
  slotTitles: string[];
  weekTitles?: string[];
  description?: string | null;
}): string {
  if (args.coverage === "home") return parentCompletePrompt(args.label);
  return buildCoverageNote(args.slotTitles);
}

export function uniqueTrimmed(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = (raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function looksLikeExternalUrl(value: string): boolean {
  return /https?:\/\//i.test(value) || /drive\.google|docs\.google/i.test(value);
}

export function extractObjectiveTexts(objectives: unknown): string[] {
  if (!Array.isArray(objectives)) return [];
  const out: string[] = [];
  for (const item of objectives) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === "object" && "text" in item) {
      const text = String((item as { text?: unknown }).text || "").trim();
      if (text) out.push(text);
    }
  }
  return uniqueTrimmed(out);
}
