import { storage } from "../storage";
import {
  classroomAllergyReminderCopy,
  extractSevereAllergens,
  newlyIntroducedAllergens,
  type ClassroomAllergen,
} from "@shared/class-allergy-alerts";
import { enrollmentLinksToClass } from "@shared/current-class-enrollment";

const ACTIVE_CLASS_STATUSES = new Set(["enrolled", "pending_admin_approval"]);

export const CLASS_ALLERGY_CAMPAIGN = "class_allergy_alert";

export type ClassAllergyAlert = {
  classId: number;
  className: string;
  allergens: ClassroomAllergen[];
};

function enrollmentClassId(enrollment: {
  marketplaceClassId?: number | null;
  classId?: number | null;
}): number | null {
  const marketplace = Number(enrollment.marketplaceClassId);
  if (Number.isFinite(marketplace) && marketplace > 0) return marketplace;
  const classId = Number(enrollment.classId);
  if (Number.isFinite(classId) && classId > 0) return classId;
  return null;
}

function isActiveClassEnrollment(enrollment: {
  status?: string | null;
  marketplaceClassId?: number | null;
  classId?: number | null;
}): boolean {
  const status = String(enrollment.status ?? "").toLowerCase();
  if (!ACTIVE_CLASS_STATUSES.has(status)) return false;
  return enrollmentLinksToClass(enrollment);
}

async function uniqueParentIdsForClass(
  classId: number,
  enrollments: Array<{ childId?: number | null; parentId?: number | null }>,
): Promise<number[]> {
  const ids = new Set<number>();
  for (const enrollment of enrollments) {
    const parentId = Number(enrollment.parentId);
    if (Number.isFinite(parentId) && parentId > 0) {
      ids.add(parentId);
      continue;
    }
    const childId = Number(enrollment.childId);
    if (!Number.isFinite(childId) || childId <= 0) continue;
    const child = await storage.getChildById(childId);
    const fromChild = Number(child?.parentId);
    if (Number.isFinite(fromChild) && fromChild > 0) ids.add(fromChild);
  }
  return [...ids];
}

export async function listActiveClassEnrollments(classId: number) {
  const enrollments = await storage.getEnrollmentsByClassId(classId);
  return enrollments.filter((enrollment) => isActiveClassEnrollment(enrollment));
}

export async function allergensFromOtherChildren(
  classId: number,
  excludeChildId?: number | null,
): Promise<ClassroomAllergen[]> {
  const enrollments = await listActiveClassEnrollments(classId);
  const byKey = new Map<string, ClassroomAllergen>();
  for (const enrollment of enrollments) {
    const childId = Number(enrollment.childId);
    if (!Number.isFinite(childId) || childId <= 0) continue;
    if (excludeChildId != null && childId === excludeChildId) continue;
    const child = await storage.getChildById(childId);
    for (const allergen of extractSevereAllergens(child?.allergies)) {
      byKey.set(allergen.key, allergen);
    }
  }
  return [...byKey.values()];
}

export async function severeAllergensForClass(classId: number): Promise<ClassroomAllergen[]> {
  return allergensFromOtherChildren(classId, null);
}

export async function listClassAllergyAlertsForParent(parentId: number): Promise<ClassAllergyAlert[]> {
  const enrollments = await storage.getProgramEnrollmentsByParent(parentId);
  const classIds = new Set<number>();
  for (const enrollment of enrollments) {
    if (!isActiveClassEnrollment(enrollment)) continue;
    const classId = enrollmentClassId(enrollment);
    if (classId) classIds.add(classId);
  }

  const alerts: ClassAllergyAlert[] = [];
  for (const classId of classIds) {
    const allergens = await severeAllergensForClass(classId);
    if (allergens.length === 0) continue;
    const classItem = await storage.getClassById(classId);
    const className =
      String(classItem?.title || "").trim() ||
      enrollments.find((row) => enrollmentClassId(row) === classId)?.className ||
      "Class";
    alerts.push({ classId, className, allergens });
  }

  return alerts.sort((a, b) => a.className.localeCompare(b.className));
}

async function resolveSenderId(schoolId: number | null, fallbackUserId: number): Promise<number> {
  if (schoolId) {
    try {
      const school = await storage.getSchool(schoolId);
      const adminId = Number(school?.adminId);
      if (Number.isFinite(adminId) && adminId > 0) return adminId;
    } catch {
      // fall through
    }
  }
  return fallbackUserId > 0 ? fallbackUserId : 1;
}

