import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import { testDb } from '../helpers/testDatabase';
import { api, resetApi } from '../helpers/apiHelpers';
import { storage } from '../../storage';
import { getDb } from '../../db';
import { sessions } from '@shared/schema';
import { createEnrollmentDataSimple } from '@shared/enrollment-factory';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const mockStripeCustomersSearch = jest.fn();
const mockStripeSubscriptionsList = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
  getStripePublishableKey: jest.fn(async () => 'pk_test_mock'),
}));

describeWithDb('Integration: session enrollment checkout (create-payment-intent)', () => {
  let testUser: any;
  let testSchool: any;
  let testChild: any;
  let testSession: { id: number; name: string };

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
      id: 'pi_test_session',
      client_secret: 'pi_test_session_secret',
      status: 'requires_payment_method',
      amount: 25000,
      currency: 'usd',
    });
    mockGetStripeClient.mockResolvedValue({
      customers: { search: mockStripeCustomersSearch },
      subscriptions: { list: mockStripeSubscriptionsList },
      paymentIntents: { create: mockStripePaymentIntentsCreate },
    });

    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      username: `sess_chk_admin_${uid}`,
      email: `sess_chk_admin_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Session Checkout Admin',
    });
    testSchool = await testDb.createTestSchool(admin.id, {
      name: `Session Checkout School ${uid}`,
      registrationCode: `SCHK${uid.toUpperCase().slice(0, 6)}`,
    });

    testUser = await testDb.createTestUser({
      username: `sess_chk_parent_${uid}`,
      email: `sess_chk_parent_${uid}@test.com`,
      password: 'TestPassword123',
      name: 'Session Checkout Parent',
      role: 'parent',
      schoolId: testSchool.id,
    });

    testChild = await testDb.createTestChild(testUser.id, {
      firstName: 'Sam',
      lastName: 'Student',
      dateOfBirth: new Date('2015-03-01'),
      schoolId: testSchool.id,
      parentEmail: testUser.email,
    });

    const db = await getDb();
    const start = '2026-01-01';
    const end = '2026-06-01';
    const [sessionRow] = await db
      .insert(sessions)
      .values({
        schoolId: testSchool.id,
        name: `Spring Session ${uid}`,
        startDate: start,
        endDate: end,
        status: 'upcoming',
        enrollmentOpen: true,
        halfDayPrice: 15000,
        fullDayPrice: 25000,
        sortOrder: 0,
      })
      .returning();
    testSession = { id: sessionRow.id, name: sessionRow.name };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates payment intent for session enrollment cart line (enrollmentId only, no classId)', async () => {
    const enrollmentData = createEnrollmentDataSimple({
      schoolId: testSchool.id,
      classType: 'marketplace',
      classId: null,
      marketplaceClassId: null,
      sessionId: testSession.id,
      enrollmentVersion: 'v2',
      dayType: 'full_day',
      enrolledHalfDayPrice: 15000,
      enrolledFullDayPrice: 25000,
      childId: testChild.id,
      childName: `${testChild.firstName} ${testChild.lastName}`,
      className: `${testSession.name} - Full Day`,
      variantId: 'full_day',
      parentId: testUser.id,
      parentEmail: testUser.email,
      totalCost: 25000,
      totalPaid: 0,
      remainingBalance: 25000,
      depositRequired: 0,
      paymentStatus: 'pending',
      paymentPlan: null,
      paymentFrequency: 'one_time',
      programStartDate: '2026-01-01',
      programEndDate: '2026-06-01',
      status: 'pending_payment',
      waitlistPosition: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
    });

    const enrollment = await storage.createProgramEnrollment(enrollmentData);
    expect(enrollment.id).toBeTruthy();

    api.clearAuth();
    api.setTestUserEmail(testUser.email);

    const response = await api.post('/api/stripe/create-payment-intent', {
      items: [
        {
          id: `enrollment-${enrollment.id}`,
          enrollmentId: enrollment.id,
          sessionId: testSession.id,
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          className: `${testSession.name} - Full Day`,
          classType: 'marketplace',
          classId: null,
          marketplaceClassId: null,
          price: 25000,
          totalCost: 25000,
          depositRequired: 0,
          amountPaid: 0,
          remainingBalance: 25000,
        },
      ],
      subtotal: 25000,
      total: 25000,
      discounts: {
        siblingDiscount: 0,
        freeAfterThree: 0,
        appliedDiscounts: [],
        totalDiscountAmount: 0,
      },
      parentEmail: testUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
    });

    expect(response.status).toBe(200);
    expect(response.body.clientSecret).toBeTruthy();
    expect(response.body.enrollmentIds).toEqual([enrollment.id]);
    expect(mockStripePaymentIntentsCreate).toHaveBeenCalled();
  }, 30000);

  it('cart snapshot succeeds for session enrollment line without classId', async () => {
    const enrollmentData = createEnrollmentDataSimple({
      schoolId: testSchool.id,
      classType: 'marketplace',
      classId: null,
      marketplaceClassId: null,
      sessionId: testSession.id,
      enrollmentVersion: 'v2',
      dayType: 'half_day',
      enrolledHalfDayPrice: 15000,
      enrolledFullDayPrice: 25000,
      childId: testChild.id,
      childName: `${testChild.firstName} ${testChild.lastName}`,
      className: `${testSession.name} - Half Day`,
      variantId: 'half_day',
      parentId: testUser.id,
      parentEmail: testUser.email,
      totalCost: 15000,
      totalPaid: 0,
      remainingBalance: 15000,
      depositRequired: 0,
      paymentStatus: 'pending',
      paymentPlan: null,
      paymentFrequency: 'one_time',
      programStartDate: '2026-01-01',
      programEndDate: '2026-06-01',
      status: 'pending_payment',
      waitlistPosition: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
    });

    const enrollment = await storage.createProgramEnrollment(enrollmentData);

    api.clearAuth();
    api.setTestUserEmail(testUser.email);

    const response = await api.post('/api/cart/snapshot', {
      items: [
        {
          id: `enrollment-${enrollment.id}`,
          enrollmentId: enrollment.id,
          sessionId: testSession.id,
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          remainingBalance: 15000,
        },
      ],
      appliedPromoCode: null,
      creditsToApply: 0,
    });

    expect(response.status).toBe(200);
    expect(response.body.snapshotId).toBeTruthy();
    expect(response.body.totals.grandTotal).toBeGreaterThanOrEqual(15000);
  }, 30000);
});
