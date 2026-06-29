/**
 * One place for "which enrollment rows become cart line items".
 *
 * CartContext historically owned this logic; ParentDashboard / useUnpaidEnrollments
 * summed every API row with balance > 0, which double-counted duplicate class+child
 * enrollments and inflated totals vs /api/cart/calculate.
 */

import { enrollmentShouldExcludeFromCart } from "@shared/enrollment-cart-eligibility";

/** Enrollments in these statuses must never hydrate the parent cart. */
const NON_CART_ENROLLMENT_STATUSES = new Set([
  'cancelled',
  'canceled',
  'withdrawn',
  'failed',
  'completed',
  'waitlist',
  'location_wishlist',
]);

function enrollmentIsBillableStatus(e: any): boolean {
  const status = String(e?.status ?? '').toLowerCase();
  return status !== '' && !NON_CART_ENROLLMENT_STATUSES.has(status);
}

function enrollmentBalanceCents(e: any): number {
  const fromFormula = Math.max(
    0,
    (e?.totalCost || 0) - (e?.totalPaid || 0) - (e?.compAmountCents ?? 0),
  );
  if (typeof e?.effectiveBalance === 'number') {
    // Prefer the higher of stored effective_balance and computed owed — stale zeros
    // hide payable session rows from the cart while duplicate enrollment still blocks re-add.
    return Math.max(fromFormula, Math.max(0, e.effectiveBalance));
  }
  return fromFormula;
}

function enrollmentTuitionOwedCents(e: any): boolean {
  if (!enrollmentIsBillableStatus(e)) return false;
  if (enrollmentBalanceCents(e) > 0) return true;
  return (
    e?.status === 'pending_payment' &&
    Math.max(
      0,
      (e?.totalCost || 0) - (e?.totalPaid || 0) - (e?.compAmountCents ?? 0),
    ) > 0
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

    const isNonBillable = !enrollmentIsBillableStatus(latestEnrollment);
    // Do not hide a newer pending_payment row because an older enrolled row exists
    // in the same group (orphan pending after re-enroll / data drift).
    const shouldSkip =
      isNonBillable ||
      latestIsPaid ||
      (hasFullyPaidEnrollment && latestEnrollment.status !== 'pending_payment');

    if (
      latestEnrollment.checkoutExcluded === true ||
      latestEnrollment.managedByPaymentPlan === true ||
      enrollmentShouldExcludeFromCart(latestEnrollment)
    ) {
      continue;
    }

    if (!shouldSkip && enrollmentTuitionOwedCents(latestEnrollment)) {
      lineItems.push(latestEnrollment);
    }
  }

  return lineItems;
}
