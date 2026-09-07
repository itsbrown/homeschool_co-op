/**
 * Jurisdiction-aware education standards lookup and Lexile KPI classification.
 */
import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  educationJurisdictions,
  educationStandardFrameworks,
  educationStandards,
  educationKpiThresholds,
  schools,
} from "../../shared/schema";
import { US_STATES, normalizeUsState, type UsStateCode } from "../../shared/us-states";
import { normalizeGradeLevel } from "../../shared/grade-levels";
import { lexileFromGradeLevel } from "./parse-lexile-range";

export type JurisdictionSummary = {
  code: string;
  name: string;
  kind: string;
  isActive: boolean;
  reportTemplateKey: string | null;
  hasStandardsData: boolean;
  hasKpiData: boolean;
};

export type KpiThresholdRow = {
  gradeLevel: string;
  belowMax: number;
  atMin: number;
  atMax: number;
  aboveMin: number;
  sourceNote: string | null;
};

export type ResolvedJurisdiction = {
  code: string;
  name: string;
  kind: string;
  reportTemplateKey: string | null;
  sourceNote: string | null;
};

const SEEDED_KPI_CODES = new Set(["US", "NY"]);

export function classifyLexileBand(
  lexile: number,
  threshold: Pick<KpiThresholdRow, "atMin" | "atMax"> | null | undefined,
): "below" | "at" | "above" {
  if (!threshold) {
    return "at";
  }
  if (lexile < threshold.atMin) return "below";
  if (lexile > threshold.atMax) return "above";
  return "at";
}

/** Last-resort ASA heuristic when no threshold row exists for the grade. */
export function fallbackLexileThreshold(gradeNum: number): KpiThresholdRow {
  const mid = lexileFromGradeLevel(gradeNum);
  return {
    gradeLevel: String(gradeNum),
    belowMax: mid - 101,
    atMin: mid - 100,
    atMax: mid + 100,
    aboveMin: mid + 101,
    sourceNote: "ASA heuristic fallback (200 + grade×100 ± 100)",
  };
}

export function gradeToKpiSlug(gradeRaw: string | number | null | undefined): string | null {
  if (gradeRaw == null) return null;
  if (typeof gradeRaw === "number") {
    if (gradeRaw === 0) return "kindergarten";
    if (Number.isFinite(gradeRaw) && gradeRaw >= 1 && gradeRaw <= 12) {
      const n = Math.round(gradeRaw);
      const ordinal =
        n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
      return `${ordinal}-grade`;
    }
    return null;
  }
  return normalizeGradeLevel(gradeRaw);
}

export async function listJurisdictions(): Promise<JurisdictionSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(educationJurisdictions).where(eq(educationJurisdictions.isActive, true));
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const frameworkCounts = await db
    .select({
      jurisdictionId: educationStandardFrameworks.jurisdictionId,
      count: sql<number>`count(*)::int`,
    })
    .from(educationStandardFrameworks)
    .groupBy(educationStandardFrameworks.jurisdictionId);

  const kpiCounts = await db
    .select({
      jurisdictionId: educationKpiThresholds.jurisdictionId,
      count: sql<number>`count(*)::int`,
    })
    .from(educationKpiThresholds)
    .groupBy(educationKpiThresholds.jurisdictionId);

  const fwByJ = new Map(frameworkCounts.map((r) => [r.jurisdictionId, r.count]));
  const kpiByJ = new Map(kpiCounts.map((r) => [r.jurisdictionId, r.count]));

  const out: JurisdictionSummary[] = [
    {
      code: "US",
      name: byCode.get("US")?.name || "National (US)",
      kind: "national",
      isActive: true,
      reportTemplateKey: byCode.get("US")?.reportTemplateKey ?? null,
      hasStandardsData: !!byCode.get("US") && (fwByJ.get(byCode.get("US")!.id) || 0) > 0,
      hasKpiData: !!byCode.get("US") && (kpiByJ.get(byCode.get("US")!.id) || 0) > 0,
    },
  ];

  for (const state of US_STATES) {
    const row = byCode.get(state.code);
    out.push({
      code: state.code,
      name: state.name,
      kind: "state",
      isActive: true,
      reportTemplateKey: row?.reportTemplateKey ?? null,
      hasStandardsData: !!row && (fwByJ.get(row.id) || 0) > 0,
      hasKpiData: !!row && (kpiByJ.get(row.id) || 0) > 0,
    });
  }

  return out;
}

