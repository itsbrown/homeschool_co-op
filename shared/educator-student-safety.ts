/** Mentors need allergy / medical / emergency on the day-of roster — not a separate hunt. */

export type EducatorStudentSafetyInput = {
  allergies?: string | null;
  medicalInfo?: string | null;
  specialNeeds?: string | null;
  emergencyContact?: string | null;
};

export type EducatorParentSafetyInput = {
  phone?: string | null;
  emergencyContactFirstName?: string | null;
  emergencyContactLastName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
};

export type EducatorEmergencyContactInput = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  relationship: string;
};

export type EducatorStudentSafety = {
  allergies: string | null;
  medicalInfo: string | null;
  specialNeeds: string | null;
  hasAllergyAlert: boolean;
  hasMedicalAlert: boolean;
  hasSpecialNeedsAlert: boolean;
  parentPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
};

const EMPTY_NOTE = /^(none|n\/a|na|no|none known|none listed|unknown)$/i;

export function isSafetyAlertText(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  return !EMPTY_NOTE.test(trimmed);
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveEducatorStudentSafety(input: {
  child: EducatorStudentSafetyInput;
  parent?: EducatorParentSafetyInput | null;
  emergencyContacts?: EducatorEmergencyContactInput[] | null;
}): EducatorStudentSafety {
  const allergies = emptyToNull(input.child.allergies);
  const medicalInfo = emptyToNull(input.child.medicalInfo);
  const specialNeeds = emptyToNull(input.child.specialNeeds);

  const parentName = [input.parent?.emergencyContactFirstName, input.parent?.emergencyContactLastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  let emergencyContactName = emptyToNull(parentName);
  let emergencyContactPhone = emptyToNull(input.parent?.emergencyContactPhone);
  let emergencyContactRelationship = emptyToNull(input.parent?.emergencyContactRelationship);

  const firstTableContact = input.emergencyContacts?.[0];
  if (!emergencyContactName && firstTableContact) {
    emergencyContactName = emptyToNull(`${firstTableContact.firstName} ${firstTableContact.lastName}`);
    emergencyContactPhone = emptyToNull(firstTableContact.phoneNumber);
    emergencyContactRelationship = emptyToNull(firstTableContact.relationship);
  }

  if (!emergencyContactName) {
    emergencyContactName = emptyToNull(input.child.emergencyContact);
  }

  return {
    allergies,
    medicalInfo,
    specialNeeds,
    hasAllergyAlert: isSafetyAlertText(allergies),
    hasMedicalAlert: isSafetyAlertText(medicalInfo),
    hasSpecialNeedsAlert: isSafetyAlertText(specialNeeds),
    parentPhone: emptyToNull(input.parent?.phone),
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
  };
}
