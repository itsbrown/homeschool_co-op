import type { Child, InsertChild, User } from '@shared/schema';
import {
  parseSignupChildren,
  registrationSignupChildSchema,
  registrationSignupChildrenSchema,
  type RegistrationSignupChildInput,
} from '@shared/auth-register';
import type { IStorage } from '../storage';
import { sendNewStudentNotificationEmail } from './email-service';

export {
  parseSignupChildren,
  registrationSignupChildSchema,
  registrationSignupChildrenSchema,
  type RegistrationSignupChildInput,
};

/** Narrow storage surface for child signup (avoids CombinedStorage vs full IStorage mismatch). */
export type ParentChildRegistrationStorage = Pick<
  IStorage,
  | 'getSchool'
  | 'getLocationsBySchoolId'
  | 'createChild'
  | 'createSchoolStudent'
  | 'getAllUsers'
  | 'getSchoolStudentByChildAndSchool'
  | 'getSchoolStudentByChildId'
  | 'deleteSchoolStudent'
  | 'deleteChild'
>;

/**
 * Validates parent school + picks child campus: parent's selected location when it
 * belongs to the school; otherwise first school location (legacy fallback).
 */
export async function resolveSchoolAndChildLocation(
  storage: ParentChildRegistrationStorage,
  parentSchoolId: number | null,
  preferredLocationId: number | null
): Promise<{ validSchoolId: number | null; locationId: number | null }> {
  if (!parentSchoolId) {
    return { validSchoolId: null, locationId: null };
  }
  try {
    const school = await storage.getSchool(parentSchoolId);
    if (!school) {
      return { validSchoolId: null, locationId: null };
    }
    const validSchoolId = parentSchoolId;
    const locations = await storage.getLocationsBySchoolId(validSchoolId);
    if (!locations || locations.length === 0) {
      return { validSchoolId, locationId: null };
    }
    const preferred =
      preferredLocationId != null &&
      preferredLocationId > 0 &&
      locations.some((l) => l.id === preferredLocationId)
        ? preferredLocationId
        : null;
    const locationId = preferred ?? locations[0].id;
    return { validSchoolId, locationId };
  } catch {
    return { validSchoolId: null, locationId: null };
  }
}

export type ParentChildCreationFields = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  gender?: string | null;
  interests?: string[] | null;
  learningStyle?: string | null;
  specialNeeds?: string | null;
  allergies?: string | null;
  medicalInfo?: string | null;
  school?: string | null;
  profileImage?: string | null;
  emergencyContact?: string | null;
  additionalLanguages?: string | null;
  notes?: string | null;
};

/**
 * Shared path for authenticated `POST /api/parent/children` and signup-time child rows.
 */
export async function createChildLinkedToParent(
  storage: ParentChildRegistrationStorage,
  opts: {
    parent: User;
    parentEmail: string;
    preferredLocationId: number | null;
    fields: ParentChildCreationFields;
    /** When true, email school admins (same as parent API). */
    sendAdminNotifications: boolean;
    /** For notification template */
    parentPhoneOverride?: string | null;
  }
): Promise<Child> {
  const {
    firstName,
    lastName,
    birthdate,
    gradeLevel,
    gender,
    interests,
    learningStyle,
    specialNeeds,
    allergies,
    medicalInfo,
    school,
    profileImage,
    emergencyContact,
    additionalLanguages,
    notes,
  } = opts.fields;

  const { validSchoolId, locationId: parentLocationId } = await resolveSchoolAndChildLocation(
    storage,
    opts.parent.schoolId ?? null,
    opts.preferredLocationId
  );

  const newChild = {
    firstName,
    lastName,
    birthdate,
    gradeLevel,
    gender: gender && String(gender).trim() ? gender : null,
    interests: interests ?? null,
    learningStyle: learningStyle ?? null,
    specialNeeds: specialNeeds ?? null,
    allergies: allergies ?? null,
    medicalInfo: medicalInfo ?? null,
    school: school ?? null,
    schoolId: validSchoolId,
    locationId: parentLocationId,
    profileImage: profileImage ?? null,
    emergencyContact: emergencyContact ?? null,
    additionalLanguages: additionalLanguages ?? null,
    notes: notes ?? null,
    parentId: opts.parent.id,
    parentEmail: opts.parentEmail,
  };

  const savedChild = await storage.createChild(newChild as InsertChild & { parentId: number });

  if (savedChild.schoolId && validSchoolId) {
    try {
      await storage.createSchoolStudent({
        schoolId: validSchoolId,
        childId: savedChild.id,
        grade: gradeLevel,
        status: 'active',
        locationId: parentLocationId || null,
        studentId: null,
        notes: null,
      });
    } catch (schoolStudentError) {
      console.error('⚠️ Failed to create school_student record:', schoolStudentError);
    }
  }

  if (opts.sendAdminNotifications && validSchoolId) {
    try {
      const allUsers = await storage.getAllUsers();
      const schoolAdmins = allUsers.filter(
        (user) =>
          user.schoolId === validSchoolId &&
          (user.role === 'schoolAdmin' || user.role === 'superAdmin')
      );
      const school = await storage.getSchool(validSchoolId);
      const schoolName = school?.name || 'Your School';

      if (schoolAdmins.length > 0) {
        for (const admin of schoolAdmins) {
          try {
            await sendNewStudentNotificationEmail({
              adminEmail: admin.email,
              adminName:
                admin.name ||
                [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim() ||
                admin.email,
              schoolName,
              studentFirstName: firstName,
              studentLastName: lastName,
              studentGradeLevel: gradeLevel,
              parentEmail: opts.parentEmail,
              parentPhone: opts.parentPhoneOverride ?? opts.parent.phone ?? undefined,
              registrationDate: new Date(),
            });
          } catch (notificationError) {
            console.error(`❌ Failed to notify admin ${admin.email}:`, notificationError);
          }
        }
      }
    } catch (notificationError) {
      console.error('⚠️ Error during admin notification process:', notificationError);
    }
  }

  return savedChild;
}

/** Best-effort cleanup when signup creates children then fails (FK-safe order). */
export async function deleteChildAndSchoolLink(
  storage: ParentChildRegistrationStorage,
  childId: number,
  schoolId: number | null
): Promise<void> {
  try {
    if (schoolId != null) {
      let row = await storage.getSchoolStudentByChildAndSchool(childId, schoolId);
      while (row) {
        await storage.deleteSchoolStudent(row.id);
        row = await storage.getSchoolStudentByChildAndSchool(childId, schoolId);
      }
    } else {
      const row = await storage.getSchoolStudentByChildId(childId);
      if (row) {
        await storage.deleteSchoolStudent(row.id);
      }
    }
  } catch (e) {
    console.error('⚠️ deleteChildAndSchoolLink school_students:', e);
  }
  try {
    await storage.deleteChild(childId);
  } catch (e) {
    console.error('⚠️ deleteChildAndSchoolLink child:', e);
  }
}
