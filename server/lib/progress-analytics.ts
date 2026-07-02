/**
 * SQL-backed progress analytics for school literacy and child time-series.
 */
import { eq, and, gte, lte, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  studentAssessments,
  assessmentTypes,
  children,
  progressSubjects,
  progressTracks,
  studentProgressLog,
  programEnrollments,
} from "../../shared/schema";
import {
  parseLexileRange,
  parseGradeLevelScore,
  lexileFromGradeLevel,
} from "./parse-lexile-range";

const READING_CATEGORIES = new Set(["reading", "phonics", "language_arts"]);

export interface SchoolLiteracyAnalyticsOptions {
  schoolYear?: string;
  sessionId?: number;
  locationId?: number;
}

function schoolYearBounds(schoolYear?: string): { start: Date; end: Date } | null {
  if (!schoolYear) return null;
  const match = schoolYear.match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const startYear = parseInt(match[1], 10);
  return {
    start: new Date(startYear, 7, 1),
    end: new Date(startYear + 1, 6, 30, 23, 59, 59),
  };
}

function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

function monthKey(d: Date): string {
  return d.toLocaleString("default", { month: "short" });
}

export async function buildSchoolLiteracyAnalytics(
  schoolId: number,
  options: SchoolLiteracyAnalyticsOptions = {},
) {
  const db = await getDb();
  const schoolYear = options.schoolYear || currentSchoolYear();
  const bounds = schoolYearBounds(schoolYear);

  const types = await db
    .select()
    .from(assessmentTypes)
    .where(eq(assessmentTypes.schoolId, schoolId));

  const readingTypeIds = types
    .filter((t) => READING_CATEGORIES.has(t.category))
    .map((t) => t.id);

  const childRows = await db
    .select()
    .from(children)
    .where(eq(children.schoolId, schoolId));

  let childFilter = childRows.map((c) => c.id);
  if (options.locationId) {
    childFilter = childRows.filter((c) => c.locationId === options.locationId).map((c) => c.id);
  }

  const assessmentConditions = [eq(studentAssessments.schoolId, schoolId)];
  if (readingTypeIds.length > 0) {
    assessmentConditions.push(inArray(studentAssessments.assessmentTypeId, readingTypeIds));
  }
  if (bounds) {
    assessmentConditions.push(gte(studentAssessments.assessmentDate, bounds.start));
    assessmentConditions.push(lte(studentAssessments.assessmentDate, bounds.end));
  }
  if (options.locationId) {
    assessmentConditions.push(eq(studentAssessments.locationId, options.locationId));
  }

  const assessments = await db
    .select()
    .from(studentAssessments)
    .where(and(...assessmentConditions))
    .orderBy(studentAssessments.assessmentDate);

  const byChild = new Map<number, typeof assessments>();
  for (const a of assessments) {
    if (childFilter.length && !childFilter.includes(a.childId)) continue;
    const list = byChild.get(a.childId) || [];
    list.push(a);
    byChild.set(a.childId, list);
  }

  let improved = 0;
  let withData = 0;
  const statusBreakdown: Record<string, number> = {};
  const monthlyMap = new Map<string, number>();
  const bandCounts = { below: 0, at: 0, above: 0 };
  const gradeDist = new Map<string, number>();

  for (const child of childRows) {
    if (childFilter.length && !childFilter.includes(child.id)) continue;
    const rows = byChild.get(child.id) || [];
    const lexileSnap = parseLexileRange(child.currentLexileRange);
    const gradeSnap = child.currentReadingGradeLevel
      ? parseGradeLevelScore(child.currentReadingGradeLevel)
      : null;

    if (rows.length === 0 && !lexileSnap && gradeSnap == null) continue;

    withData++;
    const gradeLabel = child.gradeLevel || "Unknown";
    gradeDist.set(gradeLabel, (gradeDist.get(gradeLabel) || 0) + 1);

    const sorted = [...rows].sort(
      (a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime(),
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1] || first;

    const scoreLex = (row: typeof first) => {
      if (!row) return null;
      if (row.lexileScore != null) return row.lexileScore;
      const g = parseGradeLevelScore(row.score);
      return g != null ? lexileFromGradeLevel(g) : null;
    };

    const baselineLex = scoreLex(first) ?? lexileSnap?.midpoint ?? null;
    const endLex = scoreLex(last) ?? lexileSnap?.midpoint ?? null;

    if (baselineLex != null && endLex != null && endLex > baselineLex) improved++;

    const childGradeNum = parseGradeLevelScore(child.gradeLevel);
    if (endLex != null && childGradeNum != null) {
      const expected = lexileFromGradeLevel(childGradeNum);
      if (endLex < expected - 100) bandCounts.below++;
      else if (endLex > expected + 100) bandCounts.above++;
      else bandCounts.at++;
    }

    for (const r of sorted) {
      const mk = monthKey(new Date(r.assessmentDate));
      monthlyMap.set(mk, (monthlyMap.get(mk) || 0) + 1);
      statusBreakdown["assessed"] = (statusBreakdown["assessed"] || 0) + 1;
    }
  }

  const totalStudents = childRows.filter((c) => !childFilter.length || childFilter.includes(c.id)).length;
  const monthlyTrends = Array.from(monthlyMap.entries()).map(([month, count]) => ({ month, count }));

  const proficiencyTotal = bandCounts.below + bandCounts.at + bandCounts.above || 1;

  return {
    schoolYear,
    coverage: {
      totalStudents,
      withReadingData: withData,
      withLexileData: childRows.filter((c) => parseLexileRange(c.currentLexileRange)).length,
    },
    headline: {
      improvedPct: withData > 0 ? Math.round((improved / withData) * 100) : 0,
      medianLexileDelta: null,
      medianGradeDelta: null,
    },
    totalEnrollments: assessments.length,
    statusBreakdown,
    paymentBreakdown: { paid: 0, pending: 0 },
    monthlyTrends,
    proficiencyBands: [
      { band: "below", count: bandCounts.below, pct: Math.round((bandCounts.below / proficiencyTotal) * 100) },
      { band: "at", count: bandCounts.at, pct: Math.round((bandCounts.at / proficiencyTotal) * 100) },
      { band: "above", count: bandCounts.above, pct: Math.round((bandCounts.above / proficiencyTotal) * 100) },
    ],
    gradeDistribution: Array.from(gradeDist.entries()).map(([gradeLevel, count]) => ({ gradeLevel, count })),
    cohortTrend: monthlyTrends.map((m) => ({ period: m.month, medianLexile: null, medianGrade: null, count: m.count })),
    generatedAt: new Date().toISOString(),
  };
}

export async function buildChildProgressAnalytics(
  schoolId: number,
  childId: number,
  options: { schoolYear?: string } = {},
) {
  const db = await getDb();
  const schoolYear = options.schoolYear || currentSchoolYear();
  const bounds = schoolYearBounds(schoolYear);

  const [child] = await db
    .select()
    .from(children)
    .where(and(eq(children.id, childId), eq(children.schoolId, schoolId)))
    .limit(1);

  if (!child) return null;

  const types = await db.select().from(assessmentTypes).where(eq(assessmentTypes.schoolId, schoolId));
  const readingTypeIds = types.filter((t) => READING_CATEGORIES.has(t.category)).map((t) => t.id);
  const mathTypeIds = types.filter((t) => t.category === "math").map((t) => t.id);

  const readConditions = [
    eq(studentAssessments.schoolId, schoolId),
    eq(studentAssessments.childId, childId),
  ];
  if (bounds) {
    readConditions.push(gte(studentAssessments.assessmentDate, bounds.start));
    readConditions.push(lte(studentAssessments.assessmentDate, bounds.end));
  }

  const allAssessments = await db
    .select()
    .from(studentAssessments)
    .where(and(...readConditions))
    .orderBy(studentAssessments.assessmentDate);

  const readingAssessments = allAssessments.filter(
    (a) => readingTypeIds.includes(a.assessmentTypeId) || a.lexileScore != null,
  );
  const mathAssessments = allAssessments.filter((a) => mathTypeIds.includes(a.assessmentTypeId));

  const readingSeries = readingAssessments.map((a) => {
    const gradeLevel = parseGradeLevelScore(a.score);
    const lexile = a.lexileScore ?? (gradeLevel != null ? lexileFromGradeLevel(gradeLevel) : null);
    return {
      date: a.assessmentDate,
      lexile,
      gradeLevel,
      label: a.score,
    };
  });

  const firstGrade = readingSeries.find((s) => s.gradeLevel != null)?.gradeLevel;
  const lastGrade = [...readingSeries].reverse().find((s) => s.gradeLevel != null)?.gradeLevel;
  const gradeGrowth =
    firstGrade != null && lastGrade != null ? Math.round((lastGrade - firstGrade) * 10) / 10 : null;

  const mathSubjects = await db
    .select()
    .from(progressSubjects)
    .where(and(eq(progressSubjects.schoolId, schoolId), eq(progressSubjects.key, "math")))
    .limit(1);

  let mathSeries: { date: string; lessonNumber: number | null; unitLabel: string | null; score?: string }[] = [];
  if (mathSubjects[0]) {
    const tracks = await db
      .select()
      .from(progressTracks)
      .where(eq(progressTracks.subjectId, mathSubjects[0].id));
    const trackIds = tracks.map((t) => t.id);
    if (trackIds.length > 0) {
      const logs = await db
        .select()
        .from(studentProgressLog)
        .where(
          and(
            eq(studentProgressLog.childId, childId),
            inArray(studentProgressLog.progressTrackId, trackIds),
          ),
        )
        .orderBy(studentProgressLog.eventDate);

      mathSeries = logs.map((l) => ({
        date: String(l.eventDate),
        lessonNumber: l.lessonNumber,
        unitLabel: l.unitLabel,
      }));
    }
  }

  for (const ma of mathAssessments) {
    mathSeries.push({
      date: String(ma.assessmentDate),
      lessonNumber: ma.lesson,
      unitLabel: ma.score,
      score: ma.score,
    });
  }
  mathSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const mathLessonsCompleted =
    mathSeries.filter((s) => s.lessonNumber != null).length > 0
      ? Math.max(...mathSeries.map((s) => s.lessonNumber || 0)) -
        Math.min(...mathSeries.filter((s) => s.lessonNumber != null).map((s) => s.lessonNumber!))
      : 0;

  return {
    child: {
      id: child.id,
      firstName: child.firstName,
      gradeLevel: child.gradeLevel,
    },
    schoolYear,
    reading: {
      headline:
        gradeGrowth != null
          ? `Grew ${gradeGrowth} grade level${gradeGrowth === 1 ? "" : "s"} in reading this school year`
          : readingSeries.length >= 2
            ? "Reading progress recorded this school year"
            : "Add more reading assessments to see growth",
      series: readingSeries,
      growth: { gradeDelta: gradeGrowth },
    },
    math: {
      headline:
        mathLessonsCompleted > 0
          ? `Advanced ${mathLessonsCompleted} math lessons this school year`
          : mathSeries.length > 0
            ? "Math progress recorded this school year"
            : "Log math progress to see your chart",
      series: mathSeries,
      growth: { lessonsAdvanced: mathLessonsCompleted },
    },
  };
}

export async function verifyParentOwnsChild(parentId: number, childId: number): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.parentId, parentId)))
    .limit(1);
  return !!row;
}
