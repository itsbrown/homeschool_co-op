import { normalizeGradeLevel } from "./grade-levels";
import { isSnackOrLunchBlockTitle } from "./snack-handwashing";

export const CURRICULUM_BANDS = [
  "seekers",
  "pioneers",
  "logic",
  "tycoons",
  "yankee",
  "other",
] as const;

export type CurriculumBand = (typeof CURRICULUM_BANDS)[number];

export const CURRICULUM_SUBJECTS = [
  "latin",
  "science",
  "math",
  "civics",
  "aoa",
  "art",
  "memorization",
] as const;

export type CurriculumSubject = (typeof CURRICULUM_SUBJECTS)[number];

export type CurriculumAssetKind = "lesson" | "guide";

export type CurriculumMatchStatus =
  | "ok"
  | "band_mismatch"
  | "time_overflow"
  | "duplicate"
  | "missing"
  | "stale"
  | "empty";

export type ParsedCurriculumFilename = {
  title: string;
  band: CurriculumBand | null;
  sessionNo: number | null;
  unit: string | null;
  subject: CurriculumSubject | null;
  assetKind: CurriculumAssetKind;
  minutes: number | null;
};

export type MatchableAsset = {
  id: number;
  name: string;
  title?: string | null;
  band?: string | null;
  sessionNo?: number | null;
  subject?: string | null;
  assetKind?: string | null;
  minutes?: number | null;
  mimeType?: string | null;
  webViewLink?: string | null;
  objectives?: string[] | null;
  materials?: string[] | null;
};

export type MatchableSkeletonBlock = {
  id: number;
  blockType?: string | null;
  subjectArea?: string | null;
  subject?: string | null;
  defaultTitle?: string | null;
  startTime: string;
  endTime: string;
};

export type ProposedCurriculumAttachment = {
  skeletonBlockId: number;
  curriculumAssetId: number | null;
  title: string | null;
  description: string | null;
  objectives: string[];
  materials: string[];
  homework: string | null;
  lessonLink: string | null;
  notes: string | null;
  matchStatus: CurriculumMatchStatus;
};

const TITLE_BAND_RULES: Array<{ re: RegExp; band: CurriculumBand }> = [
  { re: /\bgrammar\s+hall\b/i, band: "seekers" },
  { re: /\bseekers\b/i, band: "seekers" },
  { re: /\blogic\s+hall\b/i, band: "logic" },
  { re: /\bpioneers\b/i, band: "pioneers" },
  { re: /\btycoons\b/i, band: "tycoons" },
  { re: /\byankee\b/i, band: "yankee" },
];

const SUBJECT_RULES: Array<{ re: RegExp; subject: CurriculumSubject }> = [
  { re: /\b(latin|foreign language|word trees)\b/i, subject: "latin" },
  { re: /\b(art of argument|aoa|fallacy|debate|fight the claim|circumstantial|circumstance|answer the claim)\b/i, subject: "aoa" },
  { re: /\b(science|specimen|inside earth|elemental)\b/i, subject: "science" },
  { re: /\b(math|astronomy|gnomon|line segment)\b/i, subject: "math" },
  { re: /\b(civics|preamble|constitution|convention)\b/i, subject: "civics" },
  { re: /\b(art)\b/i, subject: "art" },
  { re: /\bmemorization\b/i, subject: "memorization" },
];

const GUIDE_RE =
  /\b(10[- ]?week|living standards|afternoon memorization|guide)\b/i;

const NON_TEACHING_TITLE = /\b(reset|dismiss|pack)\b/i;

export function classBandFromClass(input: {
  title?: string | null;
  gradeLevels?: string[] | null;
}): CurriculumBand {
  const title = input.title || "";
  for (const rule of TITLE_BAND_RULES) {
    if (rule.re.test(title)) return rule.band;
  }

  const grades = (input.gradeLevels || [])
    .map((g) => normalizeGradeLevel(g))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const has = (slug: string) => grades.includes(slug as (typeof grades)[number]);
  if ((has("3rd-grade") || has("4th-grade")) && !has("5th-grade") && !has("6th-grade")) {
    return "seekers";
  }
  if (has("5th-grade") || has("6th-grade")) return "pioneers";
  if (has("1st-grade") || has("2nd-grade")) return "tycoons";
  if (has("pre-k") || has("kindergarten") || has("littles")) return "yankee";
  return "other";
}

