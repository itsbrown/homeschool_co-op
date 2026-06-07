import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import { testDb } from '../helpers/testDatabase';
import { api, resetApi } from '../helpers/apiHelpers';
import { storage } from '../../storage';

/**
 * DB-backed integration: parent `POST /api/scheduled-payments/pay` claim semantics.
 *
 * Run (requires Postgres with app schema):
 *   TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/asa_test" npx jest --config jest.integration.config.cjs server/tests/integration/scheduled-payment-pay-claim.test.ts --runInBand
 */
const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const mockStripePaymentIntentsCreate = jest.fn();
const mockStripePaymentIntentsRetrieve = jest.fn();
const mockStripePaymentIntentsCancel = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
  getStripePublishableKey: jest.fn(async () => 'pk_test_mock'),
}));

jest.mock('../../lib/stripe-search-helpers', () => {
  const actual = jest.requireActual('../../lib/stripe-search-helpers') as object;
  return {
    ...actual,
    resolveStripeCustomerIdsForParentEmail: jest.fn(async () => ['cus_test_parent']),
  };
});

async function loadScheduledRow(parentEmail: string, id: number) {
  const rows = await storage.getScheduledPaymentsByParentEmail(parentEmail);
  return rows.find((r) => r.id === id);
}

describeWithDb('Integration: scheduled-payments /pay parent claim', () => {
  let parent: { id: number; email: string };
  let scheduledPaymentId: number;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    resetApi();
    jest.restoreAllMocks();
    await testDb.cleanup();

    const uid = nanoid(8).toLowerCase();

    mockStripePaymentIntentsCreate.mockReset();
    mockStripePaymentIntentsCreate.mockResolvedValue({
      id: 'pi_test_sched_claim',
      client_secret: 'pi_test_sched_claim_secret',
      status: 'requires_payment_method',
      amount: 5000,
      currency: 'usd',
    });
    mockStripePaymentIntentsRetrieve.mockReset();
    mockStripePaymentIntentsCancel.mockReset();
    mockStripePaymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test_sched_claim',
      client_secret: 'pi_test_sched_claim_secret',
      status: 'requires_payment_method',
      amount: 5000,
      currency: 'usd',
      metadata: { parentEmail: parent.email },
      customer: 'cus_test_parent',
    });
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      paymentIntents: {
        create: mockStripePaymentIntentsCreate,
        retrieve: mockStripePaymentIntentsRetrieve,
        cancel: mockStripePaymentIntentsCancel,
      },
    });

    const admin = await testDb.createTestUser({
      username: `sp_claim_admin_${uid}`,
      email: `sp_claim_admin_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'SP Claim Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `SP Claim School ${uid}`,
      registrationCode: `SPCL${uid.toUpperCase().slice(0, 4)}`,
    });

    parent = await testDb.createTestUser({
      username: `sp_claim_parent_${uid}`,
      email: `sp_claim_parent_${uid}@test.com`,
      password: 'TestPassword123',
      name: 'SP Claim Parent',
      role: 'parent',
      schoolId: school.id,
    });

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Sam',
      lastName: 'Student',
      dateOfBirth: new Date('2015-01-01'),
      schoolId: school.id,
      parentEmail: parent.email,
    });

    const category = await testDb.createTestCategory(school.id, {
      name: `SP Claim Category ${uid}`,
    });
    const klass = await testDb.createTestClass(school.id, {
      title: `SP Claim Class ${uid}`,
      description: 'scheduled pay claim',
      category: category.name,
      categoryId: category.id,
      price: 10000,
      status: 'active',
      type: 'school_admin',
    });

    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 10000,
      totalPaid: 5000,
      remainingBalance: 5000,
      paymentStatus: 'partial_payment',
      status: 'enrolled',
    } as any);

    const scheduledDate = new Date('2026-06-01T00:00:00.000Z');
    const sp = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      scheduledDate,
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 4,
      status: 'pending',
      metadata: {},
    } as any);

    scheduledPaymentId = sp.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function payBody() {
    return {
      paymentId: scheduledPaymentId,
      description: 'Installment 2/4',
      applyCredits: false,
      expectedChargeAmount: 5000,
    };
  }

  it('first /pay succeeds and leaves row processing with parent_manual and a PI id', async () => {
    api.clearAuth();
    api.setTestUserEmail(parent.email);

    const res = await api.post('/api/scheduled-payments/pay', payBody());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('stripe');
    expect(res.body.clientSecret).toBeTruthy();

    const row = await loadScheduledRow(parent.email, scheduledPaymentId);
    expect(row).toBeDefined();
    expect(String(row!.status)).toBe('processing');
    expect((row as any).chargedBy).toBe('parent_manual');
    expect(row!.stripePaymentIntentId).toBe('pi_test_sched_claim');
  });

  it('second /pay for the same installment resumes the in-flight PI', async () => {
    api.clearAuth();
    api.setTestUserEmail(parent.email);

    const first = await api.post('/api/scheduled-payments/pay', payBody());
    expect(first.status).toBe(200);

    const second = await api.post('/api/scheduled-payments/pay', payBody());
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.resumed).toBe(true);
    expect(second.body.clientSecret).toBe('pi_test_sched_claim_secret');
    expect(mockStripePaymentIntentsCreate).toHaveBeenCalledTimes(1);
  });

  it('releases claim when Stripe paymentIntents.create fails', async () => {
    mockStripePaymentIntentsCreate.mockRejectedValueOnce(new Error('stripe_create_failed'));

    api.clearAuth();
    api.setTestUserEmail(parent.email);

    const res = await api.post('/api/scheduled-payments/pay', payBody());
    expect(res.status).toBe(500);

    const row = await loadScheduledRow(parent.email, scheduledPaymentId);
    expect(row).toBeDefined();
    expect(String(row!.status)).toBe('pending');
    expect((row as any).chargedBy).toBeNull();
    expect(row!.stripePaymentIntentId).toBeNull();
  });
});
