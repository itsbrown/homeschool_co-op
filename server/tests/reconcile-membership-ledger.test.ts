import { jest } from '@jest/globals';

jest.mock('../storage', () => ({
  storage: {
    getMembershipEnrollmentByParentAndSchoolAndYear: jest.fn(),
    getMembershipEnrollmentsByParentId: jest.fn(),
    getUser: jest.fn(),
    getUserByEmail: jest.fn(),
    updateUser: jest.fn(),
    updateMembershipEnrollment: jest.fn(),
    getPaymentsByParentEmail: jest.fn(),
    getProgramEnrollmentsByParent: jest.fn(),
    getPaymentByStripeId: jest.fn(),
    updatePayment: jest.fn(),
  },
}));

jest.mock('../utils/membership', () => ({
  generateMemberId: jest.fn(() => 'ASA-2026-TEST01'),
}));

import { storage } from '../storage';
import {
  parentHasSatisfiedMembership,
  reconcileMembershipLedgerForParent,
} from '../lib/reconcile-membership-ledger';

const baseMembership = {
  id: 398,
  schoolId: 2,
  parentUserId: 144,
  membershipYear: 2026,
  status: 'pending_payment' as const,
  amount: 17500,
  amountPaid: 0,
  remainingBalance: 17500,
  balanceDue: 0,
  notes: null,
};

describe('reconcileMembershipLedgerForParent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs pending membership when parent already has a member ID', async () => {
    jest
      .mocked(storage.getMembershipEnrollmentByParentAndSchoolAndYear)
      .mockResolvedValue(baseMembership as any);
    jest.mocked(storage.getUser).mockResolvedValue({
      id: 144,
      email: 'parent@example.com',
      memberId: 'ASA-2026-T2ND',
    } as any);

    const result = await reconcileMembershipLedgerForParent(144, 2);

    expect(result).toEqual({ updated: true, memberIdGenerated: false });
    expect(storage.updateMembershipEnrollment).toHaveBeenCalledWith(398, {
      status: 'enrolled',
      amountPaid: 17500,
      remainingBalance: 0,
      balanceDue: 0,
      totalAmount: 17500,
    });
  });

  it('syncs from combined cart payment when tuition + membership were paid together', async () => {
    jest
      .mocked(storage.getMembershipEnrollmentByParentAndSchoolAndYear)
      .mockResolvedValue(baseMembership as any);
    jest.mocked(storage.getUser).mockResolvedValue({
      id: 144,
      email: 'parent@example.com',
      memberId: null,
    } as any);
    jest.mocked(storage.getPaymentsByParentEmail).mockResolvedValue([
      {
        status: 'completed',
        amount: 167500,
        stripePaymentIntentId: 'pi_test',
        metadata: {},
      },
    ] as any);
    jest.mocked(storage.getProgramEnrollmentsByParent).mockResolvedValue([
      { totalPaid: 150000, paymentStatus: 'completed' },
    ] as any);
    jest.mocked(storage.getPaymentByStripeId).mockResolvedValue({
      id: 293,
      stripePaymentIntentId: 'pi_test',
      metadata: {},
    } as any);
    jest.mocked(storage.updatePayment).mockResolvedValue({} as any);
    jest.mocked(storage.updateUser).mockResolvedValue({} as any);

    const result = await reconcileMembershipLedgerForParent(144, 2);

    expect(result.updated).toBe(true);
    expect(result.memberIdGenerated).toBe(true);
    expect(storage.updateMembershipEnrollment).toHaveBeenCalled();
    expect(storage.updateUser).toHaveBeenCalledWith(144, { memberId: 'ASA-2026-TEST01' });
  });
});

describe('parentHasSatisfiedMembership', () => {
  it('is true when member ID exists', () => {
    expect(
      parentHasSatisfiedMembership('ASA-2026-T2ND', baseMembership as any, 2, 2026),
    ).toBe(true);
  });

  it('is true when membership row is enrolled and paid', () => {
    expect(
      parentHasSatisfiedMembership(
        null,
        {
          ...baseMembership,
          status: 'enrolled',
          amountPaid: 17500,
          remainingBalance: 0,
        } as any,
        2,
        2026,
      ),
    ).toBe(true);
  });
});
