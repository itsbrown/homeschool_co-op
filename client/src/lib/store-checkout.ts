export const STORE_CHECKOUT_GRADE_LEVELS = [
  "Littles",
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
] as const;

export type StoreChildDraft = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
};

export type StoreEmergencyContact = {
  firstName: string;
  lastName: string;
  phone: string;
  relationship: string;
};

export type StoreParentContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type StoreChildAssignment = {
  childId?: number;
  draft?: StoreChildDraft;
};

export function emptyChildDraft(): StoreChildDraft {
  return { firstName: "", lastName: "", birthdate: "", gradeLevel: "" };
}

export function isChildDraftComplete(draft: StoreChildDraft | undefined): boolean {
  if (!draft) return false;
  return (
    draft.firstName.trim().length > 0 &&
    draft.lastName.trim().length > 0 &&
    draft.birthdate.trim().length > 0 &&
    draft.gradeLevel.trim().length > 0
  );
}

export function isEmergencyContactComplete(contact: StoreEmergencyContact): boolean {
  return (
    contact.firstName.trim().length > 0 &&
    contact.lastName.trim().length > 0 &&
    contact.phone.trim().length >= 10 &&
    contact.relationship.trim().length > 0
  );
}

export function isParentContactComplete(parent: StoreParentContact): boolean {
  return (
    parent.firstName.trim().length > 0 &&
    parent.lastName.trim().length > 0 &&
    parent.email.trim().length > 0 &&
    parent.phone.trim().length >= 10
  );
}

export function formatStoreOrderNumber(orderId: number, createdAt: string | Date): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}-${String(orderId).padStart(5, "0")}`;
}

export function formatStoreMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
