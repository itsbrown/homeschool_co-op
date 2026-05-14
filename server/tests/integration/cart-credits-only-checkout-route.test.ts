import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { testDb } from '../helpers/testDatabase';
import { api, resetApi } from '../helpers/apiHelpers';
import { storage } from '../../storage';

const mockStripeCustomersSearch = jest.fn();
const mockStripeSubscriptionsList = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
  getStripePublishableKey: jest.fn(async () => 'pk_test_mock'),
}));

describe('Integration: cart credits-only checkout (create-payment-intent)', () => {
  let testUser: any;
  let testSchool: any;
  let testChild: any;
  let testClass: any;

  beforeAll(async () => {
    process.env.ENABLE_STRIPE_PREFLIGHT_IN_TESTS = 'true';
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
    delete process.env.ENABLE_STRIPE_PREFLIGHT_IN_TESTS;
  });

  beforeEach(async () => {
    resetApi();
    jest.restoreAllMocks();
    await testDb.cleanup();

    (mockStripeCustomersSearch as any).mockResolvedValue({ data: [] });
    (mockStripeSubscriptionsList as any).mockResolvedValue({ data: [] });
    (mockStripePaymentIntentsCreate as any).mockResolvedValue({
      id: 'pi_test_cart',
      client_secret: 'pi_test_cart_secret',
      status: 'requires_payment_method',
      amount: 10000,
      currency: 'usd',
    });
    mockGetStripeClient.mockResolvedValue({
      customers: { search: mockStripeCustomersSearch },
      subscriptions: { list: mockStripeSubscriptionsList },
      paymentIntents: { create: mockStripePaymentIntentsCreate },
    });

    const admin = await testDb.createTestUser({
      username: 'cart_credit_admin',
      email: 'admin.cartcredit@test.com',
      role: 'schoolAdmin',
      name: 'Cart Credit Admin',
    });
    testSchool = await testDb.createTestSchool(admin.id, {
      name: 'Cart Credit School',
      registrationCode: 'CARTCR1',
    });

    testUser = await testDb.createTestUser({
      username: 'cart_credit_parent',
      email: 'parent.cartcredit@test.com',
      password: 'TestPassword123',
      name: 'Cart Credit Parent',
      role: 'parent',
      schoolId: testSchool.id,
    });

    testChild = await testDb.createTestChild(testUser.id, {
      firstName: 'Pat',
      lastName: 'Child',
      dateOfBirth: new Date('2015-01-01'),
      schoolId: testSchool.id,
    });

    testClass = await testDb.createTestClass(testSchool.id, {
      name: 'Cart Credit Class',
      description: 'For credits-only checkout',
      price: 10000,
      status: 'active',
      type: 'school',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with creditOnlyCheckout and marks enrollment paid when credits cover the cart', async () => {
    jest.spyOn(storage, 'getTotalAvailableCredits').mockResolvedValue(10000);
    jest.spyOn(storage, 'createCreditHolds').mockResolvedValue({ holds: [], totalHeld: 10000 } as any);
    jest.spyOn(storage, 'finalizeCreditHolds').mockResolvedValue({
      finalizedCount: 1,
      totalFinalized: 10000,
      usageLogs: [],
    } as any);

    await api.loginAsUser(testUser.email, 'TestPassword123');

    const response = await api.post('/api/stripe/create-payment-intent', {
      items: [
        {
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000,
          totalCost: 10000,
          depositRequired: 0,
          amountPaid: 0,
          remainingBalance: 10000,
        },
      ],
      subtotal: 10000,
      total: 10000,
      discounts: {
        siblingDiscount: 0,
        freeAfterThree: 0,
        appliedDiscounts: [],
        totalDiscountAmount: 0,
      },
      parentEmail: testUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
      creditsToApply: 10000,
    });

    expect(response.status).toBe(200);
    expect(response.body.creditOnlyCheckout).toBe(true);
    expect(response.body.creditsApplied).toBe(10000);
    expect(typeof response.body.paymentIntentId).toBe('string');
    expect(response.body.paymentIntentId.startsWith('credit_only_cart_')).toBe(true);

    const enrollmentIds: number[] = response.body.enrollmentIds;
    expect(Array.isArray(enrollmentIds)).toBe(true);
    expect(enrollmentIds.length).toBe(1);

    const enrollment = await storage.getProgramEnrollmentById(enrollmentIds[0]!);
    expect(enrollment).toBeTruthy();
    expect((enrollment as any).totalPaid).toBe(10000);
    expect((enrollment as any).remainingBalance).toBe(0);
  }, 30000);
});
