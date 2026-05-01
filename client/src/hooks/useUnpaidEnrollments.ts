import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/contexts/CartContext';
import {
  getEnrollmentEffectiveBalance,
  getMembershipOutstandingBalance,
  computeParentOutstandingTotal,
  computeOutstandingDisplay,
  computeOutstandingBreakdown,
  type OutstandingBreakdown,
  type ParentMembershipBalanceFields,
  type ParentCreditRecord,
} from '@/utils/parentBalance';

interface CreditsResponse {
  totalAvailableCents?: number;
  credits?: ParentCreditRecord[];
}

interface ParentEnrollmentRow {
  id: number;
  childId: number;
  childName?: string;
  className?: string;
  classId?: number | null;
  marketplaceClassId?: number | null;
  classType?: string;
  effectiveBalance?: number | null;
  totalCost?: number | null;
  totalPaid?: number | null;
  compAmountCents?: number | null;
  depositRequired?: number | null;
  variantId?: string;
  variantName?: string;
  paymentSystemVersion?: string;
}

type EnrollmentsResponse =
  | ParentEnrollmentRow[]
  | { enrollments?: ParentEnrollmentRow[] }
  | null
  | undefined;

export interface UnpaidEnrollment {
  id: number;
  childId: number;
  childName: string;
  className: string;
  classId: number | null;
  marketplaceClassId: number | null;
  classType: string;
  effectiveBalance: number;
  variantId?: string;
  variantName?: string;
  totalCost: number;
  totalPaid: number;
  compAmountCents: number;
  depositRequired: number;
  paymentSystemVersion?: string;
}

function normalizeEnrollments(data: EnrollmentsResponse): ParentEnrollmentRow[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.enrollments)) return data.enrollments;
  return [];
}

export function useUnpaidEnrollments() {
  const { data: enrollmentsRaw, isLoading } = useQuery<EnrollmentsResponse>({
    queryKey: ['/api/parent/enrollments'],
  });

  const { data: creditsData } = useQuery<CreditsResponse>({
    queryKey: ['/api/parent/credits'],
  });

  const { data: membershipsRaw } = useQuery<ParentMembershipBalanceFields[]>({
    queryKey: ['/api/parent/memberships'],
  });

  const unpaidEnrollments = useMemo<UnpaidEnrollment[]>(() => {
    const rows = normalizeEnrollments(enrollmentsRaw);
    const result: UnpaidEnrollment[] = [];
    for (const e of rows) {
      const balance = getEnrollmentEffectiveBalance(e);
      if (balance <= 0) continue;
      result.push({
        id: e.id,
        childId: e.childId,
        childName: e.childName ?? 'Child',
        className: e.className ?? 'Class',
        classId: e.marketplaceClassId || e.classId || null,
        marketplaceClassId: e.marketplaceClassId ?? null,
        classType: e.classType || 'regular',
        effectiveBalance: balance,
        variantId: e.variantId,
        variantName: e.variantName,
        totalCost: e.totalCost ?? 0,
        totalPaid: e.totalPaid ?? 0,
        compAmountCents: e.compAmountCents ?? 0,
        depositRequired: e.depositRequired ?? 0,
        paymentSystemVersion: e.paymentSystemVersion,
      });
    }
    return result;
  }, [enrollmentsRaw]);

  const unpaidMemberships = useMemo<ParentMembershipBalanceFields[]>(() => {
    return (membershipsRaw ?? []).filter(
      (m) => getMembershipOutstandingBalance(m) > 0,
    );
  }, [membershipsRaw]);

  const breakdown = useMemo<OutstandingBreakdown>(
    () =>
      computeOutstandingBreakdown({
        enrollments: unpaidEnrollments,
        memberships: unpaidMemberships,
        credits: creditsData?.credits,
        creditsCents: creditsData?.totalAvailableCents,
      }),
    [unpaidEnrollments, unpaidMemberships, creditsData],
  );

  const creditsCents = breakdown.creditsAvailableCents;

  const totalOutstandingCents = useMemo(
    () => computeParentOutstandingTotal(unpaidEnrollments),
    [unpaidEnrollments],
  );
  const display = useMemo(
    () => computeOutstandingDisplay(totalOutstandingCents, creditsCents),
    [totalOutstandingCents, creditsCents],
  );

  return {
    unpaidEnrollments,
    unpaidMemberships,
    totalOutstandingCents,
    creditsCents,
    breakdown,
    netDueCents: breakdown.netDueCents,
    displayCents: breakdown.displayCents,
    showCreditsLine: breakdown.showCreditsLine,
    showMembershipLine: breakdown.showMembershipLine,
    membershipsCents: breakdown.membershipsCents,
    payableNowCents: breakdown.payableNowCents,
    totalOwedCents: breakdown.totalOwedCents,
    enrollmentCount: breakdown.enrollmentCount,
    membershipCount: breakdown.membershipCount,
    enrollmentsOnlyDisplayCents: display.displayCents,
    enrollmentsOnlyNetDueCents: display.netDueCents,
    isLoading,
  };
}

export function usePayOutstanding() {
  const { cart, addItem, openCart } = useCart();

  return useCallback(
    (toPay: UnpaidEnrollment[]) => {
      for (const e of toPay) {
        if (!e || e.effectiveBalance <= 0) continue;
        const alreadyInCart = cart.items.some(
          (item) => item.enrollmentId === e.id,
        );
        if (alreadyInCart) continue;

        addItem(
          {
            enrollmentId: e.id,
            classType: e.classType,
            classId: e.classId,
            marketplaceClassId: e.marketplaceClassId,
            className: e.className,
            childId: e.childId,
            childName: e.childName,
            price: e.effectiveBalance,
            status: 'pending_payment',
            statusText: 'Balance Due',
            depositRequired: e.depositRequired,
            amountPaid: e.totalPaid,
            remainingBalance: e.effectiveBalance,
            totalCost: e.totalCost,
            variantId: e.variantId,
            variantName: e.variantName,
          },
          true,
        );
      }
      openCart();
    },
    [cart.items, addItem, openCart],
  );
}
