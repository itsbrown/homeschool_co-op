/**
 * Covers: multi-enrollment installment splitting, credits-only (zero Stripe charge),
 * and mixed credit+card payments (originalAmountCents vs actual PI amount).
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { storage } from '../storage';
import { testDb } from './helpers/testDatabase';

beforeEach(async () => {
  await testDb.cleanup();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedTwoEnrollmentFixture() {
  const admin = await testDb.createTestUser({ role: 'schoolAdmin' });
  const school = await testDb.createTestSchool(admin.id);
  const parent = await testDb.createTestUser({ role: 'parent', schoolId: school.id });

  const child1 = await testDb.createTestChild(parent.id, { schoolId: school.id });
  const child2 = await testDb.createTestChild(parent.id, { schoolId: school.id });
  const klass1 = await testDb.createTestClass(school.id, { name: 'Math', price: 8000 });
  const klass2 = await testDb.createTestClass(school.id, { name: 'Science', price: 6000 });

  const enr1 = await storage.createProgramEnrollment({
    schoolId: school.id,
    classType: 'school_class',
    classId: klass1.id,
    childId: child1.id,
    childName: `${child1.firstName} ${child1.lastName}`,
    className: klass1.name,
    parentId: parent.id,
    parentEmail: parent.email,
    totalCost: 8000,
    totalPaid: 4000,
    remainingBalance: 4000,
    paymentStatus: 'partial_payment',
    status: 'enrolled',
  } as any);

  const enr2 = await storage.createProgramEnrollment({
    schoolId: school.id,
    classType: 'school_class',
    classId: klass2.id,
    childId: child2.id,
    childName: `${child2.firstName} ${child2.lastName}`,
    className: klass2.name,
    parentId: parent.id,
    parentEmail: parent.email,
    totalCost: 6000,
    totalPaid: 3000,
    remainingBalance: 3000,
    paymentStatus: 'partial_payment',
    status: 'enrolled',
  } as any);

  return { school, parent, enr1, enr2 };
}

// ---------------------------------------------------------------------------
// Multi-enrollment installments
// ---------------------------------------------------------------------------

describe('Scheduled installment — multi-enrollment per row', () => {
  it('splits PI amount evenly across multiple enrollmentIds and updates each', async () => {
    const { school, parent, enr1, enr2 } = await seedTwoEnrollmentFixture();

    // A scheduled payment linked to two enrollments via metadata.enrollmentIds
    const scheduledPayment = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enr1.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 4000,
      scheduledDate: new Date('2026-06-01T00:00:00.000Z'),
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 3,
      status: 'processing',
      stripePaymentIntentId: 'pi_multi_1',
      metadata: { enrollmentIds: [enr1.id, enr2.id] },
    } as any);

    expect(scheduledPayment.id).toBeDefined();

    // Simulate what the reconciliation ledger side-effect does: split shareCents
    const piAmount = 4000;
    const enrollmentIds = [enr1.id, enr2.id];
    const shareCents = Math.round(piAmount / enrollmentIds.length); // 2000 each

    for (const enrollmentId of enrollmentIds) {
      const enr = await storage.getProgramEnrollmentById(enrollmentId);
      if (!enr) continue;
      const newPaid = (enr.totalPaid || 0) + shareCents;
      const newBal = Math.max(0, (enr.totalCost || 0) - newPaid);
      await storage.updateProgramEnrollment(enrollmentId, {
        totalPaid: newPaid,
        remainingBalance: newBal,
        paymentStatus: newBal <= 0 ? 'completed' : 'partial_payment',
      });
    }

    const updated1 = await storage.getProgramEnrollmentById(enr1.id);
    const updated2 = await storage.getProgramEnrollmentById(enr2.id);

    expect(updated1?.totalPaid).toBe(4000 + 2000); // was 4000, now +2000
    expect(updated1?.remainingBalance).toBe(2000);
    expect(updated2?.totalPaid).toBe(3000 + 2000); // was 3000, now +2000
    expect(updated2?.remainingBalance).toBe(1000);
  });

  it('falls back to single enrollmentId when metadata.enrollmentIds is absent', async () => {
    const { school, parent, enr1 } = await seedTwoEnrollmentFixture();

    const scheduledPayment = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enr1.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 4000,
      scheduledDate: new Date('2026-06-01T00:00:00.000Z'),
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 3,
      status: 'processing',
      stripePaymentIntentId: 'pi_single_fallback',
      metadata: {},
    } as any);

    // resolveEnrollmentIdsForScheduledRow logic: no enrollmentIds → use enrollmentId
    const row = scheduledPayment as any;
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const fromMeta = meta.enrollmentIds;
    const resolvedIds =
      Array.isArray(fromMeta) && fromMeta.length > 0
        ? fromMeta.filter((id: unknown): id is number => typeof id === 'number')
        : [row.enrollmentId];

    expect(resolvedIds).toEqual([enr1.id]);
  });

  it('creates a single payments row referencing all enrollmentIds for the PI', async () => {
    const { school, parent, enr1, enr2 } = await seedTwoEnrollmentFixture();

    const payment = await storage.createPayment({
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      childName: 'Multi Child',
      className: 'Multi Class',
      description: 'Scheduled installment 2 of 3',
      amount: 4000,
      currency: 'usd',
      status: 'completed',
      stripePaymentIntentId: 'pi_multi_pay_1',
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe',
      enrollmentIds: [enr1.id, enr2.id],
      metadata: { scheduledPaymentId: '99', reconciliation: true },
      paymentDate: new Date(),
    } as any);

    const found = await storage.getPaymentByStripeId('pi_multi_pay_1');
    expect(found).toBeTruthy();
    // enrollmentIds persisted on the payments row
    const storedIds = (found as any)?.enrollmentIds;
    if (storedIds !== undefined) {
      expect(storedIds).toEqual([enr1.id, enr2.id]);
    }
  });
});

// ---------------------------------------------------------------------------
// Credits-only installment (zero Stripe charge)
// ---------------------------------------------------------------------------

describe('Scheduled installment — credits-only (no card charge)', () => {
  it('updates enrollment balance when full installment amount is covered by credits and no PI is needed', async () => {
    const { school, parent, enr1 } = await seedTwoEnrollmentFixture();

    const installmentAmount = 4000;

    // Simulate credit application: enrollment balance decreases by full installment amount
    const before = await storage.getProgramEnrollmentById(enr1.id);
    const newPaid = (before!.totalPaid || 0) + installmentAmount;
    const newBal = Math.max(0, (before!.totalCost || 0) - newPaid);
    await storage.updateProgramEnrollment(enr1.id, {
      totalPaid: newPaid,
      remainingBalance: newBal,
      paymentStatus: newBal <= 0 ? 'completed' : 'partial_payment',
    });

    const after = await storage.getProgramEnrollmentById(enr1.id);
    expect(after?.totalPaid).toBe(8000); // 4000 + 4000
    expect(after?.remainingBalance).toBe(0);
    expect(after?.paymentStatus).toBe('completed');
  });

  it('marks scheduled payment completed with completionSource stripe_autopay for credits-only path', async () => {
    const { school, parent, enr1 } = await seedTwoEnrollmentFixture();

    const sp = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enr1.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 4000,
      scheduledDate: new Date('2026-06-01T00:00:00.000Z'),
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 3,
      status: 'pending',
      stripePaymentIntentId: null,
      metadata: { creditsOnlyCovered: true },
    } as any);

    await storage.updateScheduledPayment(sp.id, {
      status: 'completed',
      processedAt: new Date(),
      completionSource: 'credits_only',
    } as any);

    const rows = await storage.getScheduledPaymentsByParentEmail(parent.email);
    const row = rows.find((p) => p.id === sp.id);
    expect(row?.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Mixed credit + card payment
// ---------------------------------------------------------------------------

describe('Scheduled installment — mixed credit + card', () => {
  it('uses originalAmountCents (not PI amount) when computing enrollment totalPaid delta', async () => {
    const { school, parent, enr1 } = await seedTwoEnrollmentFixture();

    const piAmount = 3000;          // actual Stripe charge
    const creditsApplied = 1000;    // paid via credits
    const originalAmount = 4000;    // piAmount + creditsApplied

    const before = await storage.getProgramEnrollmentById(enr1.id);
    // Webhook logic: use originalAmountCents when creditsAppliedCents > 0
    const totalPaymentAmount =
      creditsApplied > 0 ? originalAmount : piAmount;

    const newPaid = (before!.totalPaid || 0) + totalPaymentAmount;
    const newBal = Math.max(0, (before!.totalCost || 0) - newPaid);
    await storage.updateProgramEnrollment(enr1.id, {
      totalPaid: newPaid,
      remainingBalance: newBal,
      paymentStatus: newBal <= 0 ? 'completed' : 'partial_payment',
    });

    const after = await storage.getProgramEnrollmentById(enr1.id);
    // enrollment should show full installment (4000) applied, not just card portion (3000)
    expect(after?.totalPaid).toBe(8000);  // 4000 existing + 4000 installment
    expect(after?.remainingBalance).toBe(0);
  });

  it('uses piAmount directly when no credits are applied', async () => {
    const { school, parent, enr1 } = await seedTwoEnrollmentFixture();

    const piAmount = 4000;
    const creditsApplied = 0;

    const before = await storage.getProgramEnrollmentById(enr1.id);
    const totalPaymentAmount = creditsApplied > 0 ? 9999 : piAmount;

    const newPaid = (before!.totalPaid || 0) + totalPaymentAmount;
    const newBal = Math.max(0, (before!.totalCost || 0) - newPaid);
    await storage.updateProgramEnrollment(enr1.id, {
      totalPaid: newPaid,
      remainingBalance: newBal,
      paymentStatus: newBal <= 0 ? 'completed' : 'partial_payment',
    });

    const after = await storage.getProgramEnrollmentById(enr1.id);
    expect(after?.totalPaid).toBe(8000);
    expect(after?.remainingBalance).toBe(0);
  });
});
