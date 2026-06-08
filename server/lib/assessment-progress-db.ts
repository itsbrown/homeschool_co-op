/**
 * Assessment (F-14) and multi-subject curriculum progress storage.
 */
import { eq, and, desc, sql, ilike, or, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  assessmentTypes,
  curriculumBooks,
  studentAssessments,
  progressSubjects,
  progressTracks,
  studentProgressCurrent,
  studentProgressLog,
  childProgressInsights,
  quarterlyProgressMeta,
  quarterlySkillChecks,
  quarterlyProgressReports,
  children,
  programEnrollments,
  sessions,
  assessmentSessions,
  type InsertAssessmentType,
  type InsertCurriculumBook,
  type InsertStudentAssessment,
  type InsertProgressSubject,
  type InsertProgressTrack,
  type AssessmentType,
  type CurriculumBook,
  type StudentAssessment,
  type ProgressSubject,
  type ProgressTrack,
  type Child,
} from "../../shared/schema";
function parseGradeLevelScore(score: string): number | null {
  if (!score || typeof score !== "string") return null;
  const trimmed = score.trim();
  const directParse = parseFloat(trimmed);
  if (!isNaN(directParse) && directParse >= 0 && directParse <= 20) return directParse;
  if (trimmed.includes(",") || trimmed.includes(";")) {
    const parts = trimmed.split(/[,;]/).map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n));
    if (parts.length > 0) return parts.reduce((sum, n) => sum + n, 0) / parts.length;
  }
  return null;
}

function calculateLexileFromGradeLevel(gradeLevel: number | string | null): number | null {
  if (gradeLevel === null || gradeLevel === undefined) return null;
  const numericGrade = typeof gradeLevel === "string" ? parseFloat(gradeLevel) : gradeLevel;
  if (isNaN(numericGrade) || numericGrade < 0) return null;
  return Math.max(0, Math.min(2000, Math.round(200 + numericGrade * 100)));
}

const DEFAULT_PROGRESS_SUBJECTS: { key: string; label: string; sortOrder: number }[] = [
  { key: "reading", label: "Reading", sortOrder: 10 },
  { key: "math", label: "Mathematics", sortOrder: 20 },
  { key: "science", label: "Science", sortOrder: 30 },
  { key: "writing", label: "Writing", sortOrder: 40 },
  { key: "literature", label: "Literature", sortOrder: 50 },
  { key: "history", label: "History", sortOrder: 60 },
  { key: "financial_literacy", label: "Financial Literacy", sortOrder: 70 },
  { key: "language_arts", label: "Language Arts", sortOrder: 80 },
];

export async function ensureProgressSubjectsForSchool(schoolId: number): Promise<void> {
  const db = await getDb();
  const existing = await db.select().from(progressSubjects).where(eq(progressSubjects.schoolId, schoolId)).limit(1);
  if (existing.length > 0) return;
  for (const s of DEFAULT_PROGRESS_SUBJECTS) {
    await db.insert(progressSubjects).values({
      schoolId,
      key: s.key,
      label: s.label,
      sortOrder: s.sortOrder,
      isActive: true,
    });
  }
}

// ---------- Children (school-scoped) ----------

export async function getChildByIdForSchool(childId: number, schoolId: number): Promise<Child | undefined> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(children)
    .where(and(eq(children.id, childId), eq(children.schoolId, schoolId)))
    .limit(1);
  return row;
}

export async function getChildrenForSchool(schoolId: number): Promise<Child[]> {
  const db = await getDb();
  return db
    .select()
    .from(children)
    .where(eq(children.schoolId, schoolId))
    .orderBy(children.lastName, children.firstName);
}

