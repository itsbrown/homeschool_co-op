import type { ClassroomAllergen } from "@shared/class-allergy-alerts";

export type ParentClassAllergyAlert = {
  classId: number;
  className: string;
  allergens: ClassroomAllergen[];
};

export type ParentClassAllergyAlertsResponse = {
  alerts: ParentClassAllergyAlert[];
};

export const PARENT_CLASS_ALLERGY_ALERTS_QUERY_KEY = [
  "/api/parent/class-allergy-alerts",
] as const;
