/**
 * Emergency contact resolution + printable/CSV list helpers.
 *
 * Priority (same as educator roster): parent user fields → emergency_contacts
 * row → children.emergencyContact legacy text.
 */

export const ACTIVE_EMERGENCY_ROSTER_STATUSES = [
  "enrolled",
  "pending_admin_approval",
] as const;

export type EmergencyContactSource =
  | "user"
  | "emergency_contacts"
  | "child_legacy"
  | null;

export type ParentEmergencyFields = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyContactFirstName?: string | null;
  emergencyContactLastName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
};

export type ExtraEmergencyContact = {
  id?: number;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  relationship?: string | null;
  email?: string | null;
  isAuthorizedPickup?: boolean | null;
};

export type ResolvedEmergencyContact = {
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactEmail: string | null;
  source: EmergencyContactSource;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
};

export type EmergencyContactClassRef = {
  id: number;
  title: string;
};

export type EmergencyContactListRow = {
  childId: number;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  allergies: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactEmail: string | null;
  source: EmergencyContactSource;
  locationName: string | null;
  classes: EmergencyContactClassRef[];
};

export type EmergencyContactClassList = {
  classId: number;
  title: string;
  locationId: number | null;
  locationName: string | null;
  sessionId: number | null;
  studentCount: number;
  missingContactCount: number;
  students: EmergencyContactListRow[];
};

export type EmergencyContactListsPayload = {
  generatedAt: string;
  school: { id: number; name: string };
  schoolList: EmergencyContactListRow[];
  classes: EmergencyContactClassList[];
  totals: {
    students: number;
    classes: number;
    missingContacts: number;
  };
};