export function parseCurriculumFilename(name: string): ParsedCurriculumFilename {
  const trimmed = (name || "").trim();
  const withoutExt = trimmed.replace(/\.(pdf|docx?|gdoc|gsheet|gslides)$/i, "");
  const title = withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || trimmed;
  const searchable = `${trimmed} ${title}`;

  let band: CurriculumBand | null = null;
  for (const rule of TITLE_BAND_RULES) {
    if (rule.re.test(searchable)) {
      band = rule.band;
      break;
    }
  }

  const sessionMatch =
    searchable.match(/\b(?:week|w)\s*[-_]?(\d{1,2})\b/i) ||
    searchable.match(/\b(?:session|sess)\s*[-_]?(\d{1,2})\b/i);
  const sessionNo = sessionMatch ? Number(sessionMatch[1]) : null;

  const unitMatch = searchable.match(/\bunit\s*[-_]?(\d{1,2}|[a-z]+)\b/i);
  const unit = unitMatch ? unitMatch[0] : null;

  let subject: CurriculumSubject | null = null;
  for (const rule of SUBJECT_RULES) {
    if (rule.re.test(searchable)) {
      subject = rule.subject;
      break;
    }
  }

  const minutesMatch = searchable.match(/\b(\d{1,3})\s*(?:min|minutes)\b/i);
  const minutes = minutesMatch ? Number(minutesMatch[1]) : null;

  return {
    title,
    band,
    sessionNo: Number.isFinite(sessionNo) ? sessionNo : null,
    unit,
    subject,
    assetKind: GUIDE_RE.test(searchable) ? "guide" : "lesson",
    minutes: Number.isFinite(minutes) ? minutes : null,
  };
}

export function isTeachingSkeletonBlock(block: {
  blockType?: string | null;
  subjectArea?: string | null;
  defaultTitle?: string | null;
}): boolean {
  const title = block.defaultTitle || "";
  if (isSnackOrLunchBlockTitle(title)) return false;
  if (NON_TEACHING_TITLE.test(title)) return false;
  if (block.subjectArea) return true;
  return (block.blockType || "curriculum") === "curriculum";
}

export function blockLengthMinutes(startTime: string, endTime: string): number | null {
  const start = parseHhMm(startTime);
  const end = parseHhMm(endTime);
  if (start == null || end == null) return null;
  const diff = end - start;
  return diff > 0 ? diff : null;
}

