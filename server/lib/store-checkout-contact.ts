import { storage } from "../storage";

/**
 * Display order number for public store confirmations.
 */
export function formatStoreOrderNumber(orderId: number, createdAt: string | Date): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}-${String(orderId).padStart(5, "0")}`;
}

export async function persistStoreEmergencyContact(
  parentId: number,
  parentEmail: string,
  emergency: {
    firstName: string;
    lastName: string;
    phone: string;
    relationship: string;
  },
): Promise<void> {
  await storage.updateUser(parentId, {
    emergencyContactFirstName: emergency.firstName,
    emergencyContactLastName: emergency.lastName,
    emergencyContactPhone: emergency.phone,
    emergencyContactRelationship: emergency.relationship,
  });

  const existing = await storage.getEmergencyContactsByUserId(parentId);
  if (existing.length === 0) {
    await storage.createEmergencyContact({
      userId: parentId,
      firstName: emergency.firstName,
      lastName: emergency.lastName,
      relationship: emergency.relationship,
      phoneNumber: emergency.phone,
      email: parentEmail,
      isAuthorizedPickup: true,
    });
  }
}
