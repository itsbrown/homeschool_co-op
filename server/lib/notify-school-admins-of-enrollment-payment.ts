import type { Payment } from '@shared/schema';
import { storage } from '../storage';
import { sendPaidEnrollmentAdminNotificationEmail } from './email-service';

export type EnrollmentPaymentLineItem = {
  studentName: string;
  age: number | null;
  gradeLevel: string;
  className: string;
  amountPaidCents: number;
  totalCostCents: number;
};

export type PaidEnrollmentAdminNotifyPayload = {
  schoolId: number;
  /** System/parent user id used as notification sender (schema requires senderId). */
  senderId: number;
  parentName: string;
  parentEmail: string;
  parentPhone?: string | null;
  amountPaidCents: number;
  paymentPlan?: string | null;
  paymentIntentId?: string | null;
  lines: EnrollmentPaymentLineItem[];
  paidAt?: Date;
};

/** Age in whole years from birthdate; null if unparseable. */
export function ageFromBirthdate(birthdate: string | Date | null | undefined): number | null {
  if (!birthdate) return null;
  const birth = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * Cart/enrollment checkout should notify; balance paydowns and scheduled installments should not.
 * Credits-only cart uses a synthetic PI id and has no paymentType — treat as enrollment.
 */
export function shouldNotifyAdminsForEnrollmentPayment(
  paymentType: string | undefined | null,
): boolean {
  const t = (paymentType || '').trim().toLowerCase();
  if (!t) return true;
  if (t === 'balance_payment' || t === 'scheduled_payment') return false;
  return true;
}

function adminDisplayName(admin: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  if (admin.name?.trim()) return admin.name.trim();
  const joined = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim();
  return joined || admin.email;
}

async function resolveSchoolAdminRecipients(
  schoolId: number,
): Promise<Array<{ userId: number; email: string; name: string }>> {
  const byUserId = new Map<number, { userId: number; email: string; name: string }>();

  try {
    const staff = await storage.getSchoolStaffBySchoolId(schoolId);
    for (const s of staff as Array<{
      userId?: number | null;
      role?: string | null;
      email?: string | null;
    }>) {
      const role = (s.role || '').toLowerCase();
      if (role !== 'school_admin' && role !== 'schooladmin') continue;
      if (!s.userId) continue;
      const user = await storage.getUser(s.userId);
      if (!user?.email) continue;
      byUserId.set(user.id, {
        userId: user.id,
        email: user.email,
        name: adminDisplayName(user),
      });
    }
  } catch (err) {
    console.warn('[enrollment-admin-notify] getSchoolStaffBySchoolId failed:', err);
  }

  try {
    const allUsers = await storage.getAllUsers();
    for (const user of allUsers) {
      if (user.schoolId !== schoolId) continue;
      if (user.role !== 'schoolAdmin' && user.role !== 'superAdmin') continue;
      if (!user.email) continue;
      byUserId.set(user.id, {
        userId: user.id,
        email: user.email,
        name: adminDisplayName(user),
      });
    }
  } catch (err) {
    console.warn('[enrollment-admin-notify] getAllUsers failed:', err);
  }

  return [...byUserId.values()];
}

export async function buildEnrollmentPaymentLines(
  enrollmentIds: number[],
): Promise<EnrollmentPaymentLineItem[]> {
  const lines: EnrollmentPaymentLineItem[] = [];
  for (const enrollmentId of enrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) continue;

    const child = enrollment.childId ? await storage.getChildById(enrollment.childId) : null;
    let className = enrollment.className || 'Class';
    const classLookupId = enrollment.marketplaceClassId || enrollment.classId;
    if (classLookupId) {
      try {
        const classRow = await storage.getClassById(classLookupId);
        if (classRow?.title) className = classRow.title;
      } catch {
        /* keep denormalized className */
      }
    }

    lines.push({
      studentName: child
        ? `${child.firstName} ${child.lastName}`.trim()
        : enrollment.childName || 'Student',
      age: ageFromBirthdate(child?.birthdate ?? null),
      gradeLevel: child?.gradeLevel || 'Unknown',
      className,
      amountPaidCents: enrollment.totalPaid ?? 0,
      totalCostCents: enrollment.totalCost ?? 0,
    });
  }
  return lines;
}

/**
 * Email + in-app notify school admins that a parent paid for enrollment(s).
 * Non-blocking: never throws to callers.
 */
