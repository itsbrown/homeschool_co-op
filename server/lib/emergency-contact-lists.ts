import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  children,
  classes,
  emergencyContacts,
  locations,
  programEnrollments,
  users,
} from "@shared/schema";
import { isClassStillCurrent } from "@shared/current-class-enrollment";
import {
  ACTIVE_EMERGENCY_ROSTER_STATUSES,
  groupEmergencyContactLists,
  resolveEmergencyContact,
  type EmergencyContactClassMeta,
  type EmergencyContactListsPayload,
  type EmergencyContactSeatInput,
  type ExtraEmergencyContact,
} from "@shared/emergency-contact-resolve";
import { getSchoolCoreById } from "./school-db";

const ACTIVE_STATUSES = [...ACTIVE_EMERGENCY_ROSTER_STATUSES];

export async function loadSchoolEmergencyContactLists(params: {
  schoolId: number;
  classId?: number | null;
  locationIds?: number[] | null;
}): Promise<EmergencyContactListsPayload> {
  const db = await getDb();
  const school = await getSchoolCoreById(params.schoolId);
  if (!school) {
    throw new Error(`School ${params.schoolId} not found`);
  }

  const classRows = await db
    .select({
      id: classes.id,
      title: classes.title,
      locationId: classes.locationId,
      sessionId: classes.sessionId,
      endDate: classes.endDate,
      status: classes.status,
    })
    .from(classes)
    .where(eq(classes.schoolId, params.schoolId));

  const allowedLocations =
    params.locationIds == null ? null : new Set(params.locationIds);

  let currentClasses = classRows.filter((cls) => {
    if (cls.status === "cancelled" || cls.status === "completed") return false;
    if (!isClassStillCurrent(cls.endDate)) return false;
    if (params.classId != null && cls.id !== params.classId) return false;
    if (allowedLocations && cls.locationId != null && !allowedLocations.has(cls.locationId)) {
      return false;
    }
    return true;
  });

  const locationIdList = [
    ...new Set(
      currentClasses
        .map((cls) => cls.locationId)
        .filter((id): id is number => id != null),
    ),
  ];
  const locationById = new Map<number, string>();
  if (locationIdList.length > 0) {
    const locationRows = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, locationIdList));
    for (const loc of locationRows) {
      locationById.set(loc.id, loc.name);
    }
  }

  const classMeta: EmergencyContactClassMeta[] = currentClasses.map((cls) => ({
    id: cls.id,
    title: cls.title,
    locationId: cls.locationId ?? null,
    locationName: cls.locationId != null ? locationById.get(cls.locationId) ?? null : null,
    sessionId: cls.sessionId ?? null,
  }));

  const classIds = classMeta.map((cls) => cls.id);
  if (classIds.length === 0) {
    return groupEmergencyContactLists({
      school: { id: school.id, name: school.name },
      classes: [],
      seats: [],
    });
  }

  const enrollmentRows = await db
    .select({
      childId: programEnrollments.childId,
      classId: programEnrollments.classId,
      marketplaceClassId: programEnrollments.marketplaceClassId,
      status: programEnrollments.status,
    })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, params.schoolId),
        inArray(programEnrollments.status, ACTIVE_STATUSES),
        or(
          inArray(programEnrollments.marketplaceClassId, classIds),
          inArray(programEnrollments.classId, classIds),
        ),
      ),
    );

  const classIdSet = new Set(classIds);
  const seatsRaw: Array<{ classId: number; childId: number }> = [];
  for (const row of enrollmentRows) {
    const resolvedClassId = row.marketplaceClassId ?? row.classId;
    if (resolvedClassId == null || !classIdSet.has(resolvedClassId)) continue;
    seatsRaw.push({ classId: resolvedClassId, childId: row.childId });
  }

  const childIds = [...new Set(seatsRaw.map((s) => s.childId))];
  const childById = new Map<number, typeof children.$inferSelect>();
  if (childIds.length > 0) {
    const childRows = await db.select().from(children).where(inArray(children.id, childIds));
    for (const child of childRows) {
      childById.set(child.id, child);
    }
  }

  const parentIds = [
    ...new Set(
      [...childById.values()]
        .map((child) => child.parentId)
        .filter((id): id is number => Number.isFinite(id)),
    ),
  ];
  const parentById = new Map<number, typeof users.$inferSelect>();
  if (parentIds.length > 0) {
    const parentRows = await db.select().from(users).where(inArray(users.id, parentIds));
    for (const parent of parentRows) {
      parentById.set(parent.id, parent);
    }
  }

  const extrasByParent = new Map<number, ExtraEmergencyContact[]>();
  if (parentIds.length > 0) {
    const extraRows = await db
      .select()
      .from(emergencyContacts)
      .where(inArray(emergencyContacts.userId, parentIds));
    for (const extra of extraRows) {
      const list = extrasByParent.get(extra.userId) ?? [];
      list.push({
        id: extra.id,
        firstName: extra.firstName,
        lastName: extra.lastName,
        phoneNumber: extra.phoneNumber,
        relationship: extra.relationship,
        email: extra.email,
        isAuthorizedPickup: extra.isAuthorizedPickup,
      });
      extrasByParent.set(extra.userId, list);
    }
  }

  const childLocationIds = [
    ...new Set(
      [...childById.values()]
        .map((child) => child.locationId)
        .filter((id): id is number => id != null && !locationById.has(id)),
    ),
  ];
  if (childLocationIds.length > 0) {
    const extraLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, childLocationIds));
    for (const loc of extraLocations) {
      locationById.set(loc.id, loc.name);
    }
  }

  const seats: EmergencyContactSeatInput[] = [];
  for (const seat of seatsRaw) {
    const child = childById.get(seat.childId);
    if (!child) continue;
    const parent = child.parentId ? parentById.get(child.parentId) ?? null : null;
    const resolved = resolveEmergencyContact({
      parentUser: parent,
      extraContacts: child.parentId ? extrasByParent.get(child.parentId) ?? [] : [],
      childLegacyContact: child.emergencyContact,
    });
    const classMetaRow = classMeta.find((c) => c.id === seat.classId);
    const locationName =
      classMetaRow?.locationName ??
      (child.locationId != null ? locationById.get(child.locationId) ?? null : null);
    seats.push({
      classId: seat.classId,
      childId: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      gradeLevel: child.gradeLevel ?? null,
      allergies: child.allergies ?? null,
      locationName,
      resolved,
    });
  }

  return groupEmergencyContactLists({
    school: { id: school.id, name: school.name },
    classes: classMeta,
    seats,
  });
}
