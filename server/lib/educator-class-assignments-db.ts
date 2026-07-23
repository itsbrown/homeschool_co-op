/**
 * Educator ↔ class assignment persistence (My Classes / session start).
 * Wired onto DatabaseStorage / CombinedStorage — Postgres only.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  educatorClassAssignments,
  type EducatorClassAssignment,
} from "../../shared/schema";

export type InsertEducatorClassAssignment = {
  educatorId: number;
  classId: number;
  schoolId: number;
  isPrimary?: boolean;
  canStartSession?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
};

export async function getEducatorClassAssignmentById(
  id: number,
): Promise<EducatorClassAssignment | undefined> {
  const db = await getDb();
  const [assignment] = await db
    .select()
    .from(educatorClassAssignments)
    .where(eq(educatorClassAssignments.id, id));
  return assignment;
}

export async function getEducatorClassAssignmentsByEducatorId(
  educatorId: number,
): Promise<EducatorClassAssignment[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorClassAssignments)
    .where(eq(educatorClassAssignments.educatorId, educatorId));
}

export async function getEducatorClassAssignmentsByClassId(
  classId: number,
): Promise<EducatorClassAssignment[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorClassAssignments)
    .where(eq(educatorClassAssignments.classId, classId));
}

export async function getEducatorClassAssignmentsBySchoolId(
  schoolId: number,
): Promise<EducatorClassAssignment[]> {
  const db = await getDb();
  return db
    .select()
    .from(educatorClassAssignments)
    .where(eq(educatorClassAssignments.schoolId, schoolId));
}

export async function getActiveEducatorAssignmentForClass(
  educatorId: number,
  classId: number,
): Promise<EducatorClassAssignment | undefined> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const [assignment] = await db
    .select()
    .from(educatorClassAssignments)
    .where(
      and(
        eq(educatorClassAssignments.educatorId, educatorId),
        eq(educatorClassAssignments.classId, classId),
        or(
          isNull(educatorClassAssignments.validFrom),
          sql`${educatorClassAssignments.validFrom} <= ${today}`,
        ),
        or(
          isNull(educatorClassAssignments.validTo),
          sql`${educatorClassAssignments.validTo} >= ${today}`,
        ),
      ),
    );
  return assignment;
}

export async function createEducatorClassAssignment(
  assignment: InsertEducatorClassAssignment,
): Promise<EducatorClassAssignment> {
  const db = await getDb();
  const [newAssignment] = await db
    .insert(educatorClassAssignments)
    .values({
      educatorId: assignment.educatorId,
      classId: assignment.classId,
      schoolId: assignment.schoolId,
      isPrimary: assignment.isPrimary ?? true,
      canStartSession: assignment.canStartSession ?? true,
      validFrom: assignment.validFrom ?? null,
      validTo: assignment.validTo ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return newAssignment;
}

export async function updateEducatorClassAssignment(
  id: number,
  assignment: Partial<InsertEducatorClassAssignment>,
): Promise<EducatorClassAssignment | undefined> {
  const db = await getDb();
  const [updated] = await db
    .update(educatorClassAssignments)
    .set({ ...assignment, updatedAt: new Date() })
    .where(eq(educatorClassAssignments.id, id))
    .returning();
  return updated;
}

export async function deleteEducatorClassAssignment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(educatorClassAssignments).where(eq(educatorClassAssignments.id, id));
}
