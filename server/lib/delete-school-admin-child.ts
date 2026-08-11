import type { Child } from '@shared/schema';
import type { IStorage } from '../storage';

export type DeleteSchoolAdminChildStorage = Pick<
  IStorage,
  | 'getChildById'
  | 'getEnrollmentsByChildId'
  | 'getSchoolStudentByChildId'
  | 'deleteSchoolStudent'
  | 'deleteChild'
>;

export class DeleteSchoolAdminChildError extends Error {
  status: number;
  enrollmentCount?: number;

  constructor(message: string, status: number, enrollmentCount?: number) {
    super(message);
    this.name = 'DeleteSchoolAdminChildError';
    this.status = status;
    this.enrollmentCount = enrollmentCount;
  }
}

export type DeleteSchoolAdminChildResult = {
  child: Child;
  deletedSchoolStudentIds: number[];
};

/**
 * School-admin hard delete for a child with no program enrollments.
 * Must remove `school_students` first — that FK has no ON DELETE CASCADE.
 */
export async function deleteSchoolAdminChild(
  storage: DeleteSchoolAdminChildStorage,
  childId: number,
): Promise<DeleteSchoolAdminChildResult> {
  const child = await storage.getChildById(childId);
  if (!child) {
    throw new DeleteSchoolAdminChildError('Child not found', 404);
  }

  const enrollments = await storage.getEnrollmentsByChildId(childId);
  if (enrollments.length > 0) {
    throw new DeleteSchoolAdminChildError(
      'Cannot delete child with enrollments. Remove or transfer enrollments first.',
      400,
      enrollments.length,
    );
  }

  const deletedSchoolStudentIds: number[] = [];
  // A child can have more than one school_students row; drain them all.
  for (let i = 0; i < 50; i++) {
    const row = await storage.getSchoolStudentByChildId(childId);
    if (!row) break;
    await storage.deleteSchoolStudent(row.id);
    deletedSchoolStudentIds.push(row.id);
  }

  await storage.deleteChild(childId);
  return { child, deletedSchoolStudentIds };
}
