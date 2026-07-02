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

export type StoreProductFulfillmentMethod = "pickup" | "shipping";

export type StoreShippingAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

export type StoreProductDelivery = {
  method: StoreProductFulfillmentMethod;
  shippingAddress?: StoreShippingAddress;
};

export function emptyShippingAddress(): StoreShippingAddress {
  return { line1: "", line2: "", city: "", state: "", postalCode: "" };
}

export function emptyProductDelivery(): StoreProductDelivery {
  return { method: "pickup" };
}

export function isShippingAddressComplete(address: StoreShippingAddress | undefined): boolean {
  if (!address) return false;
  return (
    address.line1.trim().length > 0 &&
    address.city.trim().length > 0 &&
    address.state.trim().length >= 2 &&
    address.postalCode.trim().length >= 5
  );
}

export function isProductDeliveryComplete(delivery: StoreProductDelivery): boolean {
  if (delivery.method === "pickup") return true;
  return isShippingAddressComplete(delivery.shippingAddress);
}

export function formatShippingAddressOneLine(address: StoreShippingAddress): string {
  const parts = [
    address.line1.trim(),
    address.line2.trim() || null,
    `${address.city.trim()}, ${address.state.trim()} ${address.postalCode.trim()}`,
  ].filter(Boolean);
  return parts.join(", ");
}

export function productDeliverySummary(delivery: StoreProductDelivery): string {
  if (delivery.method === "pickup") return "Pick up at campus";
  if (!delivery.shippingAddress) return "Shipping";
  return `Ship to: ${formatShippingAddressOneLine(delivery.shippingAddress)}`;
}

export type StoreCheckoutStepKey = "cart" | "contact" | "delivery" | "children" | "payment";

export function buildStoreCheckoutSteps(options: {
  hasProducts: boolean;
  hasPrograms: boolean;
}): StoreCheckoutStepKey[] {
  const steps: StoreCheckoutStepKey[] = ["cart", "contact"];
  if (options.hasProducts) steps.push("delivery");
  if (options.hasPrograms) steps.push("children");
  steps.push("payment");
  return steps;
}

export const STORE_CHECKOUT_STEP_LABELS: Record<StoreCheckoutStepKey, string> = {
  cart: "Cart",
  contact: "Contact",
  delivery: "Delivery",
  children: "Children",
  payment: "Payment",
};
