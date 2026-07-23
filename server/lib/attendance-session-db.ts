/**
 * Class session + student attendance persistence (teacher QR clock-in / roster mark).
 * Wired onto DatabaseStorage / CombinedStorage — Postgres only.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  classSessions,
  classes,
  sessionAttendance,
  users,
  type ClassSession,
  type InsertClassSession,
  type InsertSessionAttendance,
  type SessionAttendance,
} from "../../shared/schema";

export async function getClassSessionById(id: number): Promise<ClassSession | undefined> {
  const db = await getDb();
  const [session] = await db.select().from(classSessions).where(eq(classSessions.id, id));
  return session;
}

export async function getSessionByQrToken(token: string): Promise<ClassSession | undefined> {
  const db = await getDb();
  const [session] = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.qrToken, token));
  return session;
}

export async function getTeacherClockInRecords(params: {
  schoolId: number;
  startDate?: string;
  endDate?: string;
  classId?: number;
}): Promise<
  Array<{
    sessionId: number;
    scheduledDate: string;
    actualStartTime: string | null;
    actualEndTime: string | null;
    checkInLocationVerified: boolean | null;
    className: string;
    educatorName: string;
  }>
> {
  const db = await getDb();
  const { schoolId, startDate, endDate, classId } = params;
  const conditions = [
    eq(classSessions.schoolId, schoolId),
    sql`${classSessions.actualStartTime} IS NOT NULL`,
    sql`${classSessions.notes} LIKE '%[teacher-clockin]%'`,
  ];
  if (startDate) conditions.push(sql`${classSessions.scheduledDate} >= ${startDate}`);
  if (endDate) conditions.push(sql`${classSessions.scheduledDate} <= ${endDate}`);
  if (classId) conditions.push(eq(classSessions.classId, classId));

  const results = await db
    .select({
      sessionId: classSessions.id,
      scheduledDate: classSessions.scheduledDate,
      actualStartTime: classSessions.actualStartTime,
      actualEndTime: classSessions.actualEndTime,
      checkInLocationVerified: classSessions.checkInLocationVerified,
      classTitle: classes.title,
      educatorFirstName: users.firstName,
      educatorLastName: users.lastName,
    })
    .from(classSessions)
    .leftJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(users, eq(classSessions.educatorId, users.id))
    .where(and(...conditions))
    .orderBy(sql`${classSessions.scheduledDate} DESC`);

  return results.map((row) => ({
    sessionId: row.sessionId,
    scheduledDate: row.scheduledDate,
    actualStartTime: row.actualStartTime
      ? new Date(row.actualStartTime).toISOString()
      : null,
    actualEndTime: row.actualEndTime
      ? new Date(row.actualEndTime).toISOString()
      : null,
    checkInLocationVerified: row.checkInLocationVerified ?? null,
    className: row.classTitle ?? "Unknown Class",
    educatorName:
      [row.educatorFirstName, row.educatorLastName].filter(Boolean).join(" ") || "Unknown",
  }));
}

export async function getClassSessionsByClassId(classId: number): Promise<ClassSession[]> {
  const db = await getDb();
  return db.select().from(classSessions).where(eq(classSessions.classId, classId));
}

export async function getClassSessionsByEducatorId(educatorId: number): Promise<ClassSession[]> {
  const db = await getDb();
  return db.select().from(classSessions).where(eq(classSessions.educatorId, educatorId));
}

export async function getClassSessionsBySchoolId(schoolId: number): Promise<ClassSession[]> {
  const db = await getDb();
  return db.select().from(classSessions).where(eq(classSessions.schoolId, schoolId));
}

export async function getClassSessionsByDate(
  schoolId: number,
  date: string,
): Promise<ClassSession[]> {
  const db = await getDb();
  return db
    .select()
    .from(classSessions)
    .where(and(eq(classSessions.schoolId, schoolId), eq(classSessions.scheduledDate, date)));
}

export async function getClassSessionsByDateRange(
  schoolId: number,
  startDate: string,
  endDate: string,
): Promise<ClassSession[]> {
  const db = await getDb();
  return db
    .select()
    .from(classSessions)
    .where(
      and(
        eq(classSessions.schoolId, schoolId),
        sql`${classSessions.scheduledDate} >= ${startDate}`,
        sql`${classSessions.scheduledDate} <= ${endDate}`,
      ),
    );
}

export async function getActiveClassSession(
  educatorId: number,
): Promise<ClassSession | undefined> {
  const db = await getDb();
  const [session] = await db
    .select()
    .from(classSessions)
    .where(
      and(eq(classSessions.educatorId, educatorId), eq(classSessions.status, "in_progress")),
    );
  return session;
}

export async function createClassSession(session: InsertClassSession): Promise<ClassSession> {
  const db = await getDb();
  const [newSession] = await db
    .insert(classSessions)
    .values({
      ...session,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return newSession;
}

export async function updateClassSession(
  id: number,
  session: Partial<InsertClassSession>,
): Promise<ClassSession | undefined> {
  const db = await getDb();
  const [updated] = await db
    .update(classSessions)
    .set({ ...session, updatedAt: new Date() })
    .where(eq(classSessions.id, id))
    .returning();
  return updated;
}

export async function deleteClassSession(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(classSessions).where(eq(classSessions.id, id));
}

export async function getAttendanceBySessionId(
  sessionId: number,
): Promise<SessionAttendance[]> {
  const db = await getDb();
  return db
    .select()
    .from(sessionAttendance)
    .where(eq(sessionAttendance.sessionId, sessionId));
}

export async function getAttendanceByChildId(childId: number): Promise<SessionAttendance[]> {
  const db = await getDb();
  return db
    .select()
    .from(sessionAttendance)
    .where(eq(sessionAttendance.childId, childId))
    .orderBy(desc(sessionAttendance.recordedAt));
}

export async function getAttendanceBySchoolId(schoolId: number): Promise<SessionAttendance[]> {
  const db = await getDb();
  return db
    .select()
    .from(sessionAttendance)
    .where(eq(sessionAttendance.schoolId, schoolId))
    .orderBy(desc(sessionAttendance.recordedAt));
}

export async function getAttendanceRecord(
  sessionId: number,
  childId: number,
): Promise<SessionAttendance | undefined> {
  const db = await getDb();
  const [record] = await db
    .select()
    .from(sessionAttendance)
    .where(
      and(
        eq(sessionAttendance.sessionId, sessionId),
        eq(sessionAttendance.childId, childId),
      ),
    )
    .limit(1);
  return record;
}

export async function createAttendance(
  attendance: InsertSessionAttendance,
): Promise<SessionAttendance> {
  const db = await getDb();
  const [newAttendance] = await db
    .insert(sessionAttendance)
    .values(attendance)
    .returning();
  return newAttendance;
}

export async function updateAttendance(
  id: number,
  attendanceData: Partial<InsertSessionAttendance>,
): Promise<SessionAttendance | undefined> {
  const db = await getDb();
  const [updated] = await db
    .update(sessionAttendance)
    .set({ ...attendanceData, updatedAt: new Date() })
    .where(eq(sessionAttendance.id, id))
    .returning();
  return updated;
}

export async function deleteAttendance(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(sessionAttendance).where(eq(sessionAttendance.id, id));
}

export async function upsertAttendance(
  attendance: InsertSessionAttendance,
): Promise<SessionAttendance> {
  const existing = await getAttendanceRecord(attendance.sessionId, attendance.childId);
  if (existing) {
    const updated = await updateAttendance(existing.id, attendance);
    return updated!;
  }
  return createAttendance(attendance);
}
