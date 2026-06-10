/**
 * Keep user_locations (Staff Permissions) in sync with users.location_id (Users page).
 * Profile location alone does not grant permissions until a user_locations row exists.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { locations, userLocations } from '../../shared/schema';
import { storage } from '../storage';

export async function syncUserLocationForSchool(
  userId: number,
  schoolId: number,
  locationId: number | null,
): Promise<void> {
  const db = await getDb();
  const schoolLocationRows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.schoolId, schoolId));
  const schoolLocationIds = schoolLocationRows.map((loc) => loc.id);

  if (locationId !== null && !schoolLocationIds.includes(locationId)) {
    throw new Error('Invalid location - location does not belong to this school');
  }

  const existingUserLocationsForSchool = await db
    .select()
    .from(userLocations)
    .where(eq(userLocations.userId, userId));

  const userLocationsAtThisSchool = existingUserLocationsForSchool.filter((ul) =>
    schoolLocationIds.includes(ul.locationId),
  );

  for (const oldLocation of userLocationsAtThisSchool) {
    if (oldLocation.locationId !== locationId) {
      await db.delete(userLocations).where(eq(userLocations.id, oldLocation.id));
    }
  }

  if (locationId !== null) {
    const hasExistingRecord = userLocationsAtThisSchool.some(
      (ul) => ul.locationId === locationId,
    );
    if (!hasExistingRecord) {
      await db.insert(userLocations).values({
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
  }

  const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
  const existingStaffRecord = schoolStaffRecords.find((s) => s.userId === userId);
  if (existingStaffRecord) {
    await storage.updateSchoolStaff(existingStaffRecord.id, { locationId });
  }
}