export async function notifySchoolAdminsOfEnrollmentPayment(
  payload: PaidEnrollmentAdminNotifyPayload,
): Promise<{ emailed: number; inApp: number }> {
  try {
    if (!payload.lines.length) {
      return { emailed: 0, inApp: 0 };
    }

    const admins = await resolveSchoolAdminRecipients(payload.schoolId);
    if (admins.length === 0) {
      console.warn(
        `[enrollment-admin-notify] No school admins found for school ${payload.schoolId}`,
      );
      return { emailed: 0, inApp: 0 };
    }

    const school = await storage.getSchool(payload.schoolId);
    const schoolName = school?.name || 'Your School';
    const paidAt = payload.paidAt ?? new Date();

    let emailed = 0;
    let inApp = 0;

    const lineSummary = payload.lines
      .map((l) => {
        const agePart = l.age != null ? `, age ${l.age}` : '';
        return `${l.studentName} (${l.gradeLevel}${agePart}) — ${l.className}`;
      })
      .join('; ');

    for (const admin of admins) {
      try {
        const ok = await sendPaidEnrollmentAdminNotificationEmail({
          adminEmail: admin.email,
          adminName: admin.name,
          schoolName,
          parentName: payload.parentName,
          parentEmail: payload.parentEmail,
          parentPhone: payload.parentPhone ?? undefined,
          amountPaidCents: payload.amountPaidCents,
          paymentPlan: payload.paymentPlan ?? undefined,
          paymentIntentId: payload.paymentIntentId ?? undefined,
          lines: payload.lines,
          paidAt,
        });
        if (ok) emailed += 1;
      } catch (err) {
        console.error(
          `[enrollment-admin-notify] email failed for ${admin.email}:`,
          err,
        );
      }

      try {
        const notification = await storage.createNotification({
          senderId: payload.senderId,
          schoolId: payload.schoolId,
          type: 'in_app',
          priority: 'high',
          subject: 'New Paid Enrollment',
          content: `${payload.parentName} (${payload.parentEmail}) paid for: ${lineSummary}.`,
          targetType: 'individual',
          targetData: {
            userId: admin.userId,
            paymentIntentId: payload.paymentIntentId,
          },
          status: 'sent',
          scheduledFor: null,
        } as any);

        await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId: admin.userId,
          deliveryType: 'in_app',
          status: 'pending',
        });
        inApp += 1;
      } catch (err) {
        console.error(
          `[enrollment-admin-notify] in-app failed for user ${admin.userId}:`,
          err,
        );
      }
    }

    console.log(
      `[enrollment-admin-notify] school=${payload.schoolId} emailed=${emailed} inApp=${inApp}`,
    );
    return { emailed, inApp };
  } catch (err) {
    console.error('[enrollment-admin-notify] unexpected failure (non-blocking):', err);
    return { emailed: 0, inApp: 0 };
  }
}

/**
 * Idempotent wrapper: skip if payment metadata already has adminEnrollmentNotifySentAt.
 */
export async function notifySchoolAdminsOfEnrollmentPaymentIdempotent(params: {
  payment: Payment;
  enrollmentIds: number[];
  paymentType?: string | null;
  paymentPlan?: string | null;
  paymentIntentId?: string | null;
  amountPaidCents: number;
}): Promise<boolean> {
  if (!shouldNotifyAdminsForEnrollmentPayment(params.paymentType)) {
    return false;
  }

  const priorMeta = (params.payment.metadata ?? {}) as Record<string, unknown>;
  if (
    typeof priorMeta.adminEnrollmentNotifySentAt === 'string' &&
    priorMeta.adminEnrollmentNotifySentAt.length > 0
  ) {
    return false;
  }

  const parentEmail =
    (params.payment.parentEmail || '').trim() ||
    (await storage.getUser(params.payment.parentId ?? 0))?.email ||
    '';
  if (!parentEmail) {
    console.warn('[enrollment-admin-notify] missing parent email; skipping');
    return false;
  }

  const parentUser =
    (params.payment.parentId
      ? await storage.getUser(params.payment.parentId)
      : null) || (await storage.getUserByEmail(parentEmail));

  const schoolId = params.payment.schoolId || parentUser?.schoolId;
  if (!schoolId) {
    console.warn('[enrollment-admin-notify] missing schoolId; skipping');
    return false;
  }

  const lines = await buildEnrollmentPaymentLines(params.enrollmentIds);
  if (lines.length === 0) {
    return false;
  }

  const senderId = parentUser?.id || params.payment.parentId || 1;

  await notifySchoolAdminsOfEnrollmentPayment({
    schoolId,
    senderId,
    parentName:
      parentUser?.name ||
      [parentUser?.firstName, parentUser?.lastName].filter(Boolean).join(' ').trim() ||
      parentEmail.split('@')[0] ||
      'Parent',
    parentEmail,
    parentPhone: parentUser?.phone ?? null,
    amountPaidCents: params.amountPaidCents,
    paymentPlan: params.paymentPlan,
    paymentIntentId: params.paymentIntentId ?? params.payment.stripePaymentIntentId,
    lines,
    paidAt: params.payment.paymentDate ?? new Date(),
  });

  await storage.updatePayment(params.payment.id, {
    metadata: {
      ...priorMeta,
      adminEnrollmentNotifySentAt: new Date().toISOString(),
      adminEnrollmentNotifyPaymentIntentId:
        params.paymentIntentId ?? params.payment.stripePaymentIntentId,
    },
  });

  return true;
}