/**
 * Resolve school → jurisdiction with KPI/standards data.
 * NY (and future seeded states) when school.state matches; else National (US).
 */
export async function resolveSchoolJurisdiction(
  schoolId: number,
  overrideCode?: string | null,
): Promise<ResolvedJurisdiction> {
  const db = await getDb();

  if (overrideCode) {
    const code = overrideCode.toUpperCase() === "US" ? "US" : normalizeUsState(overrideCode) || overrideCode.toUpperCase();
    const [row] = await db
      .select()
      .from(educationJurisdictions)
      .where(eq(educationJurisdictions.code, code))
      .limit(1);
    if (row && SEEDED_KPI_CODES.has(row.code)) {
      return {
        code: row.code,
        name: row.name,
        kind: row.kind,
        reportTemplateKey: row.reportTemplateKey,
        sourceNote: null,
      };
    }
    // Unseeded override → National
    return resolveNational();
  }

  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  const stateCode = normalizeUsState(school?.state) as UsStateCode | null;

  if (stateCode && SEEDED_KPI_CODES.has(stateCode)) {
    const [row] = await db
      .select()
      .from(educationJurisdictions)
      .where(eq(educationJurisdictions.code, stateCode))
      .limit(1);
    if (row?.isActive) {
      return {
        code: row.code,
        name: row.name,
        kind: row.kind,
        reportTemplateKey: row.reportTemplateKey,
        sourceNote: null,
      };
    }
  }

  return resolveNational();
}

async function resolveNational(): Promise<ResolvedJurisdiction> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(educationJurisdictions)
    .where(eq(educationJurisdictions.code, "US"))
    .limit(1);
  return {
    code: "US",
    name: row?.name || "National (US)",
    kind: "national",
    reportTemplateKey: row?.reportTemplateKey ?? null,
    sourceNote: "National fallback — state standards not yet seeded",
  };
}

export async function getKpiThresholds(opts: {
  jurisdictionCode: string;
  subject?: string;
  metric?: string;
}): Promise<{ jurisdiction: ResolvedJurisdiction; thresholds: KpiThresholdRow[] }> {
  const db = await getDb();
  const code = opts.jurisdictionCode.toUpperCase() === "US"
    ? "US"
    : normalizeUsState(opts.jurisdictionCode) || opts.jurisdictionCode.toUpperCase();

  let [jurisdiction] = await db
    .select()
    .from(educationJurisdictions)
    .where(eq(educationJurisdictions.code, code))
    .limit(1);

  if (!jurisdiction || !SEEDED_KPI_CODES.has(jurisdiction.code)) {
    [jurisdiction] = await db
      .select()
      .from(educationJurisdictions)
      .where(eq(educationJurisdictions.code, "US"))
      .limit(1);
  }

  if (!jurisdiction) {
    return {
      jurisdiction: {
        code: "US",
        name: "National (US)",
        kind: "national",
        reportTemplateKey: null,
        sourceNote: "No KPI seed loaded",
      },
      thresholds: [],
    };
  }

  const subject = opts.subject || "ela";
  const metric = opts.metric || "lexile";
  const rows = await db
    .select()
    .from(educationKpiThresholds)
    .where(
      and(
        eq(educationKpiThresholds.jurisdictionId, jurisdiction.id),
        eq(educationKpiThresholds.subject, subject),
        eq(educationKpiThresholds.metric, metric),
      ),
    );

  return {
    jurisdiction: {
      code: jurisdiction.code,
      name: jurisdiction.name,
      kind: jurisdiction.kind,
      reportTemplateKey: jurisdiction.reportTemplateKey,
      sourceNote: rows[0]?.sourceNote ?? null,
    },
    thresholds: rows.map((r) => ({
      gradeLevel: r.gradeLevel,
      belowMax: r.belowMax,
      atMin: r.atMin,
      atMax: r.atMax,
      aboveMin: r.aboveMin,
      sourceNote: r.sourceNote,
    })),
  };
}

