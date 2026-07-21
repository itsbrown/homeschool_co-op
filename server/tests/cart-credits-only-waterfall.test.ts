import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { completeCartCreditsOnlyCheckout } from '../services/cart-credits-only-checkout';
import { storage } from '../storage';

describe('cart-credits-only-checkout waterfall', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('applies credits to membership before enrollments', async () => {
    const enrollmentUpdates: { id: number; totalPaid: number }[] = [];
    let membershipPaid = 0;
    let finalizedPaymentHistoryId: number | undefined;

    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'getStripePaymentByIntentId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'saveStripePayment').mockResolvedValue({ id: 55 } as any);
    jest.spyOn(storage, 'createCreditHolds').mockResolvedValue({ holds: [], totalHeld: 15_000 } as any);
    jest.spyOn(storage, 'finalizeCreditHolds').mockImplementation(async (_session, paymentHistoryId) => {
      finalizedPaymentHistoryId = paymentHistoryId;
      return {
        finalizedCount: 1,
        totalFinalized: 15_000,
        usageLogs: [],
      } as any;
    });
    jest.spyOn(storage, 'createPayment').mockResolvedValue({ id: 99 } as any);
    jest.spyOn(storage, 'getMembershipEnrollmentByParentAndSchoolAndYear').mockResolvedValue(undefined);
    jest.spyOn(storage, 'getProgramEnrollmentById').mockImplementation(async (id: number) =>
      ({
        id,
        schoolId: 2,
        totalCost: 10_000,
        totalPaid: 0,
      }) as any,
    );
    jest.spyOn(storage, 'updateProgramEnrollment').mockImplementation(async (id, patch) => {
      enrollmentUpdates.push({ id, totalPaid: (patch as any).totalPaid });
      return {} as any;
    });
    jest.spyOn(storage, 'getScheduledPaymentsByEnrollmentId').mockResolvedValue([]);
    jest.spyOn(storage, 'getUser').mockResolvedValue({ id: 1, memberId: 'M1', stripeCustomerId: 'cus_x' } as any);
    jest.spyOn(storage, 'createMembershipEnrollment').mockImplementation(async (row) => {
      membershipPaid = row.amountPaid ?? 0;
      return { id: 50 } as any;
    });

    await completeCartCreditsOnlyCheckout({
      parentEmail: 'p@test.com',
      parentId: 1,
      parentSchoolId: 2,
      enrollmentIds: [100],
      authoritativeAmountResult: {
        enrollmentSubtotalCents: 10_000,
        membershipAmountCents: 5_000,
        totalAmountCents: 15_000,
        breakdown: [{ id: '100', selectedChargeCents: 10_000 }],
        validation: { isValid: true, errors: [], warnings: [], hasWarnings: false },
      } as any,
      appliedVolunteerCreditsCents: 15_000,
      totalWithMembership: 15_000,
      serverMembership: {
        parentUserId: 1,
        schoolId: 2,
        amount: 5_000,
        year: 2026,
      },
    });

    expect(membershipPaid).toBe(5_000);
    expect(enrollmentUpdates).toEqual([{ id: 100, totalPaid: 10_000 }]);
    expect(finalizedPaymentHistoryId).toBe(55);
  });
});
