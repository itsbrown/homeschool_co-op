import type { InsertMembershipEnrollment, School } from '@shared/schema';
import { isActiveMembership } from '@shared/schema';
import { storage } from '../storage';

type MembershipRowForBalance = {
  id?: number | null;
  schoolId?: number | null;
  membershipYear?: number | null;
  amount?: number | null;
  amountPaid?: number | null;
  remainingBalance?: number | null;
  status?: string | null;
};

/** Registration / legacy rows with no priced balance yet. */
export function isPlaceholderMembershipEnrollmentRow(
  row: MembershipRowForBalance | null | undefined,
): boolean {
  if (!row || isActiveMembership(row.status ?? null)) return false;
  if ((row.amount ?? 0) > 0) return false;
  if ((row.amountPaid ?? 0) > 0) return false;
  if (typeof row.remainingBalance === 'number' && row.remainingBalance > 0) {
    return false;
  }
  return true;
}

export function buildPendingMembershipEnrollmentInsert(
  school: School,
  parentUserId: number,
  schoolId: number,
  membershipYear: number,
  amountCents: number,
): InsertMembershipEnrollment {
  const renewalMonth = school.membershipRenewalMonth ?? 9;
  const renewalDay = school.membershipRenewalDay ?? 1;
  const dueDate = new Date(membershipYear, renewalMonth - 1, renewalDay);
  const expirationDate = new Date(membershipYear + 1, renewalMonth - 1, renewalDay);
  const gracePeriodEnd = new Date(expirationDate);
  gracePeriodEnd.setDate(
    gracePeriodEnd.getDate() + (school.membershipGracePeriodDays ?? 30),
  );

  return {
    schoolId,
    parentUserId,
    membershipYear,
    amount: amountCents,
    amountPaid: 0,
    remainingBalance: amountCents,
    totalAmount: amountCents,
    balanceDue: amountCents,
    status: 'pending_payment',
    dueDate,
    expirationDate,
    endDate: expirationDate,
    gracePeriodEnd,
    membershipTier: 'basic',
    notes: null,
    paymentMethod: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    startDate: null,
    renewalDate: null,
  };
}

/** Create or upgrade a pending membership row (requires full NOT NULL date columns). */
export async function ensurePendingMembershipEnrollmentForCheckout(
  userId: number,
  schoolId: number,
  membershipFeeAmount: number,
  currentYear: number,
): Promise<void> {
  if (membershipFeeAmount <= 0) return;

  const school = await storage.getSchool(schoolId);
  if (!school) return;

  const rows = await storage.getMembershipEnrollmentsByParentId(userId);
  const forSchool = rows.filter(
    (m) =>
      Number(m.schoolId) === Number(schoolId) &&
      (m.membershipYear === currentYear || m.membershipYear === currentYear + 1),
  );

  const placeholder = forSchool.find((m) => isPlaceholderMembershipEnrollmentRow(m));
  if (placeholder?.id != null) {
    await storage.updateMembershipEnrollment(placeholder.id, {
      amount: membershipFeeAmount,
      amountPaid: 0,
      remainingBalance: membershipFeeAmount,
      totalAmount: membershipFeeAmount,
      balanceDue: membershipFeeAmount,
      status: 'pending_payment',
    });
    return;
  }

  if (forSchool.length > 0) return;

  await storage.createMembershipEnrollment(
    buildPendingMembershipEnrollmentInsert(
      school,
      userId,
      schoolId,
      currentYear,
      membershipFeeAmount,
    ),
  );
}
