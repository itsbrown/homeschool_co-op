import { storage } from '../storage';
import { getSchoolCoreById } from './school-db';

/**
 * Link a parent users row to a school (replaces self-fetch to /api/school-parents/associate).
 */
export async function associateParentWithSchool(
  parentEmail: string,
  schoolId: number,
): Promise<{ userId: number; schoolId: number }> {
  const numericSchoolId = Number(schoolId);
  if (!Number.isFinite(numericSchoolId) || numericSchoolId <= 0) {
    throw new Error('Invalid school id');
  }

  const school = await getSchoolCoreById(numericSchoolId);
  if (!school) {
    throw new Error(`School ${numericSchoolId} not found`);
  }

  const user = await storage.getUserByEmail(parentEmail);
  if (!user) {
    throw new Error('Parent user not found');
  }

  if (user.schoolId === numericSchoolId) {
    return { userId: user.id, schoolId: numericSchoolId };
  }

  const updated = await storage.updateUser(user.id, { schoolId: numericSchoolId });
  if (!updated?.schoolId) {
    throw new Error('Failed to update user with school association');
  }

  return { userId: updated.id, schoolId: updated.schoolId };
}
