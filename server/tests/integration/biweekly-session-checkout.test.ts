import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import { testDb, installFinancialIntegrationStubs } from '../helpers/testDatabase';
import { api, resetApi } from '../helpers/apiHelpers';
import { resetTestApp } from '../../simple-test-app';
import { storage } from '../../storage';
import { getDb } from '../../db';
import { sessions } from '@shared/schema';
import { createEnrollmentDataSimple } from '@shared/enrollment-factory';
import {
  assertAllDueDatesOnOrBeforeBiweeklyBoundary,
  assertBiweeklyPlanMatchesCheckout,
  buildBiweeklyCheckoutPhases,
  getExpectedBiweeklyCheckout,
} from '../../lib/biweekly-checkout-contract';
import {
  biweeklyInstallmentScheduleEndDate,
  checkoutAnchorDate,
} from '../../lib/payment-calculator';

const describeWithDb =
  process.env.TEST_DATABASE_URL && process.env.ASA_INTEGRATION_DB_AVAILABLE !== 'false'
    ? describe
    : describe.skip;

const PROGRAM_START = '2030-01-01';
const PROGRAM_END = '2030-06-01';
/** Fixed checkout "today" — set via TEST_CHECKOUT_ANCHOR_ISO in beforeAll (no fake timers). */
const ANCHOR_ISO = '2029-12-01T12:00:00.000Z';

const mockStripeCustomersSearch = jest.fn();
const mockStripeCustomersList = jest.fn();
const mockStripeCustomersCreate = jest.fn();
const mockStripeSubscriptionsList = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
  getStripePublishableKey: jest.fn(async () => 'pk_test_mock'),
}));

function sessionCartItem(
  enrollment: { id: number },
  session: { id: number; name: string },
  child: { id: number; firstName: string; lastName: string },
  parent: { id: number; email: string },
  totalCents: number,
) {
  return {
    id: `enrollment-${enrollment.id}`,
    enrollmentId: enrollment.id,
    sessionId: session.id,
    childId: child.id,
    childName: `${child.firstName} ${child.lastName}`,
    className: `${session.name} - Full Day`,
    classType: 'marketplace',
    classId: null,
    marketplaceClassId: null,
    price: totalCents,
    totalCost: totalCents,
    depositRequired: 0,
    amountPaid: 0,
    remainingBalance: totalCents,
  };
}