export function joinPersonName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
): string | null {
  const joined = [firstName, lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
  if (joined) return joined;
  const extra = typeof fallback === "string" ? fallback.trim() : "";
  return extra || null;
}

export function hasEmergencyPhone(resolved: {
  emergencyContactPhone?: string | null;
}): boolean {
  return Boolean(resolved.emergencyContactPhone?.trim());
}

function pickExtraContact(
  extras: ExtraEmergencyContact[] | null | undefined,
): ExtraEmergencyContact | null {
  if (!extras || extras.length === 0) return null;
  return [...extras].sort((a, b) => {
    if (a.isAuthorizedPickup && !b.isAuthorizedPickup) return -1;
    if (!a.isAuthorizedPickup && b.isAuthorizedPickup) return 1;
    return (a.id ?? 0) - (b.id ?? 0);
  })[0];
}

export function resolveEmergencyContact(input: {
  parentUser?: ParentEmergencyFields | null;
  extraContacts?: ExtraEmergencyContact[] | null;
  childLegacyContact?: string | null;
}): ResolvedEmergencyContact {
  const parent = input.parentUser ?? null;
  const parentName = joinPersonName(parent?.firstName, parent?.lastName, parent?.name);
  const parentPhone = parent?.phone?.trim() || null;
  const parentEmail = parent?.email?.trim() || null;

  const userName = joinPersonName(
    parent?.emergencyContactFirstName,
    parent?.emergencyContactLastName,
  );
  if (userName) {
    return {
      emergencyContactName: userName,
      emergencyContactPhone: parent?.emergencyContactPhone?.trim() || null,
      emergencyContactRelationship: parent?.emergencyContactRelationship?.trim() || null,
      emergencyContactEmail: null,
      source: "user",
      parentName,
      parentPhone,
      parentEmail,
    };
  }

  const extra = pickExtraContact(input.extraContacts);
  if (extra) {
    const extraName = joinPersonName(extra.firstName, extra.lastName);
    if (extraName || extra.phoneNumber?.trim()) {
      return {
        emergencyContactName: extraName,
        emergencyContactPhone: extra.phoneNumber?.trim() || null,
        emergencyContactRelationship: extra.relationship?.trim() || null,
        emergencyContactEmail: extra.email?.trim() || null,
        source: "emergency_contacts",
        parentName,
        parentPhone,
        parentEmail,
      };
    }
  }

  const legacy = input.childLegacyContact?.trim() || null;
  if (legacy) {
    return {
      emergencyContactName: legacy,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      emergencyContactEmail: null,
      source: "child_legacy",
      parentName,
      parentPhone,
      parentEmail,
    };
  }

  return {
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    emergencyContactEmail: null,
    source: null,
    parentName,
    parentPhone,
    parentEmail,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildEmergencyContactCsv(
  rows: EmergencyContactListRow[],
  options?: { includeClassColumn?: boolean },
): string {
  const includeClass = options?.includeClassColumn !== false;
  const headers = [
    "Student",
    "Grade",
    ...(includeClass ? ["Class"] : []),
    "Campus",
    "Parent / Guardian",
    "Parent Phone",
    "Parent Email",
    "Emergency Contact",
    "Emergency Phone",
    "Relationship",
    "Emergency Email",
    "Allergies",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    const cells = [
      joinPersonName(row.firstName, row.lastName) ?? "",
      row.gradeLevel ?? "",
      ...(includeClass ? [row.classes.map((c) => c.title).join("; ")] : []),
      row.locationName ?? "",
      row.parentName ?? "",
      row.parentPhone ?? "",
      row.parentEmail ?? "",
      row.emergencyContactName ?? "",
      row.emergencyContactPhone ?? "",
      row.emergencyContactRelationship ?? "",
      row.emergencyContactEmail ?? "",
      row.allergies ?? "",
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function compareStudentsByName(
  a: Pick<EmergencyContactListRow, "lastName" | "firstName">,
  b: Pick<EmergencyContactListRow, "lastName" | "firstName">,
): number {
  return (
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );
}

export type EmergencyContactSeatInput = {
  classId: number;
  childId: number;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  allergies: string | null;
  locationName: string | null;
  resolved: ResolvedEmergencyContact;
};

export type EmergencyContactClassMeta = {
  id: number;
  title: string;
  locationId: number | null;
  locationName: string | null;
  sessionId: number | null;
};

export function groupEmergencyContactLists(input: {
  school: { id: number; name: string };
  generatedAt?: string;
  classes: EmergencyContactClassMeta[];
  seats: EmergencyContactSeatInput[];
}): EmergencyContactListsPayload {
  const classById = new Map(input.classes.map((cls) => [cls.id, cls]));
  const schoolByChild = new Map<number, EmergencyContactListRow>();

  for (const seat of input.seats) {
    const cls = classById.get(seat.classId);
    if (!cls) continue;
    const existing = schoolByChild.get(seat.childId);
    const classRef = { id: cls.id, title: cls.title };
    if (existing) {
      if (!existing.classes.some((c) => c.id === classRef.id)) {
        existing.classes.push(classRef);
        existing.classes.sort((a, b) => a.title.localeCompare(b.title));
      }
      continue;
    }
    schoolByChild.set(seat.childId, {
      childId: seat.childId,
      firstName: seat.firstName,
      lastName: seat.lastName,
      gradeLevel: seat.gradeLevel,
      allergies: seat.allergies,
      parentName: seat.resolved.parentName,
      parentPhone: seat.resolved.parentPhone,
      parentEmail: seat.resolved.parentEmail,
      emergencyContactName: seat.resolved.emergencyContactName,
      emergencyContactPhone: seat.resolved.emergencyContactPhone,
      emergencyContactRelationship: seat.resolved.emergencyContactRelationship,
      emergencyContactEmail: seat.resolved.emergencyContactEmail,
      source: seat.resolved.source,
      locationName: seat.locationName,
      classes: [classRef],
    });
  }

  const schoolList = [...schoolByChild.values()].sort(compareStudentsByName);
  const classes: EmergencyContactClassList[] = input.classes
    .map((cls) => {
      const students = input.seats
        .filter((seat) => seat.classId === cls.id)
        .map((seat) => {
          const schoolRow = schoolByChild.get(seat.childId);
          if (schoolRow) return schoolRow;
          return {
            childId: seat.childId,
            firstName: seat.firstName,
            lastName: seat.lastName,
            gradeLevel: seat.gradeLevel,
            allergies: seat.allergies,
            parentName: seat.resolved.parentName,
            parentPhone: seat.resolved.parentPhone,
            parentEmail: seat.resolved.parentEmail,
            emergencyContactName: seat.resolved.emergencyContactName,
            emergencyContactPhone: seat.resolved.emergencyContactPhone,
            emergencyContactRelationship: seat.resolved.emergencyContactRelationship,
            emergencyContactEmail: seat.resolved.emergencyContactEmail,
            source: seat.resolved.source,
            locationName: seat.locationName,
            classes: [{ id: cls.id, title: cls.title }],
          };
        })
        .sort(compareStudentsByName);
      return {
        classId: cls.id,
        title: cls.title,
        locationId: cls.locationId,
        locationName: cls.locationName,
        sessionId: cls.sessionId,
        studentCount: students.length,
        missingContactCount: students.filter((s) => !hasEmergencyPhone(s)).length,
        students,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    school: input.school,
    schoolList,
    classes,
    totals: {
      students: schoolList.length,
      classes: classes.length,
      missingContacts: schoolList.filter((s) => !hasEmergencyPhone(s)).length,
    },
  };
}