export async function fuzzyMatchStudentsForSchool(
  schoolId: number,
  rawName: string,
): Promise<{ id: number; name: string; gradeLevel: string }[]> {
  const db = await getDb();
  const parts = rawName.trim().split(/\s+/);
  const conditions = parts.flatMap((p) => {
    const pat = `%${p}%`;
    return [ilike(children.firstName, pat), ilike(children.lastName, pat)];
  });
  const rows = await db
    .select()
    .from(children)
    .where(and(eq(children.schoolId, schoolId), or(...conditions)))
    .limit(10);
  return rows.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`,
    gradeLevel: c.gradeLevel,
  }));
}

export async function resolveActiveSessionIdForChild(childId: number, schoolId: number): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ sessionId: programEnrollments.sessionId })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.childId, childId),
        eq(programEnrollments.schoolId, schoolId),
        eq(programEnrollments.status, "enrolled"),
        sql`${programEnrollments.sessionId} IS NOT NULL`,
      ),
    )
    .orderBy(desc(programEnrollments.enrollmentDate))
    .limit(1);
  return row?.sessionId ?? null;
}

// ---------- Assessment types ----------

export async function getAssessmentTypesBySchoolId(schoolId: number): Promise<AssessmentType[]> {
  const db = await getDb();
  return db
    .select()
    .from(assessmentTypes)
    .where(eq(assessmentTypes.schoolId, schoolId))
    .orderBy(assessmentTypes.sortOrder, assessmentTypes.name);
}

export async function getAssessmentTypeById(id: number): Promise<AssessmentType | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(assessmentTypes).where(eq(assessmentTypes.id, id)).limit(1);
  return row;
}

export async function createAssessmentType(data: InsertAssessmentType): Promise<AssessmentType> {
  const db = await getDb();
  const [row] = await db.insert(assessmentTypes).values(data).returning();
  return row;
}

export async function updateAssessmentType(
  id: number,
  data: Partial<InsertAssessmentType>,
): Promise<AssessmentType | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(assessmentTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assessmentTypes.id, id))
    .returning();
  return row;
}

export async function deleteAssessmentType(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(assessmentTypes).where(eq(assessmentTypes.id, id));
}

// ---------- Curriculum books ----------

export async function getCurriculumBooksByAssessmentTypeId(typeId: number): Promise<CurriculumBook[]> {
  const db = await getDb();
  return db
    .select()
    .from(curriculumBooks)
    .where(eq(curriculumBooks.assessmentTypeId, typeId))
    .orderBy(curriculumBooks.sortOrder, curriculumBooks.name);
}

export async function getCurriculumBookById(id: number): Promise<CurriculumBook | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(curriculumBooks).where(eq(curriculumBooks.id, id)).limit(1);
  return row;
}

export async function createCurriculumBook(data: InsertCurriculumBook): Promise<CurriculumBook> {
  const db = await getDb();
  const [row] = await db.insert(curriculumBooks).values(data).returning();
  return row;
}

export async function updateCurriculumBook(
  id: number,
  data: Partial<InsertCurriculumBook>,
): Promise<CurriculumBook | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(curriculumBooks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(curriculumBooks.id, id))
    .returning();
  return row;
}

export async function deleteCurriculumBook(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(curriculumBooks).where(eq(curriculumBooks.id, id));
}

// ---------- Student assessments ----------

export async function getStudentAssessmentById(id: number): Promise<StudentAssessment | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(studentAssessments).where(eq(studentAssessments.id, id)).limit(1);
  return row;
}

export async function getStudentAssessmentsByChildId(childId: number): Promise<StudentAssessment[]> {
  const db = await getDb();
  return db
    .select()
    .from(studentAssessments)
    .where(eq(studentAssessments.childId, childId))
    .orderBy(desc(studentAssessments.assessmentDate));
}

export async function getStudentAssessmentsBySchoolId(
  schoolId: number,
  filters: { locationId?: number; assessmentTypeId?: number; childId?: number } = {},
): Promise<StudentAssessment[]> {
  const db = await getDb();
  const conditions = [eq(studentAssessments.schoolId, schoolId)];
  if (filters.locationId) conditions.push(eq(studentAssessments.locationId, filters.locationId));
  if (filters.assessmentTypeId) conditions.push(eq(studentAssessments.assessmentTypeId, filters.assessmentTypeId));
  if (filters.childId) conditions.push(eq(studentAssessments.childId, filters.childId));
  return db
    .select()
    .from(studentAssessments)
    .where(and(...conditions))
    .orderBy(desc(studentAssessments.assessmentDate));
}

export async function createStudentAssessment(
  data: InsertStudentAssessment,
): Promise<StudentAssessment> {
  const db = await getDb();
  const [row] = await db.insert(studentAssessments).values(data).returning();
  await syncAssessmentToProgress(row);
  await invalidateProgressInsight(row.childId, row.schoolId);
  return row;
}

export async function updateStudentAssessment(
  id: number,
  data: Partial<InsertStudentAssessment>,
): Promise<StudentAssessment | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(studentAssessments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(studentAssessments.id, id))
    .returning();
  if (row) {
    await syncAssessmentToProgress(row);
    await invalidateProgressInsight(row.childId, row.schoolId);
  }
  return row;
}

export async function deleteStudentAssessment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(studentAssessments).where(eq(studentAssessments.id, id));
}

async function syncAssessmentToProgress(assessment: StudentAssessment): Promise<void> {
  if (!assessment.curriculumBookId) return;
  const book = await getCurriculumBookById(assessment.curriculumBookId);
  if (!book?.progressTrackId) return;
  const sessionId = assessment.sessionId ?? (await resolveActiveSessionIdForChild(assessment.childId, assessment.schoolId));
  const topicsSummary = assessment.score;
  await upsertProgressCurrent({
    schoolId: assessment.schoolId,
    childId: assessment.childId,
    progressTrackId: book.progressTrackId,
    lessonNumber: assessment.lesson ?? null,
    unitLabel: book.name,
    topicsSummary,
    notes: assessment.notes,
    source: "assessment",
    recordedBy: assessment.recordedBy,
  });
  if (sessionId) {
    await insertProgressLogRow({
      schoolId: assessment.schoolId,
      sessionId,
      childId: assessment.childId,
      progressTrackId: book.progressTrackId,
      locationId: assessment.locationId,
      eventDate: assessment.assessmentDate.toISOString().slice(0, 10),
      lessonNumber: assessment.lesson ?? null,
      unitLabel: book.name,
      topicsCovered: assessment.score,
      topicsSummary,
      notes: assessment.notes,
      source: "assessment",
      recordedBy: assessment.recordedBy,
    });
  }
}

// ---------- Lexile ----------

export async function recordLexileAssessment(
  childId: number,
  schoolId: number,
  userId: number,
  data: { readingGradeLevel?: string; lexileRange?: string; bookList?: string; notes?: string },
): Promise<{ child: Child; assessment?: StudentAssessment }> {
  const db = await getDb();
  const [child] = await db
    .update(children)
    .set({
      currentReadingGradeLevel: data.readingGradeLevel ?? null,
      currentLexileRange: data.lexileRange ?? null,
      currentBookList: data.bookList ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(children.id, childId), eq(children.schoolId, schoolId)))
    .returning();

  const types = await getAssessmentTypesBySchoolId(schoolId);
  const lexileType = types.find((t) => t.name === "Lexile Reading Level");
  let assessment: StudentAssessment | undefined;
  if (lexileType) {
    const score = data.readingGradeLevel || data.lexileRange || "updated";
    const gradeLevel = data.readingGradeLevel ? parseGradeLevelScore(data.readingGradeLevel) : null;
    const lexileScore = gradeLevel !== null ? calculateLexileFromGradeLevel(gradeLevel) : null;
    const sessionId = await resolveActiveSessionIdForChild(childId, schoolId);
    const db2 = await getDb();
    const [inserted] = await db2
      .insert(studentAssessments)
      .values({
        schoolId,
        childId,
        assessmentTypeId: lexileType.id,
        assessmentDate: new Date(),
        score,
        notes: data.notes ?? data.bookList ?? null,
        recordedBy: userId,
        source: "manual_entry",
        lexileScore: lexileScore ?? null,
        sessionId: sessionId ?? null,
        locationId: child.locationId ?? null,
      })
      .returning();
    assessment = inserted;
  }
  await invalidateProgressInsight(childId, schoolId);
  return { child, assessment };
}

export async function getLexileHistoryForChildBySchool(
  childId: number,
  schoolId: number,
): Promise<StudentAssessment[]> {
  const db = await getDb();
  const types = await getAssessmentTypesBySchoolId(schoolId);
  const readingTypeIds = types
    .filter((t) => t.category === "reading" || t.name.toLowerCase().includes("lexile") || t.name.toLowerCase().includes("mccall"))
    .map((t) => t.id);
  const typeFilter =
    readingTypeIds.length > 0
      ? inArray(studentAssessments.assessmentTypeId, readingTypeIds)
      : sql`1=1`;
  return db
    .select()
    .from(studentAssessments)
    .where(and(eq(studentAssessments.childId, childId), eq(studentAssessments.schoolId, schoolId), typeFilter))
    .orderBy(desc(studentAssessments.assessmentDate))
    .limit(50);
}

// ---------- Progress catalog ----------

export async function getProgressSubjectsBySchool(schoolId: number): Promise<ProgressSubject[]> {
  await ensureProgressSubjectsForSchool(schoolId);
  const db = await getDb();
  return db
    .select()
    .from(progressSubjects)
    .where(and(eq(progressSubjects.schoolId, schoolId), eq(progressSubjects.isActive, true)))
    .orderBy(progressSubjects.sortOrder);
}

export async function createProgressSubject(data: InsertProgressSubject): Promise<ProgressSubject> {
  const db = await getDb();
  const [row] = await db.insert(progressSubjects).values(data).returning();
  return row;
}

export async function updateProgressSubject(
  id: number,
  data: Partial<InsertProgressSubject>,
): Promise<ProgressSubject | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(progressSubjects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(progressSubjects.id, id))
    .returning();
  return row;
}

export async function getProgressTracksBySubject(schoolId: number, subjectId: number): Promise<ProgressTrack[]> {
  const db = await getDb();
  return db
    .select()
    .from(progressTracks)
    .where(
      and(
        eq(progressTracks.schoolId, schoolId),
        eq(progressTracks.subjectId, subjectId),
        eq(progressTracks.isActive, true),
      ),
    )
    .orderBy(progressTracks.name);
}

export async function getProgressTrackById(id: number): Promise<ProgressTrack | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(progressTracks).where(eq(progressTracks.id, id)).limit(1);
  return row;
}

export async function createProgressTrack(data: InsertProgressTrack): Promise<ProgressTrack> {
  const db = await getDb();
  const [row] = await db.insert(progressTracks).values(data).returning();
  return row;
}

export async function updateProgressTrack(
  id: number,
  data: Partial<InsertProgressTrack>,
): Promise<ProgressTrack | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(progressTracks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(progressTracks.id, id))
    .returning();
  return row;
}

// ---------- Progress current + log ----------

async function upsertProgressCurrent(params: {
  schoolId: number;
  childId: number;
  progressTrackId: number;
  lessonNumber?: number | null;
  unitLabel?: string | null;
  topicsSummary?: string | null;
  notes?: string | null;
  source: string;
  recordedBy?: number | null;
}): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(studentProgressCurrent)
    .where(
      and(
        eq(studentProgressCurrent.childId, params.childId),
        eq(studentProgressCurrent.progressTrackId, params.progressTrackId),
      ),
    )
    .limit(1);
  const values = {
    schoolId: params.schoolId,
    childId: params.childId,
    progressTrackId: params.progressTrackId,
    lessonNumber: params.lessonNumber ?? null,
    unitLabel: params.unitLabel ?? null,
    topicsSummary: params.topicsSummary ?? null,
    notes: params.notes ?? null,
    source: params.source,
    recordedBy: params.recordedBy ?? null,
    recordedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing[0]) {
    await db
      .update(studentProgressCurrent)
      .set(values)
      .where(eq(studentProgressCurrent.id, existing[0].id));
  } else {
    await db.insert(studentProgressCurrent).values(values);
  }
}

async function insertProgressLogRow(params: {
  schoolId: number;
  sessionId: number;
  childId: number;
  progressTrackId: number;
  locationId?: number | null;
  eventDate: string;
  lessonNumber?: number | null;
  unitLabel?: string | null;
  topicsCovered?: string | null;
  topicsSummary?: string | null;
  notes?: string | null;
  source: string;
  recordedBy: number;
}): Promise<void> {
  const db = await getDb();
  let topicsJson: unknown = null;
  if (params.topicsCovered) {
    const trimmed = params.topicsCovered.trim();
    topicsJson = trimmed.includes(",")
      ? trimmed.split(",").map((s) => s.trim()).filter(Boolean)
      : trimmed;
  }
  await db.insert(studentProgressLog).values({
    schoolId: params.schoolId,
    sessionId: params.sessionId,
    childId: params.childId,
    progressTrackId: params.progressTrackId,
    locationId: params.locationId ?? null,
    eventDate: params.eventDate,
    lessonNumber: params.lessonNumber ?? null,
    unitLabel: params.unitLabel ?? null,
    topicsCovered: topicsJson,
    topicsSummary: params.topicsSummary ?? null,
    notes: params.notes ?? null,
    source: params.source,
    recordedBy: params.recordedBy,
  });
}

export async function createStudentProgressLog(
  childId: number,
  schoolId: number,
  recordedBy: number,
  body: {
    sessionId: number;
    progressTrackId: number;
    eventDate: string;
    lessonNumber?: number | null;
    unitLabel?: string | null;
    topicsCovered?: string | null;
    topicsSummary?: string | null;
    notes?: string | null;
    locationId?: number | null;
  },
): Promise<void> {
  const summary =
    body.topicsSummary?.trim() ||
    (body.topicsCovered ? body.topicsCovered.trim().slice(0, 120) : null);
  await insertProgressLogRow({
    schoolId,
    sessionId: body.sessionId,
    childId,
    progressTrackId: body.progressTrackId,
    locationId: body.locationId,
    eventDate: body.eventDate,
    lessonNumber: body.lessonNumber,
    unitLabel: body.unitLabel,
    topicsCovered: body.topicsCovered,
    topicsSummary: summary,
    notes: body.notes,
    source: "manual",
    recordedBy,
  });
  await upsertProgressCurrent({
    schoolId,
    childId,
    progressTrackId: body.progressTrackId,
    lessonNumber: body.lessonNumber,
    unitLabel: body.unitLabel,
    topicsSummary: summary,
    notes: body.notes,
    source: "manual",
    recordedBy,
  });
  await invalidateProgressInsight(childId, schoolId);
}

export async function getStudentProgressCurrent(
  childId: number,
  schoolId: number,
): Promise<
  Array<{
    current: typeof studentProgressCurrent.$inferSelect;
    track: ProgressTrack;
    subject: ProgressSubject;
  }>
> {
  const db = await getDb();
  const rows = await db
    .select({
      current: studentProgressCurrent,
      track: progressTracks,
      subject: progressSubjects,
    })
    .from(studentProgressCurrent)
    .innerJoin(progressTracks, eq(studentProgressCurrent.progressTrackId, progressTracks.id))
    .innerJoin(progressSubjects, eq(progressTracks.subjectId, progressSubjects.id))
    .where(and(eq(studentProgressCurrent.childId, childId), eq(studentProgressCurrent.schoolId, schoolId)))
    .orderBy(progressSubjects.sortOrder);
  return rows;
}

export async function getStudentProgressLog(
  childId: number,
  schoolId: number,
  sessionId?: number,
): Promise<
  Array<{
    log: typeof studentProgressLog.$inferSelect;
    track: ProgressTrack;
    subject: ProgressSubject;
    sessionName?: string;
  }>
> {
  const db = await getDb();
  const conditions = [
    eq(studentProgressLog.childId, childId),
    eq(studentProgressLog.schoolId, schoolId),
  ];
  if (sessionId) conditions.push(eq(studentProgressLog.sessionId, sessionId));
  const rows = await db
    .select({
      log: studentProgressLog,
      track: progressTracks,
      subject: progressSubjects,
      sessionName: sessions.name,
    })
    .from(studentProgressLog)
    .innerJoin(progressTracks, eq(studentProgressLog.progressTrackId, progressTracks.id))
    .innerJoin(progressSubjects, eq(progressTracks.subjectId, progressSubjects.id))
    .innerJoin(sessions, eq(studentProgressLog.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(desc(studentProgressLog.eventDate));
  return rows;
}

export async function getRecentProgressLogForSchool(
  schoolId: number,
  limit = 20,
  sessionId?: number,
): Promise<
  Array<{
    log: typeof studentProgressLog.$inferSelect;
    track: ProgressTrack;
    subject: ProgressSubject;
    child: Child;
  }>
> {
  const db = await getDb();
  const conditions = [eq(studentProgressLog.schoolId, schoolId)];
  if (sessionId) conditions.push(eq(studentProgressLog.sessionId, sessionId));
  const rows = await db
    .select({
      log: studentProgressLog,
      track: progressTracks,
      subject: progressSubjects,
      child: children,
    })
    .from(studentProgressLog)
    .innerJoin(progressTracks, eq(studentProgressLog.progressTrackId, progressTracks.id))
    .innerJoin(progressSubjects, eq(progressTracks.subjectId, progressSubjects.id))
    .innerJoin(children, eq(studentProgressLog.childId, children.id))
    .where(and(...conditions))
    .orderBy(desc(studentProgressLog.createdAt))
    .limit(limit);
  return rows;
}

export async function getParentProgressSummary(childrenIds: number[]): Promise<
  Record<
    number,
    {
      current: Awaited<ReturnType<typeof getStudentProgressCurrent>>;
      sessions: { sessionId: number; sessionName: string; logs: Awaited<ReturnType<typeof getStudentProgressLog>> }[];
    }
  >
> {
  const result: Record<number, any> = {};
  for (const childId of childrenIds) {
    const child = await getDb().then((db) =>
      db.select().from(children).where(eq(children.id, childId)).limit(1),
    );
    const schoolId = child[0]?.schoolId;
    if (!schoolId) continue;
    const current = await getStudentProgressCurrent(childId, schoolId);
    const allLogs = await getStudentProgressLog(childId, schoolId);
    const bySession = new Map<number, { sessionName: string; logs: typeof allLogs }>();
    for (const entry of allLogs) {
      const sid = entry.log.sessionId;
      if (!bySession.has(sid)) {
        bySession.set(sid, { sessionName: entry.sessionName ?? "Session", logs: [] });
      }
      bySession.get(sid)!.logs.push(entry);
    }
    result[childId] = {
      current,
      sessions: [...bySession.entries()].map(([sessionId, v]) => ({
        sessionId,
        sessionName: v.sessionName,
        logs: v.logs,
      })),
    };
  }
  return result;
}

async function invalidateProgressInsight(childId: number, schoolId: number): Promise<void> {
  const db = await getDb();
  await db
    .delete(childProgressInsights)
    .where(and(eq(childProgressInsights.childId, childId), eq(childProgressInsights.schoolId, schoolId)));
}

export async function getProgressInsightCache(
  childId: number,
  schoolId: number,
): Promise<{ summary: string; nextSteps: string[]; generatedAt: Date } | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(childProgressInsights)
    .where(and(eq(childProgressInsights.childId, childId), eq(childProgressInsights.schoolId, schoolId)))
    .orderBy(desc(childProgressInsights.generatedAt))
    .limit(1);
  if (!row?.summary) return null;
  return {
    summary: row.summary,
    nextSteps: (row.nextSteps as string[]) ?? [],
    generatedAt: row.generatedAt,
  };
}

export async function saveProgressInsightCache(
  childId: number,
  schoolId: number,
  summary: string,
  nextSteps: string[],
  model: string,
): Promise<void> {
  const db = await getDb();
  await db.insert(childProgressInsights).values({
    childId,
    schoolId,
    summary,
    nextSteps,
    model,
    generatedAt: new Date(),
  });
}

// ---------- Progress track catalog ----------

export async function getProgressTrackCatalog(schoolId: number): Promise<
  Array<{ id: number; name: string; subjectId: number; subjectKey: string; subjectLabel: string }>
> {
  const db = await getDb();
  await ensureProgressSubjectsForSchool(schoolId);
  const rows = await db
    .select({
      id: progressTracks.id,
      name: progressTracks.name,
      subjectId: progressSubjects.id,
      subjectKey: progressSubjects.key,
      subjectLabel: progressSubjects.label,
    })
    .from(progressTracks)
    .innerJoin(progressSubjects, eq(progressTracks.subjectId, progressSubjects.id))
    .where(and(eq(progressTracks.schoolId, schoolId), eq(progressTracks.isActive, true)))
    .orderBy(progressSubjects.sortOrder, progressTracks.name);
  return rows;
}

// ---------- Assessment sessions (school-scoped in-app runs) ----------

export async function getAssessmentSessionsForSchool(
  schoolId: number,
  filters?: { childId?: number; status?: string },
): Promise<(typeof assessmentSessions.$inferSelect)[]> {
  const db = await getDb();
  const conditions = [eq(assessmentSessions.schoolId, schoolId)];
  if (filters?.childId) conditions.push(eq(assessmentSessions.childId, filters.childId));
  if (filters?.status) conditions.push(eq(assessmentSessions.status, filters.status));
  return db
    .select()
    .from(assessmentSessions)
    .where(and(...conditions))
    .orderBy(desc(assessmentSessions.startedAt));
}

export async function getAssessmentSessionById(id: number): Promise<typeof assessmentSessions.$inferSelect | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(assessmentSessions).where(eq(assessmentSessions.id, id)).limit(1);
  return row;
}

export async function createAssessmentSession(
  data: typeof assessmentSessions.$inferInsert,
): Promise<typeof assessmentSessions.$inferSelect> {
  const db = await getDb();
  const [row] = await db.insert(assessmentSessions).values(data).returning();
  return row;
}

export async function updateAssessmentSession(
  id: number,
  data: Partial<typeof assessmentSessions.$inferInsert>,
): Promise<typeof assessmentSessions.$inferSelect | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(assessmentSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assessmentSessions.id, id))
    .returning();
  return row;
}

// ---------- Quarterly IHIP rubric & snapshots ----------

export async function getQuarterlyProgressMeta(
  childId: number,
  schoolId: number,
  schoolYear: string,
  quarter: string,
): Promise<typeof quarterlyProgressMeta.$inferSelect | undefined> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(quarterlyProgressMeta)
    .where(
      and(
        eq(quarterlyProgressMeta.childId, childId),
        eq(quarterlyProgressMeta.schoolId, schoolId),
        eq(quarterlyProgressMeta.schoolYear, schoolYear),
        eq(quarterlyProgressMeta.quarter, quarter),
      ),
    )
    .limit(1);
  return row;
}

export async function upsertQuarterlyProgressMeta(
  childId: number,
  schoolId: number,
  data: {
    schoolYear: string;
    quarter: string;
    quarterLabel?: string | null;
    asaCoopHours?: number | null;
    homeInstructionHours?: number | null;
    draftNarrative?: string | null;
    approvedNarrative?: string | null;
    notesObservations?: string | null;
    phonogramCount?: number | null;
    mathLevelLabel?: string | null;
    mathFallPercent?: number | null;
    mathWinterPercent?: number | null;
    mathSpringPercent?: number | null;
    approvedBy?: number | null;
    approvedAt?: Date | null;
  },
): Promise<typeof quarterlyProgressMeta.$inferSelect> {
  const db = await getDb();
  const existing = await getQuarterlyProgressMeta(childId, schoolId, data.schoolYear, data.quarter);
  if (existing) {
    const [row] = await db
      .update(quarterlyProgressMeta)
      .set({
        quarterLabel: data.quarterLabel ?? existing.quarterLabel,
        asaCoopHours: data.asaCoopHours ?? existing.asaCoopHours,
        homeInstructionHours: data.homeInstructionHours ?? existing.homeInstructionHours,
        draftNarrative: data.draftNarrative ?? existing.draftNarrative,
        approvedNarrative: data.approvedNarrative ?? existing.approvedNarrative,
        notesObservations: data.notesObservations ?? existing.notesObservations,
        phonogramCount: data.phonogramCount ?? existing.phonogramCount,
        mathLevelLabel: data.mathLevelLabel ?? existing.mathLevelLabel,
        mathFallPercent: data.mathFallPercent ?? existing.mathFallPercent,
        mathWinterPercent: data.mathWinterPercent ?? existing.mathWinterPercent,
        mathSpringPercent: data.mathSpringPercent ?? existing.mathSpringPercent,
        approvedBy: data.approvedBy ?? existing.approvedBy,
        approvedAt: data.approvedAt ?? existing.approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(quarterlyProgressMeta.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(quarterlyProgressMeta)
    .values({
      schoolId,
      childId,
      schoolYear: data.schoolYear,
      quarter: data.quarter,
      quarterLabel: data.quarterLabel,
      asaCoopHours: data.asaCoopHours,
      homeInstructionHours: data.homeInstructionHours,
      draftNarrative: data.draftNarrative,
      approvedNarrative: data.approvedNarrative,
      notesObservations: data.notesObservations,
      phonogramCount: data.phonogramCount,
      mathLevelLabel: data.mathLevelLabel,
      mathFallPercent: data.mathFallPercent,
      mathWinterPercent: data.mathWinterPercent,
      mathSpringPercent: data.mathSpringPercent,
      approvedBy: data.approvedBy,
      approvedAt: data.approvedAt,
    })
    .returning();
  return row;
}

export async function getQuarterlySkillChecks(
  childId: number,
  schoolId: number,
  schoolYear: string,
  quarter: string,
): Promise<(typeof quarterlySkillChecks.$inferSelect)[]> {
  const db = await getDb();
  return db
    .select()
    .from(quarterlySkillChecks)
    .where(
      and(
        eq(quarterlySkillChecks.childId, childId),
        eq(quarterlySkillChecks.schoolId, schoolId),
        eq(quarterlySkillChecks.schoolYear, schoolYear),
        eq(quarterlySkillChecks.quarter, quarter),
      ),
    );
}

export async function saveQuarterlySkillChecks(
  childId: number,
  schoolId: number,
  schoolYear: string,
  quarter: string,
  checks: Array<{ skillKey: string; term: string; status: string }>,
): Promise<void> {
  const db = await getDb();
  for (const c of checks) {
    const [existing] = await db
      .select()
      .from(quarterlySkillChecks)
      .where(
        and(
          eq(quarterlySkillChecks.childId, childId),
          eq(quarterlySkillChecks.schoolYear, schoolYear),
          eq(quarterlySkillChecks.quarter, quarter),
          eq(quarterlySkillChecks.skillKey, c.skillKey),
          eq(quarterlySkillChecks.term, c.term),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(quarterlySkillChecks)
        .set({ status: c.status, updatedAt: new Date() })
        .where(eq(quarterlySkillChecks.id, existing.id));
    } else {
      await db.insert(quarterlySkillChecks).values({
        schoolId,
        childId,
        schoolYear,
        quarter,
        skillKey: c.skillKey,
        term: c.term,
        status: c.status,
      });
    }
  }
}

export function skillChecksToMap(
  rows: (typeof quarterlySkillChecks.$inferSelect)[],
): Record<string, Record<string, 'unchecked' | 'consistent' | 'na'>> {
  const map: Record<string, Record<string, 'unchecked' | 'consistent' | 'na'>> = {};
  for (const r of rows) {
    if (!map[r.skillKey]) map[r.skillKey] = {};
    map[r.skillKey][r.term] = r.status as 'unchecked' | 'consistent' | 'na';
  }
  return map;
}

export async function buildStudentProgressReport(
  childId: number,
  schoolId: number,
  options: {
    schoolYear: string;
    quarter: string;
    bandOverride?: import('./resolve-progress-report-band').ProgressReportBand;
    mentorName?: string | null;
    sessionId?: number;
  },
): Promise<import('./build-student-progress-report').StudentProgressReportDto | null> {
  const child = await getChildByIdForSchool(childId, schoolId);
  if (!child) return null;

  const meta = await getQuarterlyProgressMeta(childId, schoolId, options.schoolYear, options.quarter);
  const skillRows = await getQuarterlySkillChecks(childId, schoolId, options.schoolYear, options.quarter);
  const current = await getStudentProgressCurrent(childId, schoolId);
  const logs = await getStudentProgressLog(childId, schoolId, options.sessionId);
  const assessments = await getStudentAssessmentsByChildId(childId);

  const { buildStudentProgressReport: build } = await import('./build-student-progress-report');

  return build(child, {
    schoolYear: options.schoolYear,
    quarter: options.quarter,
    bandOverride: options.bandOverride,
    mentorName: options.mentorName,
    meta: meta
      ? {
          quarterLabel: meta.quarterLabel,
          asaCoopHours: meta.asaCoopHours,
          homeInstructionHours: meta.homeInstructionHours,
          approvedNarrative: meta.approvedNarrative,
          draftNarrative: meta.draftNarrative,
          notesObservations: meta.notesObservations,
          phonogramCount: meta.phonogramCount,
          mathLevelLabel: meta.mathLevelLabel,
          mathFallPercent: meta.mathFallPercent,
          mathWinterPercent: meta.mathWinterPercent,
          mathSpringPercent: meta.mathSpringPercent,
        }
      : null,
    skillChecks: skillChecksToMap(skillRows),
    current,
    logs,
    assessments: assessments.map((a) => ({
      score: a.score,
      assessmentDate: a.assessmentDate,
      lesson: a.lesson,
    })),
  });
}

export async function saveQuarterlyProgressSnapshot(
  childId: number,
  schoolId: number,
  schoolYear: string,
  quarter: string,
  band: string,
  templateVersion: string,
  payloadJson: object,
  generatedBy: number,
  pdfSha256?: string | null,
): Promise<typeof quarterlyProgressReports.$inferSelect> {
  const db = await getDb();
  const [row] = await db
    .insert(quarterlyProgressReports)
    .values({
      schoolId,
      childId,
      schoolYear,
      quarter,
      band,
      templateVersion,
      payloadJson,
      generatedBy,
      pdfSha256: pdfSha256 ?? null,
    })
    .returning();
  return row;
}

export async function getQuarterlyProgressSnapshots(
  childId: number,
  schoolId: number,
): Promise<(typeof quarterlyProgressReports.$inferSelect)[]> {
  const db = await getDb();
  return db
    .select()
    .from(quarterlyProgressReports)
    .where(and(eq(quarterlyProgressReports.childId, childId), eq(quarterlyProgressReports.schoolId, schoolId)))
    .orderBy(desc(quarterlyProgressReports.generatedAt));
}

export async function getQuarterlyProgressSnapshotById(
  id: number,
  schoolId: number,
): Promise<typeof quarterlyProgressReports.$inferSelect | undefined> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(quarterlyProgressReports)
    .where(and(eq(quarterlyProgressReports.id, id), eq(quarterlyProgressReports.schoolId, schoolId)))
    .limit(1);
  return row;
}
