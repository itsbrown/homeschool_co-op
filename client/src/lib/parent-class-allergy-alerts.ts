import type { ClassroomAllergen } from "@shared/class-allergy-alerts";

export type ParentClassAllergyAlert = {
  classId: number;
  className: string;
  allergens: ClassroomAllergen[];
  children?: Array<{ firstName: string }>;
};

export type ParentClassAllergyAlertsResponse = {
  alerts: ParentClassAllergyAlert[];
};

export const PARENT_CLASS_ALLERGY_ALERTS_QUERY_KEY = [
  "/api/parent/class-allergy-alerts",
] as const;

export const CLASS_ALLERGY_DISMISS_STORAGE_KEY = "asa-class-allergy-dismissed-signature";

export function allergyAlertsFromClass(cls?: {
  id?: number;
  title?: string;
  hasSevereAllergy?: boolean;
  severeAllergens?: ClassroomAllergen[];
}): ParentClassAllergyAlert[] {
  if (!cls?.id || !cls.hasSevereAllergy || !cls.severeAllergens?.length) return [];
  return [
    {
      classId: cls.id,
      className: cls.title?.trim() || "this class",
      allergens: cls.severeAllergens,
    },
  ];
}

export function isHouseholdAllergyDismissed(
  signature: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): boolean {
  if (!signature || !storage) return false;
  try {
    return storage.getItem(CLASS_ALLERGY_DISMISS_STORAGE_KEY) === signature;
  } catch {
    return false;
  }
}

export function dismissHouseholdAllergy(
  signature: string,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (!signature || !storage) return;
  try {
    storage.setItem(CLASS_ALLERGY_DISMISS_STORAGE_KEY, signature);
  } catch {
    // Private mode or quota — keep the card visible.
  }
}
