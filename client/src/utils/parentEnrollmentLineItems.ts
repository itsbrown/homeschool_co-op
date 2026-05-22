/**
 * One place for "which enrollment rows become cart line items".
 *
 * CartContext historically owned this logic; ParentDashboard / useUnpaidEnrollments
 * summed every API row with balance > 0, which double-counted duplicate class+child
 * enrollments and inflated totals vs /api/cart/calculate.
 */

import { enrollmentShouldExcludeFromCart } from "@shared/enrollment-cart-eligibility";

function enrollmentBalanceCents(e: any): number {
  if (typeof e?.effectiveBalance === 'number') {
    return e.effectiveBalance;
  }
  return Math.max(
    0,
    (e?.totalCost || 0) - (e?.totalPaid || 0) - (e?.compAmountCents ?? 0),
  );
}

/** Normalize API/DB field naming for cart grouping. */
function sessionEnrollmentFields(enrollment: any) {
  return {
    sessionId: enrollment.sessionId ?? enrollment.session_id ?? null,
    enrollmentVersion:
      enrollment.enrollmentVersion ?? enrollment.enrollment_version ?? 'v1',
    dayType: enrollment.dayType ?? enrollment.day_type ?? null,
    variantId: enrollment.variantId ?? enrollment.variant_id ?? null,
  };
}

/**
 * Stable cart line key: one checkout line per billable enrollment target.
 * F001 session rows must not collapse when legacy classId/marketplaceClassId overlap.
 */
export function cartEnrollmentLineKey(enrollment: any): string {
  const childId = enrollment.childId;
  const { sessionId, enrollmentVersion, dayType, variantId } =
    sessionEnrollmentFields(enrollment);

  const isSessionEnrollment =
    enrollmentVersion === 'v2' || sessionId != null || dayType != null;

  if (isSessionEnrollment) {
    const sessionPart = sessionId != null ? `s${sessionId}` : `e${enrollment.id}`;
    const variant = variantId ?? dayType ?? 'default';
    return `v2:${sessionPart}:c${childId}:v${variant}`;
  }

  const lineKey =
    enrollment.marketplaceClassId ??
    enrollment.classId ??
    enrollment.programId ??
    `enrollment-${enrollment.id}`;
  return `${lineKey}-${childId}`;
}

/**
 * Same grouping and "latest wins" rules as `CartContext` cart hydration.
 * Returns the enrollment rows that correspond to one cart line each.
 */
export function filterEnrollmentsToCartLineItems(
  enrollments: any[] | null | undefined,
): any[] {
  if (!enrollments || enrollments.length === 0) return [];

  const enrollmentGroups = enrollments.reduce(
    (acc: Record<string, any[]>, enrollment: any) => {
      const key = cartEnrollmentLineKey(enrollment);
      if (!acc[key]) acc[key] = [];
      acc[key].push(enrollment);
      return acc;
    },
    {},
  );

  const lineItems: any[] = [];

  for (const groupEnrollments of Object.values(enrollmentGroups)) {
    const enrollmentList = [...groupEnrollments].sort(
      (a, b) =>
        new Date(b.enrollmentDate).getTime() -
        new Date(a.enrollmentDate).getTime(),
    );

    const latestEnrollment = enrollmentList[0];
    const getBalance = enrollmentBalanceCents;
    const hasBalance = getBalance(latestEnrollment) > 0;

    const hasFullyPaidEnrollment = enrollmentList.some(
      (e) =>
        (e.status === 'enrolled' && getBalance(e) === 0) ||
        (e.paymentStatus === 'completed' && getBalance(e) === 0),
    );

    const latestIsPaid =
      (latestEnrollment.status === 'enrolled' &&
        getBalance(latestEnrollment) === 0) ||
      (latestEnrollment.paymentStatus === 'completed' &&
        getBalance(latestEnrollment) === 0);

    const isWaitlisted = latestEnrollment.status === 'waitlist';
    const shouldSkip =
      hasFullyPaidEnrollment || latestIsPaid || isWaitlisted;

    if (enrollmentShouldExcludeFromCart(latestEnrollment)) {
      continue;
    }

    if (
      !isWaitlisted &&
      !shouldSkip &&
      (hasBalance ||
        (latestEnrollment.status === 'pending_payment' &&
          getBalance(latestEnrollment) > 0))
    ) {
      lineItems.push(latestEnrollment);
    }
  }

  return lineItems;
}
