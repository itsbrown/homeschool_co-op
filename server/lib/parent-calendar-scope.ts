import { storage } from "../storage";

export type ParentCalendarScope = {
  schoolIds: number[];
  campusIds: number[];
};

export async function resolveParentCalendarScope(userId: number): Promise<ParentCalendarScope> {
  const schoolIds = new Set<number>();
  const campusIds = new Set<number>();

  const user = await storage.getUser(userId);
  if (user?.schoolId) schoolIds.add(user.schoolId);
  if (user?.locationId) campusIds.add(user.locationId);

  const children = await storage.getChildrenByParentId(userId);
  for (const child of children) {
    if ((child as { schoolId?: number | null }).schoolId) {
      schoolIds.add((child as { schoolId: number }).schoolId);
    }
    try {
      const affiliation = await storage.getSchoolStudentByChildId(child.id);
      if (affiliation && (!affiliation.status || affiliation.status === "active")) {
        schoolIds.add(affiliation.schoolId);
        if (affiliation.locationId) campusIds.add(affiliation.locationId);
      }
    } catch {
      // affiliations optional for parents without school_students rows
    }
  }

  return {
    schoolIds: [...schoolIds],
    campusIds: [...campusIds],
  };
}
