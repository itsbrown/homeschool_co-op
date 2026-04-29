// Unit tests for calculateCartSnapshot's free-enrollment derivation.
// Locks in the four legitimate paths to isFreeEnrollment=true plus the
// "$0-looking but unauthorized" case that triggered the original bug.

const mockGetClassById = jest.fn();
const mockGetSchool = jest.fn();
const mockGetDiscountsBySchoolId = jest.fn();
const mockGetUser = jest.fn();
const mockGetMembershipEnrollmentsByParentId = jest.fn();
const mockGetAvailableCredits = jest.fn();
const mockGetProgramEnrollmentById = jest.fn();
const mockGetDiscountUsageCountByUser = jest.fn();

jest.mock('../db', () => ({
  getDb: jest.fn().mockRejectedValue(new Error('test: db disabled')),
}));

jest.mock('../storage', () => ({
  storage: {
    getClassById: mockGetClassById,
    getSchool: mockGetSchool,
    getDiscountsBySchoolId: mockGetDiscountsBySchoolId,
    getUser: mockGetUser,
    getMembershipEnrollmentsByParentId: mockGetMembershipEnrollmentsByParentId,
    getAvailableCredits: mockGetAvailableCredits,
    getProgramEnrollmentById: mockGetProgramEnrollmentById,
    getDiscountUsageCountByUser: mockGetDiscountUsageCountByUser,
  },
}));

// Import AFTER mocks are wired up.
import { calculateCartSnapshot, CartItem } from '../utils/cart-pricing';

const SCHOOL_ID = 1;
const USER_ID = 100;

function resetStorageMocks() {
  mockGetClassById.mockReset();
  mockGetSchool.mockReset();
  mockGetDiscountsBySchoolId.mockReset();
  mockGetUser.mockReset();
  mockGetMembershipEnrollmentsByParentId.mockReset();
  mockGetAvailableCredits.mockReset();
  mockGetProgramEnrollmentById.mockReset();
  mockGetDiscountUsageCountByUser.mockReset();

  // Sensible defaults: no membership, no discounts, no credits, no member id.
  mockGetSchool.mockResolvedValue({
    id: SCHOOL_ID,
    name: 'Test School',
    membershipRequired: false,
    membershipFeeAmount: 0,
    freeAfterThresholdEnabled: false,
    freeAfterThreshold: 3,
  });
  mockGetDiscountsBySchoolId.mockResolvedValue([]);
  mockGetUser.mockResolvedValue({ id: USER_ID, memberId: null });
  mockGetMembershipEnrollmentsByParentId.mockResolvedValue([]);
  mockGetAvailableCredits.mockResolvedValue([]);
  mockGetProgramEnrollmentById.mockResolvedValue(undefined);
  mockGetDiscountUsageCountByUser.mockResolvedValue(0);
}

beforeEach(() => {
  resetStorageMocks();
});

