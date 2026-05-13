import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCart, type MembershipFee } from '@/contexts/CartContext';
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
import { filterEnrollmentsToCartLineItems } from '@/utils/parentEnrollmentLineItems';

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

/** Raw row shape returned by `/api/parent/memberships` (enriched in `server/api/parent.ts`). */
interface UnpaidMembershipRow extends ParentMembershipBalanceFields {
  schoolId?: number | null;
  schoolName?: string | null;
  membershipYear?: number | null;
}

export interface UnpaidMembership extends ParentMembershipBalanceFields {
  schoolId: number;
  schoolName: string;
  membershipYear: number;
  outstandingBalanceCents: number;
}

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

  const { data: membershipsRaw } = useQuery<UnpaidMembershipRow[]>({
    queryKey: ['/api/parent/memberships'],
  });

  const unpaidEnrollments = useMemo<UnpaidEnrollment[]>(() => {
    const rowsRaw = normalizeEnrollments(enrollmentsRaw);
    const rows = filterEnrollmentsToCartLineItems(rowsRaw);
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

  const unpaidMemberships = useMemo<UnpaidMembership[]>(() => {
    const result: UnpaidMembership[] = [];
    for (const m of membershipsRaw ?? []) {
      const balance = getMembershipOutstandingBalance(m);
      if (balance <= 0) continue;
      // Skip rows missing the cart-required fields (defensive — the API
      // enriches every row with schoolId/schoolName/membershipYear).
      if (
        m.schoolId == null ||
        !m.schoolName ||
        m.membershipYear == null
      ) {
        continue;
      }
      result.push({
        ...m,
        schoolId: m.schoolId,
        schoolName: m.schoolName,
        membershipYear: m.membershipYear,
        outstandingBalanceCents: balance,
      });
    }
    return result;
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
  const { cart, addItem, setMembership, openCart } = useCart();

  return useCallback(
    (toPay: UnpaidEnrollment[], toPayMemberships: UnpaidMembership[] = []) => {
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

      // Cart only supports a single membership at a time; the parent should
      // typically have at most one outstanding membership row anyway. Take the
      // first if multiple are present.
      const firstMembership = toPayMemberships[0];
      if (firstMembership && !cart.membership) {
        const fee: MembershipFee = {
          schoolId: firstMembership.schoolId,
          schoolName: firstMembership.schoolName,
          amount: firstMembership.outstandingBalanceCents,
          year: firstMembership.membershipYear,
        };
        setMembership(fee);
      }

      openCart();
    },
    [cart.items, cart.membership, addItem, setMembership, openCart],
  );
}