export async function notifyClassParentsOfNewAllergens(options: {
  classId: number;
  allergens: ClassroomAllergen[];
  schoolId?: number | null;
}): Promise<{ notified: number; skipped: boolean }> {
  const allergens = options.allergens.filter((item) => item.key);
  if (allergens.length === 0) return { notified: 0, skipped: true };

  const enrollments = await listActiveClassEnrollments(options.classId);
  const recipientIds = await uniqueParentIdsForClass(options.classId, enrollments);
  if (recipientIds.length === 0) return { notified: 0, skipped: true };

  const classItem = await storage.getClassById(options.classId);
  const className = String(classItem?.title || "this class").trim() || "this class";
  const schoolId = options.schoolId ?? classItem?.schoolId ?? enrollments[0]?.schoolId ?? null;
  const copy = classroomAllergyReminderCopy(className, allergens);
  const senderId = await resolveSenderId(schoolId ?? null, recipientIds[0]);

  const notification = await storage.createNotification({
    senderId,
    schoolId: schoolId ?? null,
    type: "both",
    priority: "high",
    subject: copy.subject,
    content: copy.content,
    targetType: "individual",
    targetData: {
      userIds: recipientIds,
      campaign: CLASS_ALLERGY_CAMPAIGN,
      classId: options.classId,
      allergens: allergens.map((item) => item.key),
    },
    scheduledFor: null,
    status: "sent",
  } as any);

  const deliveredAt = new Date();
  for (const recipientId of recipientIds) {
    await storage.createNotificationRecipient({
      notificationId: notification.id,
      recipientId,
      deliveryType: "in_app",
      status: "delivered",
      deliveredAt,
    } as any);
    await storage.createNotificationRecipient({
      notificationId: notification.id,
      recipientId,
      deliveryType: "email",
      status: "pending",
    } as any);
  }

  try {
    const { sendNotificationEmails } = await import("../api/notifications");
    await sendNotificationEmails(notification, recipientIds);
  } catch (error) {
    console.warn("[class-allergy-alerts] email delivery failed (in-app still sent):", error);
  }

  return { notified: recipientIds.length, skipped: false };
}

/**
 * After a child's allergy text changes, notify classmates only for allergens
 * this child newly introduced to each active class.
 */
export async function notifyClassesAfterAllergyChange(options: {
  childId: number;
  previousAllergies: unknown;
  nextAllergies: unknown;
}): Promise<void> {
  const added = newlyIntroducedAllergens(
    extractSevereAllergens(options.nextAllergies),
    extractSevereAllergens(options.previousAllergies),
  );
  if (added.length === 0) return;

  const enrollments = await storage.getEnrollmentsByChildId(options.childId);
  for (const enrollment of enrollments) {
    if (!isActiveClassEnrollment(enrollment)) continue;
    const classId = enrollmentClassId(enrollment);
    if (!classId) continue;
    const others = await allergensFromOtherChildren(classId, options.childId);
    const introduced = newlyIntroducedAllergens(added, others);
    if (introduced.length === 0) continue;
    await notifyClassParentsOfNewAllergens({
      classId,
      allergens: introduced,
      schoolId: enrollment.schoolId ?? null,
    });
  }
}

/**
 * After a child is seated in a class, notify if they bring a new restriction
 * that was not already on the roster.
 */
export async function notifyClassAfterChildSeated(options: {
  childId: number;
  classId?: number | null;
}): Promise<void> {
  const classId = options.classId != null ? Number(options.classId) : NaN;
  if (!Number.isFinite(classId) || classId <= 0) return;

  const child = await storage.getChildById(options.childId);
  const candidate = extractSevereAllergens(child?.allergies);
  if (candidate.length === 0) return;

  const others = await allergensFromOtherChildren(classId, options.childId);
  const introduced = newlyIntroducedAllergens(candidate, others);
  if (introduced.length === 0) return;

  await notifyClassParentsOfNewAllergens({
    classId,
    allergens: introduced,
    schoolId: child?.schoolId ?? null,
  });
}

export function fireAndForgetClassAllergyNotify(task: Promise<unknown>, label: string): void {
  void task.catch((error) => {
    console.warn(`[class-allergy-alerts] ${label}:`, error);
  });
}
