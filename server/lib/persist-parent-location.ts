import { eq } from 'drizzle-orm';
import { userLocations } from '@shared/schema';
import type { IStorage } from '../storage';
import { getDb } from '../db';
import { resolveSchoolAndChildLocation } from './parent-child-registration';

export type ParentLocationStorage = Pick<
  IStorage,
  | 'getLocationsBySchoolId'
  | 'getSchool'
  | 'createUserLocation'
  | 'getUserLocationsByUserId'
  | 'updateUser'
>;

/**
 * Writes campus to user_locations (permissions) and users.location_id (parent profile).
 */
export async function persistParentLocationAssociation(
  storage: ParentLocationStorage,
  userId: number,
  locationId: number,
): Promise<void> {
  const existing = await storage.getUserLocationsByUserId(userId);
  const hasActive = existing.some(
    (ul) => ul.locationId === locationId && ul.isActive !== false,
  );
  if (!hasActive) {
    await storage.createUserLocation({
      userId,
      locationId,
      accessLevel: 'view',
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    });
  }
  await storage.updateUser(userId, { locationId });
}

export type EnsureParentRegistrationLocationResult =
  | { ok: true; locationId: number | null }
  | { ok: false; message: string; status: 400 | 500 };

type RegistrationRollbackStorage = Pick<IStorage, 'deleteUserRolesByUserId' | 'deleteUser'>;

/**
 * Removes partial signup rows when campus persist fails after user + role exist.
 * Hard-deletes user_locations (no CASCADE on users FK).
 */
export async function rollbackRegistrationAfterLocationFailure(
  storage: RegistrationRollbackStorage,
  userId: number,
): Promise<void> {
  const db = await getDb();
  await db.delete(userLocations).where(eq(userLocations.userId, userId));
  await storage.deleteUserRolesByUserId(userId);
  await storage.deleteUser(userId);
}

/**
 * School-code signup must pick a valid campus when the school has active locations.
 * Also syncs parent location fields used by permissions and session enrollment.
 */
export async function ensureParentRegistrationLocation(
  storage: ParentLocationStorage,
  opts: {
    userId: number;
    schoolId: number | null;
    preferredLocationId: number | null;
    isSchoolCodeParentSignup: boolean;
  },
): Promise<EnsureParentRegistrationLocationResult> {
  const { userId, schoolId, preferredLocationId, isSchoolCodeParentSignup } = opts;
  if (!schoolId) {
    return { ok: true, locationId: null };
  }

  const { validSchoolId, locationId } = await resolveSchoolAndChildLocation(
    storage,
    schoolId,
    preferredLocationId,
  );
  if (!validSchoolId) {
    return { ok: false, message: 'Invalid school for registration.', status: 400 };
  }

  const locations = await storage.getLocationsBySchoolId(validSchoolId);
  const schoolHasCampuses = locations.length > 0;

  if (isSchoolCodeParentSignup && schoolHasCampuses) {
    if (preferredLocationId == null) {
      return {
        ok: false,
        message: 'Please select a campus location to finish registration.',
        status: 400,
      };
    }
    const campusBelongsToSchool = locations.some((l) => l.id === preferredLocationId);
    if (!campusBelongsToSchool || locationId == null) {
      return {
        ok: false,
        message: 'The selected campus is not valid for this school.',
        status: 400,
      };
    }
  }

  if (locationId == null) {
    return { ok: true, locationId: null };
  }

  try {
    await persistParentLocationAssociation(storage, userId, locationId);
    return { ok: true, locationId };
  } catch (err) {
    console.error('Failed to persist parent location association:', err);
    return {
      ok: false,
      message: 'Could not save your campus location. Please try again.',
      status: 500,
    };
  }
}