export function thresholdForGrade(
  thresholds: KpiThresholdRow[],
  gradeRaw: string | number | null | undefined,
): KpiThresholdRow | null {
  const slug = gradeToKpiSlug(gradeRaw);
  if (!slug) return null;
  return thresholds.find((t) => t.gradeLevel === slug) ?? null;
}

export async function getStandards(opts: {
  jurisdictionCode: string;
  subject?: string;
  grade?: string;
}): Promise<{
  jurisdiction: ResolvedJurisdiction;
  standards: Array<{
    id: number;
    code: string;
    title: string;
    description: string | null;
    gradeLevels: string[];
    subject: string;
    frameworkTitle: string;
    sortOrder: number;
  }>;
}> {
  const db = await getDb();
  let code = opts.jurisdictionCode.toUpperCase() === "US"
    ? "US"
    : normalizeUsState(opts.jurisdictionCode) || opts.jurisdictionCode.toUpperCase();

  let [jurisdiction] = await db
    .select()
    .from(educationJurisdictions)
    .where(eq(educationJurisdictions.code, code))
    .limit(1);

  if (!jurisdiction || !SEEDED_KPI_CODES.has(jurisdiction.code)) {
    code = "US";
    [jurisdiction] = await db
      .select()
      .from(educationJurisdictions)
      .where(eq(educationJurisdictions.code, "US"))
      .limit(1);
  }

  if (!jurisdiction) {
    return {
      jurisdiction: {
        code: "US",
        name: "National (US)",
        kind: "national",
        reportTemplateKey: null,
        sourceNote: "No standards seed loaded",
      },
      standards: [],
    };
  }

  const frameworks = await db
    .select()
    .from(educationStandardFrameworks)
    .where(eq(educationStandardFrameworks.jurisdictionId, jurisdiction.id));

  const filteredFw = opts.subject
    ? frameworks.filter((f) => f.subject === opts.subject)
    : frameworks;

  if (!filteredFw.length) {
    return {
      jurisdiction: {
        code: jurisdiction.code,
        name: jurisdiction.name,
        kind: jurisdiction.kind,
        reportTemplateKey: jurisdiction.reportTemplateKey,
        sourceNote: null,
      },
      standards: [],
    };
  }

  const fwIds = filteredFw.map((f) => f.id);
  const fwById = new Map(filteredFw.map((f) => [f.id, f]));
  const rows = await db
    .select()
    .from(educationStandards)
    .where(inArray(educationStandards.frameworkId, fwIds))
    .orderBy(educationStandards.sortOrder);

  const gradeSlug = opts.grade ? normalizeGradeLevel(opts.grade) : null;

  const standards = rows
    .filter((r) => {
      if (!gradeSlug) return true;
      const levels = Array.isArray(r.gradeLevels) ? (r.gradeLevels as string[]) : [];
      return levels.some((g) => normalizeGradeLevel(g) === gradeSlug);
    })
    .map((r) => {
      const fw = fwById.get(r.frameworkId)!;
      return {
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        gradeLevels: (Array.isArray(r.gradeLevels) ? r.gradeLevels : []) as string[],
        subject: fw.subject,
        frameworkTitle: fw.title,
        sortOrder: r.sortOrder,
      };
    });

  return {
    jurisdiction: {
      code: jurisdiction.code,
      name: jurisdiction.name,
      kind: jurisdiction.kind,
      reportTemplateKey: jurisdiction.reportTemplateKey,
      sourceNote: null,
    },
    standards,
  };
}
