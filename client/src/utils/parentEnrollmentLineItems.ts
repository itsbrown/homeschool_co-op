/**
 * One place for "which enrollment rows become cart line items".
 *
 * CartContext historically owned this logic; ParentDashboard / useUnpaidEnrollments
 * summed every API row with balance > 0, which double-counted duplicate class+child
 * enrollments and inflated totals vs /api/cart/calculate.
 */

function enrollmentBalanceCents(e: any): number {
  if (typeof e?.effectiveBalance === 'number') {
    return e.effectiveBalance;
  }
  return Math.max(
    0,
    (e?.totalCost || 0) - (e?.totalPaid || 0) - (e?.compAmountCents ?? 0),
  );
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
      const classId =
        enrollment.marketplaceClassId ||
        enrollment.classId ||
        enrollment.programId;
      const key = `${classId}-${enrollment.childId}`;
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
