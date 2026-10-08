import { desc, eq, inArray } from 'drizzle-orm';
import {
  schoolApplications,
  type InsertSchoolApplication,
  type SchoolApplication,
} from '@shared/schema';
import { getDb } from '../db';

export type SchoolApplicationStatus = 'pending' | 'under_review' | 'approved' | 'declined';

type CreateInput = InsertSchoolApplication & {
  token: string;
  gradelevelsServed?: string[];
  gradeLevelsServed?: string[];
};

function mapCreate(input: CreateInput) {
  const gradeLevels =
    input.gradeLevelsServed ??
    input.gradelevelsServed ??
    [];
  return {
    schoolName: input.schoolName,
    schoolType: input.schoolType,
    schoolTypeOther: input.schoolTypeOther ?? null,
    adminFirstName: input.adminFirstName,
    adminLastName: input.adminLastName,
    adminEmail: input.adminEmail,
    adminPhone: input.adminPhone,
    address: input.address,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode,
    website: input.website || null,
    currentStudentCount: input.currentStudentCount,
    gradeLevelsServed: gradeLevels,
    establishedYear: input.establishedYear,
    reasonForJoining: input.reasonForJoining,
    currentChallenges: input.currentChallenges,
    expectedStudentGrowth: input.expectedStudentGrowth,
    reference1Name: input.reference1Name,
    reference1Email: input.reference1Email,
    reference1Relationship: input.reference1Relationship,
    reference2Name: input.reference2Name || null,
    reference2Email: input.reference2Email || null,
    reference2Relationship: input.reference2Relationship || null,
    agreesToTerms: input.agreesToTerms,
    agreesToDataSharing: input.agreesToDataSharing,
    token: input.token,
    status: 'pending' as const,
  };
}

export async function listSchoolApplications(): Promise<SchoolApplication[]> {
  const db = await getDb();
  return db.select().from(schoolApplications).orderBy(desc(schoolApplications.submittedAt));
}

export async function getSchoolApplicationsByStatus(
  status: SchoolApplicationStatus,
): Promise<SchoolApplication[]> {
  const db = await getDb();
  return db
    .select()
    .from(schoolApplications)
    .where(eq(schoolApplications.status, status))
    .orderBy(desc(schoolApplications.submittedAt));
}

export async function getSchoolApplicationsByEmail(email: string): Promise<SchoolApplication[]> {
  const db = await getDb();
  const rows = await listSchoolApplications();
  const needle = email.trim().toLowerCase();
  return rows.filter((row) => row.adminEmail.trim().toLowerCase() === needle);
}

export async function getSchoolApplicationById(id: number): Promise<SchoolApplication | undefined> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schoolApplications)
    .where(eq(schoolApplications.id, id))
    .limit(1);
  return row;
}

export async function findOpenApplicationByEmail(email: string): Promise<SchoolApplication | undefined> {
  const db = await getDb();
  const needle = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(schoolApplications)
    .where(inArray(schoolApplications.status, ['pending', 'under_review']));
  return rows.find((row) => row.adminEmail.trim().toLowerCase() === needle);
}

export async function createSchoolApplication(input: CreateInput): Promise<SchoolApplication> {
  const db = await getDb();
  const [row] = await db.insert(schoolApplications).values(mapCreate(input)).returning();
  return row;
}

export async function updateSchoolApplicationStatus(
  id: number,
  status: SchoolApplicationStatus,
  reviewedBy?: string,
  reviewNotes?: string,
  extra?: { schoolId?: number | null; rejectionReason?: string | null },
): Promise<SchoolApplication | undefined> {
  const db = await getDb();
  const patch: Partial<typeof schoolApplications.$inferInsert> = {
    status,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  };
  if (reviewedBy) patch.reviewedBy = reviewedBy;
  if (reviewNotes !== undefined) patch.reviewNotes = reviewNotes;
  if (extra?.schoolId !== undefined && extra.schoolId !== null) patch.schoolId = extra.schoolId;
  if (extra?.rejectionReason !== undefined) patch.rejectionReason = extra.rejectionReason;
  const [row] = await db
    .update(schoolApplications)
    .set(patch)
    .where(eq(schoolApplications.id, id))
    .returning();
  return row;
}

export async function countOpenApplicationsForEmail(email: string): Promise<number> {
  const open = await findOpenApplicationByEmail(email);
  return open ? 1 : 0;
}