describeWithDb('Integration: biweekly session checkout contract', () => {
  installFinancialIntegrationStubs();

  let testUser: { id: number; email: string };
  let testSchool: { id: number };
  let testChild: { id: number; firstName: string; lastName: string };
  let testSession: { id: number; name: string };
  const totalCents = 250_000;

  beforeAll(async () => {
    resetTestApp();
    process.env.ENABLE_STRIPE_PREFLIGHT_IN_TESTS = 'true';
    process.env.TEST_CHECKOUT_ANCHOR_ISO = ANCHOR_ISO;
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
    delete process.env.ENABLE_STRIPE_PREFLIGHT_IN_TESTS;
    delete process.env.TEST_CHECKOUT_ANCHOR_ISO;
  });

  beforeEach(async () => {
    resetApi();
    jest.restoreAllMocks();
    await testDb.cleanup();

    (mockStripeCustomersSearch as any).mockResolvedValue({ data: [] });
    (mockStripeCustomersList as any).mockResolvedValue({ data: [] });
    (mockStripeCustomersCreate as any).mockImplementation(async (params: { email?: string }) => ({
      id: 'cus_test_biweekly_session',
      email: params.email,
    }));
    (mockStripeSubscriptionsList as any).mockResolvedValue({ data: [] });
    (mockStripePaymentIntentsCreate as any).mockImplementation(async (params: { amount: number }) => ({
      id: 'pi_test_biweekly_session',
      client_secret: 'pi_test_biweekly_session_secret',
      status: 'requires_payment_method',
      amount: params.amount,
      currency: 'usd',
    }));
    mockGetStripeClient.mockResolvedValue({
      customers: {
        search: mockStripeCustomersSearch,
        list: mockStripeCustomersList,
        create: mockStripeCustomersCreate,
      },
      subscriptions: { list: mockStripeSubscriptionsList },
      paymentIntents: { create: mockStripePaymentIntentsCreate },
    });

    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      username: `bw_sess_admin_${uid}`,
      email: `bw_sess_admin_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Biweekly Session Admin',
    });
    testSchool = await testDb.createTestSchool(admin.id, {
      name: `Biweekly Session School ${uid}`,
      registrationCode: `BWSS${uid.toUpperCase().slice(0, 6)}`,
    });

    testUser = await testDb.createTestUser({
      username: `bw_sess_parent_${uid}`,
      email: `bw_sess_parent_${uid}@test.com`,
      password: 'TestPassword123',
      name: 'Biweekly Session Parent',
      role: 'parent',
      schoolId: testSchool.id,
    });

    testChild = await testDb.createTestChild(testUser.id, {
      firstName: 'Sam',
      lastName: 'Student',
      birthdate: '2015-03-01',
      schoolId: testSchool.id,
      parentEmail: testUser.email,
    });
    const parentChildren = await storage.getChildrenByParentEmail(testUser.email);
    expect(parentChildren.some((c) => c.id === testChild.id)).toBe(true);

    const db = await getDb();
    const [sessionRow] = await db
      .insert(sessions)
      .values({
        schoolId: testSchool.id,
        name: `Spring Session ${uid}`,
        startDate: PROGRAM_START,
        endDate: PROGRAM_END,
        status: 'upcoming',
        enrollmentOpen: true,
        halfDayPrice: 150_000,
        fullDayPrice: totalCents,
        sortOrder: 0,
      })
      .returning();
    testSession = { id: sessionRow.id, name: sessionRow.name };
  }, 120000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function createSessionEnrollment(totalCost: number) {
    const enrollmentData = createEnrollmentDataSimple({
      schoolId: testSchool.id,
      classType: 'marketplace',
      classId: null,
      marketplaceClassId: null,
      sessionId: testSession.id,
      enrollmentVersion: 'v2',
      dayType: 'full_day',
      enrolledHalfDayPrice: 150_000,
      enrolledFullDayPrice: totalCents,
      childId: testChild.id,
      childName: `${testChild.firstName} ${testChild.lastName}`,
      className: `${testSession.name} - Full Day`,
      variantId: 'full_day',
      parentId: testUser.id,
      parentEmail: testUser.email,
      totalCost,
      totalPaid: 0,
      remainingBalance: totalCost,
      depositRequired: 0,
      paymentStatus: 'pending',
      paymentPlan: null,
      paymentFrequency: 'one_time',
      programStartDate: PROGRAM_START,
      programEndDate: PROGRAM_END,
      status: 'pending_payment',
      waitlistPosition: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
    });
    return storage.createProgramEnrollment(enrollmentData);
  }

  it('cart snapshot biweekly plan matches golden checkout schedule for session line', async () => {
    const enrollment = await createSessionEnrollment(totalCents);
    api.clearAuth();
    api.setTestUserEmail(testUser.email);

    const programStart = new Date(PROGRAM_START);
    const programEnd = new Date(PROGRAM_END);
    const anchor = checkoutAnchorDate();
    const expected = getExpectedBiweeklyCheckout({
      programStart,
      programEnd,
      totalAmountCents: totalCents,
      anchorDate: anchor,
    });

    const response = await api.post('/api/cart/snapshot', {
      items: [
        {
          id: `enrollment-${enrollment.id}`,
          enrollmentId: enrollment.id,
          sessionId: testSession.id,
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          remainingBalance: totalCents,
        },
      ],
      appliedPromoCode: null,
      creditsToApply: 0,
    });

    if (response.status !== 200) {
      throw new Error(`cart snapshot: expected 200, got ${response.status}: ${JSON.stringify(response.body)}`);
    }
    const biweekly = (response.body.paymentPlans || []).find((p: { id: string }) => p.id === 'biweekly');
    expect(biweekly).toBeDefined();
    assertBiweeklyPlanMatchesCheckout(
      {
        id: 'biweekly',
        amount: biweekly.amount,
        numberOfPayments: biweekly.numberOfPayments,
        totalAmount: biweekly.totalAmount,
        finalPaymentAmount: biweekly.finalPaymentAmount,
      },
      expected,
    );
  }, 60000);

  it('create-payment-intent biweekly creates PI and scheduled_payments aligned with contract', async () => {
    const enrollment = await createSessionEnrollment(totalCents);
    api.clearAuth();
    api.setTestUserEmail(testUser.email);

    const programStart = new Date(PROGRAM_START);
    const programEnd = new Date(PROGRAM_END);
    const anchor = checkoutAnchorDate();
    const expected = getExpectedBiweeklyCheckout({
      programStart,
      programEnd,
      totalAmountCents: totalCents,
      anchorDate: anchor,
    });
    const phases = buildBiweeklyCheckoutPhases(
      totalCents,
      programStart,
      programEnd,
      anchor,
    );
    expect(phases.length).toBe(expected.numberOfPayments);

    const response = await api.post('/api/stripe/create-payment-intent', {
      items: [sessionCartItem(enrollment, testSession, testChild, testUser, totalCents)],
      subtotal: totalCents,
      total: totalCents,
      discounts: {
        siblingDiscount: 0,
        freeAfterThree: 0,
        appliedDiscounts: [],
        totalDiscountAmount: 0,
      },
      parentEmail: testUser.email,
      paymentPlan: 'biweekly',
      paymentFrequency: 'biweekly',
    });

    if (response.status !== 200) {
      throw new Error(`create-payment-intent: expected 200, got ${response.status}: ${JSON.stringify(response.body)}`);
    }
    expect(response.body.clientSecret).toBeTruthy();
    expect(mockStripePaymentIntentsCreate).toHaveBeenCalled();
    const piAmount = (mockStripePaymentIntentsCreate as any).mock.calls[0][0].amount;
    expect(piAmount).toBe(expected.firstPaymentAmount);

    const scheduledBeforePay = await storage.getScheduledPaymentsByEnrollmentId(enrollment.id);
    expect(scheduledBeforePay.length).toBe(0);

    expect(response.body.paymentIntentId).toBeTruthy();

    const { StripePaymentPlanService } = await import(
      '../../services/stripe-payment-plans.js'
    );
    const planService = new StripePaymentPlanService(storage as any);
    const mockPi = {
      id: response.body.paymentIntentId as string,
      amount: piAmount,
      metadata: {
        enrollmentIds: JSON.stringify([enrollment.id]),
        parentEmail: testUser.email,
        paymentPlan: 'biweekly',
        paymentFrequency: 'biweekly',
        totalAmount: String(totalCents),
        installmentNumber: '1',
        totalInstallments: String(phases.length),
      },
    };
    const scheduledAfterPay =
      await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(mockPi);
    expect(scheduledAfterPay.length).toBe(phases.length - 1);

    const futurePhases = phases.slice(1);
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(
      scheduledAfterPay.map((r) => new Date(r.scheduledDate)),
      programEnd,
    );
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(
      futurePhases.map((p) => p.dueDate),
      programEnd,
    );

    const scheduledSum = scheduledAfterPay.reduce((s, r) => s + r.amount, 0);
    expect(scheduledSum + piAmount).toBe(totalCents);

    for (const row of scheduledAfterPay) {
      expect(row.status).toBe('pending');
      const meta = row.metadata as { autoPay?: boolean };
      expect(meta?.autoPay).toBe(true);
      expect(row.totalInstallments).toBe(phases.length);
    }

    const boundary = biweeklyInstallmentScheduleEndDate(programEnd);
    for (const row of scheduledAfterPay) {
      expect(new Date(row.scheduledDate).getTime()).toBeLessThanOrEqual(boundary.getTime());
    }
  }, 60000);

  it('uses latest session end when cart spans two sessions', async () => {
    const db = await getDb();
    const uid = nanoid(4);
    const [shortSession] = await db
      .insert(sessions)
      .values({
        schoolId: testSchool.id,
        name: `Short ${uid}`,
        startDate: '2030-01-01',
        endDate: '2030-04-01',
        status: 'upcoming',
        enrollmentOpen: true,
        fullDayPrice: 100_000,
        sortOrder: 1,
      })
      .returning();
    const [longSession] = await db
      .insert(sessions)
      .values({
        schoolId: testSchool.id,
        name: `Long ${uid}`,
        startDate: '2030-01-01',
        endDate: '2030-09-01',
        status: 'upcoming',
        enrollmentOpen: true,
        fullDayPrice: 100_000,
        sortOrder: 2,
      })
      .returning();

    const enrollShort = await storage.createProgramEnrollment(
      createEnrollmentDataSimple({
        schoolId: testSchool.id,
        classType: 'marketplace',
        sessionId: shortSession.id,
        enrollmentVersion: 'v2',
        dayType: 'full_day',
        childId: testChild.id,
        childName: `${testChild.firstName} ${testChild.lastName}`,
        className: 'Short',
        variantId: 'full_day',
        parentId: testUser.id,
        parentEmail: testUser.email,
        totalCost: 100_000,
        totalPaid: 0,
        remainingBalance: 100_000,
        programStartDate: '2030-01-01',
        programEndDate: '2030-04-01',
        status: 'pending_payment',
      }),
    );
    const enrollLong = await storage.createProgramEnrollment(
      createEnrollmentDataSimple({
        schoolId: testSchool.id,
        classType: 'marketplace',
        sessionId: longSession.id,
        enrollmentVersion: 'v2',
        dayType: 'full_day',
        childId: testChild.id,
        childName: `${testChild.firstName} ${testChild.lastName}`,
        className: 'Long',
        variantId: 'full_day',
        parentId: testUser.id,
        parentEmail: testUser.email,
        totalCost: 100_000,
        totalPaid: 0,
        remainingBalance: 100_000,
        programStartDate: '2030-01-01',
        programEndDate: '2030-09-01',
        status: 'pending_payment',
      }),
    );

    const combinedTotal = 200_000;
    api.clearAuth();
    api.setTestUserEmail(testUser.email);

    const anchor = checkoutAnchorDate();
    const expected = getExpectedBiweeklyCheckout({
      programStart: new Date('2030-01-01'),
      programEnd: new Date('2030-09-01'),
      totalAmountCents: combinedTotal,
      anchorDate: anchor,
    });

    const response = await api.post('/api/cart/snapshot', {
      items: [
        {
          enrollmentId: enrollShort.id,
          sessionId: shortSession.id,
          childId: testChild.id,
          childName: 'Sam Student',
          remainingBalance: 100_000,
        },
        {
          enrollmentId: enrollLong.id,
          sessionId: longSession.id,
          childId: testChild.id,
          childName: 'Sam Student',
          remainingBalance: 100_000,
        },
      ],
      appliedPromoCode: null,
      creditsToApply: 0,
    });

    if (response.status !== 200) {
      throw new Error(`multi-session snapshot: expected 200, got ${response.status}: ${JSON.stringify(response.body)}`);
    }
    const biweekly = (response.body.paymentPlans || []).find((p: { id: string }) => p.id === 'biweekly');
    expect(biweekly).toBeDefined();

    assertBiweeklyPlanMatchesCheckout(
      {
        id: 'biweekly',
        amount: biweekly.amount,
        numberOfPayments: biweekly.numberOfPayments,
        totalAmount: biweekly.totalAmount,
        finalPaymentAmount: biweekly.finalPaymentAmount,
      },
      expected,
    );
  }, 60000);
});
