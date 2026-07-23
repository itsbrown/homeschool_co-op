/**
 * Educator schedule overrides (educator_schedules).
 * Wired onto DatabaseStorage / CombinedStorage — Postgres only.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  educatorSchedules,
  type EducatorSchedule,
  type InsertEducatorSchedule,
} from "../../shared/schema";

export async function getEducatorScheduleById(
  id: number,
): Promise<EducatorSchedule | undefined> {
  const db = await getDb();
  const [schedule] = await db
    .select()
    .from(educatorSchedules)
    .where(eq(educatorSchedules.id, id));
  return schedule;
}

export async function getEducatorSchedulesByEducatorId(
  educatorId: number,
): Promise<EducatorSchedule[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorSchedules)
    .where(eq(educatorSchedules.educatorId, educatorId))
    .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
}

export async function getEducatorSchedulesByClassId(
  classId: number,
): Promise<EducatorSchedule[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorSchedules)
    .where(eq(educatorSchedules.classId, classId))
    .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
}

export async function getEducatorSchedulesBySchoolId(
  schoolId: number,
): Promise<EducatorSchedule[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorSchedules)
    .where(eq(educatorSchedules.schoolId, schoolId))
    .orderBy(
      asc(educatorSchedules.educatorId),
      asc(educatorSchedules.dayOfWeek),
      asc(educatorSchedules.startTime),
    );
}

export async function getEducatorSchedulesByAssignmentId(
  assignmentId: number,
): Promise<EducatorSchedule[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorSchedules)
    .where(eq(educatorSchedules.assignmentId, assignmentId))
    .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
}

export async function getEducatorSchedulesForWeek(
  educatorId: number,
  weekStartDate: string,
): Promise<EducatorSchedule[]> {
  const db = await getDb();
  const weekEnd = new Date(weekStartDate + "T12:00:00");
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  return db
    .select()
    .from(educatorSchedules)
    .where(
      and(
        eq(educatorSchedules.educatorId, educatorId),
        eq(educatorSchedules.isActive, true),
        or(
          isNull(educatorSchedules.effectiveTo),
          sql`${educatorSchedules.effectiveTo} >= ${weekStartDate}`,
        ),
        sql`${educatorSchedules.effectiveFrom} <= ${weekEndStr}`,
      ),
    )
    .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
}

export async function createEducatorSchedule(
  schedule: InsertEducatorSchedule,
): Promise<EducatorSchedule> {
  const db = await getDb();
  const [newSchedule] = await db.insert(educatorSchedules).values(schedule).returning();
  return newSchedule;
}

export async function updateEducatorSchedule(
  id: number,
  schedule: Partial<InsertEducatorSchedule>,
): Promise<EducatorSchedule | undefined> {
  const db = await getDb();
  const [updated] = await db
    .update(educatorSchedules)
    .set({ ...schedule, updatedAt: new Date() })
    .where(eq(educatorSchedules.id, id))
    .returning();
  return updated;
}

export async function deleteEducatorSchedule(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(educatorSchedules).where(eq(educatorSchedules.id, id));
}
