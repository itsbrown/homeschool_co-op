import {
  resolveEducatorStudentSafety,
  type EducatorStudentSafety,
} from "@shared/educator-student-safety";

type SafetyChild = {
  id: number;
  parentId: number;
  allergies?: string | null;
  medicalInfo?: string | null;
  specialNeeds?: string | null;
  emergencyContact?: string | null;
};

type SafetyStorage = {
  getUser: (id: number) => Promise<{
    phone?: string | null;
    emergencyContactFirstName?: string | null;
    emergencyContactLastName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
  } | undefined>;
  getEmergencyContactsByUserId: (userId: number) => Promise<
    Array<{ firstName: string; lastName: string; phoneNumber: string; relationship: string }>
  >;
};

export async function loadEducatorStudentSafetyByChildId(
  storage: SafetyStorage,
  children: Array<SafetyChild | null | undefined>,
): Promise<Map<number, EducatorStudentSafety>> {
  const present = children.filter((child): child is SafetyChild => Boolean(child?.id));
  const parentIds = [...new Set(present.map((child) => child.parentId).filter(Boolean))];

  const parents = await Promise.all(parentIds.map((id) => storage.getUser(id)));
  const parentById = new Map(parentIds.map((id, index) => [id, parents[index] ?? null]));

  const contactsLists = await Promise.all(
    parentIds.map((id) => storage.getEmergencyContactsByUserId(id)),
  );
  const contactsByParentId = new Map(parentIds.map((id, index) => [id, contactsLists[index] ?? []]));

  const byChildId = new Map<number, EducatorStudentSafety>();
  for (const child of present) {
    byChildId.set(
      child.id,
      resolveEducatorStudentSafety({
        child,
        parent: parentById.get(child.parentId) ?? null,
        emergencyContacts: contactsByParentId.get(child.parentId) ?? [],
      }),
    );
  }
  return byChildId;
}