function parseHhMm(raw: string): number | null {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function normalizeCurriculumSubject(
  raw: string | null | undefined,
): CurriculumSubject | null {
  if (!raw) return null;
  for (const rule of SUBJECT_RULES) {
    if (rule.re.test(raw)) return rule.subject;
  }
  return null;
}

export function bandsCompatible(
  classBand: CurriculumBand,
  assetBand: string | null | undefined,
): boolean {
  if (!assetBand || assetBand === "other") return true;
  if (assetBand === classBand) return true;
  if (classBand === "seekers" && assetBand === "logic") return false;
  if (classBand === "seekers" && assetBand === "pioneers") return false;
  if (classBand === "logic" && assetBand === "seekers") return true;
  return assetBand === classBand;
}

function scoreAsset(
  asset: MatchableAsset,
  block: MatchableSkeletonBlock,
  weekNumber: number,
  classBand: CurriculumBand,
): number {
  if (!bandsCompatible(classBand, asset.band)) return -1;
  if ((asset.assetKind || "lesson") === "guide") return -1;
  if (/\bworksheets?\b/i.test(asset.name || "")) return -1;
  let score = 10;
  if (asset.sessionNo != null && asset.sessionNo === weekNumber) score += 40;
  else if (asset.sessionNo != null && asset.sessionNo !== weekNumber) score -= 5;
  const blockSubject = normalizeCurriculumSubject(block.subjectArea || block.subject || block.defaultTitle);
  const assetSubject = normalizeCurriculumSubject(asset.subject || asset.name || asset.title);
  if (blockSubject && assetSubject && blockSubject === assetSubject) score += 30;
  if ((asset.mimeType || "") === "application/vnd.google-apps.document") score += 25;
  if ((asset.mimeType || "") === "application/pdf") score -= 20;
  return score;
}

export function matchCurriculumAssetsToBlocks(params: {
  blocks: MatchableSkeletonBlock[];
  assets: MatchableAsset[];
  weekNumber: number;
  classBand: CurriculumBand;
  usedAssetIdsInTerm?: Iterable<number>;
}): ProposedCurriculumAttachment[] {
  const used = new Set(params.usedAssetIdsInTerm ?? []);
  const pool = params.assets.filter(
    (a) => (a.assetKind || "lesson") !== "guide" && !used.has(a.id),
  );
  const assigned = new Set<number>();
  const proposals: ProposedCurriculumAttachment[] = [];

  for (const block of params.blocks) {
    if (!isTeachingSkeletonBlock(block)) {
      proposals.push(emptyProposal(block.id, "empty"));
      continue;
    }

    let best: { asset: MatchableAsset; score: number } | null = null;
    for (const asset of pool) {
      if (assigned.has(asset.id)) continue;
      const score = scoreAsset(asset, block, params.weekNumber, params.classBand);
      if (score < 0) continue;
      if (!best || score > best.score) best = { asset, score };
    }

    if (!best) {
      proposals.push(emptyProposal(block.id, "empty"));
      continue;
    }

    assigned.add(best.asset.id);
    const blockMins = blockLengthMinutes(block.startTime, block.endTime);
    proposals.push(proposalFromAsset(block.id, best.asset, blockMins));
  }

  return proposals;
}

export function isGoogleLessonDoc(mimeType?: string | null): boolean {
  return (mimeType || "") === "application/vnd.google-apps.document";
}

export function proposalFromAsset(
  skeletonBlockId: number,
  asset: MatchableAsset,
  blockMins?: number | null,
): ProposedCurriculumAttachment {
  const overflow =
    asset.minutes != null &&
    blockMins != null &&
    asset.minutes > blockMins;
  const title = (asset.title || asset.name || "").trim() || null;
  return {
    skeletonBlockId,
    curriculumAssetId: asset.id,
    title,
    description: null,
    objectives: Array.isArray(asset.objectives) ? asset.objectives : [],
    materials: Array.isArray(asset.materials) ? asset.materials : [],
    homework: null,
    lessonLink: asset.webViewLink || null,
    notes: null,
    matchStatus: overflow ? "time_overflow" : "ok",
  };
}

function emptyProposal(
  skeletonBlockId: number,
  matchStatus: CurriculumMatchStatus,
): ProposedCurriculumAttachment {
  return {
    skeletonBlockId,
    curriculumAssetId: null,
    title: null,
    description: null,
    objectives: [],
    materials: [],
    homework: null,
    lessonLink: null,
    notes: null,
    matchStatus,
  };
}

export function weekPlanBlockMatchStatus(params: {
  isTeachingSlot: boolean;
  curriculumAssetId?: number | null;
  title?: string | null;
  classBand: CurriculumBand;
  assetBand?: string | null;
  assetMinutes?: number | null;
  blockMinutes?: number | null;
  duplicateInTerm?: boolean;
  assetMissing?: boolean;
  indexStale?: boolean;
}): CurriculumMatchStatus {
  if (params.assetMissing) return "missing";
  if (params.indexStale) return "stale";
  if (params.duplicateInTerm) return "duplicate";
  if (params.curriculumAssetId && !bandsCompatible(params.classBand, params.assetBand)) {
    return "band_mismatch";
  }
  if (
    params.assetMinutes != null &&
    params.blockMinutes != null &&
    params.assetMinutes > params.blockMinutes
  ) {
    return "time_overflow";
  }
  if (params.isTeachingSlot && !params.curriculumAssetId && !params.title) return "empty";
  if (params.curriculumAssetId || params.title) return "ok";
  return "empty";
}

export const MATCH_STATUS_LABEL: Record<CurriculumMatchStatus, string> = {
  ok: "OK",
  band_mismatch: "band mismatch",
  time_overflow: "time overflow",
  duplicate: "duplicate asset",
  missing: "missing file",
  stale: "index stale",
  empty: "empty slot",
};