describe('calculateCartSnapshot — free enrollment derivation', () => {
  describe('full_credit', () => {
    it('flags isFreeEnrollment with reason "full_credit" when credits cover the entire grand total', async () => {
      // Plain class priced at $100, no discounts, $100 in credits applied.
      mockGetClassById.mockResolvedValue({
        id: 10,
        title: 'Math 101',
        price: 10000,
        schoolId: SCHOOL_ID,
      });
      mockGetAvailableCredits.mockResolvedValue([
        { creditAmountCents: 10000, usedAmountCents: 0 },
      ]);

      const items: CartItem[] = [
        { id: '10-1', classId: 10, childId: 1, childName: 'Child A' },
      ];

      const snapshot = await calculateCartSnapshot(
        items,
        USER_ID,
        SCHOOL_ID,
        undefined,
        10000,
        'parent@test.com',
      );

      expect(snapshot.totals.payableAmount).toBe(0);
      expect(snapshot.totals.grandTotal).toBe(10000);
      expect(snapshot.credits.applied).toBe(10000);
      expect(snapshot.isFreeEnrollment).toBe(true);
      expect(snapshot.freeEnrollmentReason).toBe('full_credit');
    });
  });

  describe('full_discount_code', () => {
    it('flags isFreeEnrollment with reason "full_discount_code" when a manual promo wipes out the subtotal', async () => {
      mockGetClassById.mockResolvedValue({
        id: 10,
        title: 'Math 101',
        price: 10000,
        schoolId: SCHOOL_ID,
      });
      mockGetDiscountsBySchoolId.mockResolvedValue([
        {
          id: 1,
          schoolId: SCHOOL_ID,
          name: '100% Off Promo',
          code: 'FREE100',
          type: 'fixed_amount',
          value: 10000,
          applicationMethod: 'manual',
          isActive: true,
          siblingDiscount: false,
          appliesToMembership: false,
          combinableWithOthers: false,
          priority: 0,
          requiredRoles: null,
          allowedMemberIds: null,
          bundleRule: null,
          minOrderAmount: null,
          maxDiscountAmount: null,
          applicableToClasses: null,
          usageLimitPerUser: null,
        },
      ]);

      const items: CartItem[] = [
        { id: '10-1', classId: 10, childId: 1, childName: 'Child A' },
      ];

      const snapshot = await calculateCartSnapshot(
        items,
        USER_ID,
        SCHOOL_ID,
        'FREE100',
        0,
        'parent@test.com',
      );

      expect(snapshot.totals.payableAmount).toBe(0);
      expect(snapshot.pricing.subtotal).toBe(10000);
      expect(snapshot.pricing.discounts.totalDiscountAmount).toBe(10000);
      expect(snapshot.isFreeEnrollment).toBe(true);
      expect(snapshot.freeEnrollmentReason).toBe('full_discount_code');
    });
  });

  describe('full_automatic_discount', () => {
    it('flags isFreeEnrollment with reason "full_automatic_discount" when an auto-applied discount wipes out the subtotal', async () => {
      mockGetClassById.mockResolvedValue({
        id: 10,
        title: 'Math 101',
        price: 10000,
        schoolId: SCHOOL_ID,
      });
      mockGetDiscountsBySchoolId.mockResolvedValue([
        {
          id: 2,
          schoolId: SCHOOL_ID,
          name: '100% Off Auto',
          code: null,
          type: 'fixed_amount',
          value: 10000,
          applicationMethod: 'automatic',
          isActive: true,
          siblingDiscount: false,
          appliesToMembership: false,
          combinableWithOthers: false,
          priority: 0,
          requiredRoles: null,
          allowedMemberIds: null,
          bundleRule: null,
          minOrderAmount: null,
          maxDiscountAmount: null,
          applicableToClasses: null,
          usageLimitPerUser: null,
        },
      ]);

      const items: CartItem[] = [
        { id: '10-1', classId: 10, childId: 1, childName: 'Child A' },
      ];

      const snapshot = await calculateCartSnapshot(
        items,
        USER_ID,
        SCHOOL_ID,
        undefined,
        0,
        'parent@test.com',
      );

      expect(snapshot.totals.payableAmount).toBe(0);
      expect(snapshot.pricing.subtotal).toBe(10000);
      expect(snapshot.pricing.discounts.totalDiscountAmount).toBe(10000);
      expect(snapshot.isFreeEnrollment).toBe(true);
      expect(snapshot.freeEnrollmentReason).toBe('full_automatic_discount');
    });
  });

  describe('full_comp', () => {
    it('flags isFreeEnrollment with reason "full_comp" when every cart item maps to a fully comped enrollment', async () => {
      // Subtotal will be 0 because the cart item carries remainingBalance=0
      // (a comped enrollment already has no balance left to pay), but we must
      // independently verify the underlying enrollment record really IS comped
      // — that's the only branch that allows the snapshot to claim "full_comp".
      mockGetProgramEnrollmentById.mockResolvedValue({
        id: 555,
        totalCost: 10000,
        totalPaid: 0,
        compAmountCents: 10000,
      });

      const items: CartItem[] = [
        {
          id: '10-1',
          classId: 10,
          childId: 1,
          childName: 'Child A',
          enrollmentId: 555,
          remainingBalance: 0,
        },
      ];

      const snapshot = await calculateCartSnapshot(
        items,
        USER_ID,
        SCHOOL_ID,
        undefined,
        0,
        'parent@test.com',
      );

      expect(snapshot.totals.payableAmount).toBe(0);
      expect(snapshot.pricing.subtotal).toBe(0);
      expect(snapshot.isFreeEnrollment).toBe(true);
      expect(snapshot.freeEnrollmentReason).toBe('full_comp');
    });
  });

  describe('$0-looking but unauthorized', () => {
    it('does NOT flag isFreeEnrollment for a Stripe-managed enrollment whose stored remaining_balance=0 hides real money owed', async () => {
      // This is the regression: the parent really owes $100 (totalCost=10000,
      // totalPaid=0, no comp), but a Stripe-managed payment plan stores
      // remaining_balance=0. Without the authoritative gate the cart would
      // show "Free Enrollment".
      mockGetProgramEnrollmentById.mockResolvedValue({
        id: 777,
        totalCost: 10000,
        totalPaid: 0,
        compAmountCents: 0,
      });

      const items: CartItem[] = [
        {
          id: '10-1',
          classId: 10,
          childId: 1,
          childName: 'Child A',
          enrollmentId: 777,
          remainingBalance: 0,
        },
      ];

      const snapshot = await calculateCartSnapshot(
        items,
        USER_ID,
        SCHOOL_ID,
        undefined,
        0,
        'parent@test.com',
      );

      // payableAmount looks like 0 because the cart was given remainingBalance=0,
      // but the snapshot must refuse to call this a free enrollment.
      expect(snapshot.totals.payableAmount).toBe(0);
      expect(snapshot.pricing.subtotal).toBe(0);
      expect(snapshot.isFreeEnrollment).toBe(false);
      expect(snapshot.freeEnrollmentReason).toBeNull();
    });
  });
});
