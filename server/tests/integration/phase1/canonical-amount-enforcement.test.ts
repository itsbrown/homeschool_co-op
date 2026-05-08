import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { api } from '../../helpers/apiHelpers';
import { testDb } from '../../helpers/testDatabase';

const mockCreateEducationalPaymentPlan = jest.fn();

jest.mock('../../../services/stripe-payment-plans', () => ({
  StripePaymentPlanService: jest.fn().mockImplementation(() => ({
    createEducationalPaymentPlan: mockCreateEducationalPaymentPlan,
  })),
}));

describe('Integration: Canonical amount enforcement', () => {
  let parentUser: any;
  let school: any;
  let child: any;
  let klass: any;

  beforeAll(async () => {
    await api.init();
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    mockCreateEducationalPaymentPlan.mockReset();
    mockCreateEducationalPaymentPlan.mockResolvedValue({
      paymentIntent: {
        id: 'pi_canonical_amount_test',
        client_secret: 'pi_canonical_amount_test_secret',
      },
      scheduledPayments: [],
    });

    const admin = await testDb.createTestUser({
      email: 'canonical-admin@test.com',
      role: 'schoolAdmin',
      firstName: 'Canonical',
      lastName: 'Admin',
    });

    school = await testDb.createTestSchool(admin.id, {
      name: 'Canonical Amount School',
      registrationCode: 'CANONICAL123',
      membershipFeeAmount: 17500,
    });

    parentUser = await testDb.createTestUser({
      email: 'canonical-parent@test.com',
      role: 'parent',
      firstName: 'Canonical',
      lastName: 'Parent',
      schoolId: school.id,
    });

    child = await testDb.createTestChild(parentUser.id, {
      firstName: 'Amount',
      lastName: 'Child',
      schoolId: school.id,
      dateOfBirth: new Date('2016-01-01'),
    });

    klass = await testDb.createTestClass(school.id, {
      name: 'Canonical Math',
      description: 'Amount source of truth test class',
      price: 12345,
    });

    await api.loginAsUser(parentUser.email);
  });

  function baseCartPayload() {
    return {
      items: [
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: klass.id,
          className: klass.name,
          classType: 'school',
          price: 12345,
        },
      ],
      subtotal: 12345,
      discounts: [],
      parentEmail: parentUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
    };
  }

  function totalAmountPassedToPlanService(): number {
    const firstCall = mockCreateEducationalPaymentPlan.mock.calls[0];
    expect(firstCall).toBeDefined();
    return firstCall[0].totalAmount;
  }

  function hasClientTotalMismatchWarning(consoleWarnSpy: jest.SpiedFunction<typeof console.warn>): boolean {
    return consoleWarnSpy.mock.calls.some((call) =>
      typeof call[0] === 'string' &&
      call[0].includes('Client total mismatch ignored in favor of server-computed amount')
    );
  }

  it('uses the same authoritative amount when client total matches', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 12345,
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  it('ignores mismatched client total and charges server-derived amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 999,
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('handles malformed client total without letting it control charge amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 'abc',
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('handles absent client total and still charges server-derived amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = baseCartPayload();

    const response = await api.post('/api/stripe/create-payment-intent', payload);

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  it('uses server-derived sum for multi-item carts when client total is mismatched', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const secondClass = await testDb.createTestClass(school.id, {
      name: 'Canonical Science',
      description: 'Second class for multi-item amount authority',
      price: 2000,
    });

    const response = await api.post('/api/stripe/create-payment-intent', {
      items: [
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: klass.id,
          className: klass.name,
          classType: 'school',
          price: 12345,
        },
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: secondClass.id,
          className: secondClass.name,
          classType: 'school',
          price: 2000,
        },
      ],
      subtotal: 14345,
      total: 50, // Deliberately wrong client total
      discounts: [],
      parentEmail: parentUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(14345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('uses server-derived enrollment + membership total when client total is mismatched', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 1, // Deliberately wrong client total
      membership: {
        amount: 17500,
        schoolId: school.id,
        year: new Date().getFullYear(),
      },
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345 + 17500);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });
});
