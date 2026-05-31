import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { describeIntegration } from '../helpers/integrationDb';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';
import {
  findMissingCreditLedgerEntries,
  repairAllMissingCreditLedgerEntries,
} from '../../lib/credit-ledger-repair';

describeIntegration('Integration: credit ledger repair', () => {
  beforeEach(async () => {
    await testDb.cleanup();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('finds and repairs credits-only scheduled payment missing usage logs', async () => {
    const admin = await testDb.createTestUser({ email: 'clr-admin@test.com', role: 'schoolAdmin' });
    const school = await testDb.createTestSchool(admin.id, { name: 'CLR School' });
    const parent = await testDb.createTestUser({
      email: 'clr-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });

    const credit = await storage.createCredit({
      userId: parent.id,
      schoolId: school.id,
      creditType: 'manual',
      sourceType: 'test',
      creditAmountCents: 4000,
      usedAmountCents: 0,
      status: 'approved',
      title: 'Repair integration credit',
    } as any);

    const child = await testDb.createTestChild(parent.id, { schoolId: school.id });
    const klass = await testDb.createTestClass(school.id, { price: 4000 });
    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: 'Test Child',
      className: klass.name,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 4000,
      totalPaid: 0,
      remainingBalance: 4000,
      paymentStatus: 'pending',
      status: 'enrolled',
    } as any);

    const sp = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 4000,
      scheduledDate: new Date(),
      frequency: 'monthly',
      installmentNumber: 1,
      totalInstallments: 1,
      status: 'completed',
      completionSource: 'credits_only',
      processedAt: new Date(),
      stripePaymentIntentId: 'credit_test_repair_1',
      metadata: {},
    } as any);

    await storage.updateProgramEnrollment(enrollment.id, {
      totalPaid: 4000,
      remainingBalance: 0,
      paymentStatus: 'completed',
    } as any);

    const missingBefore = await findMissingCreditLedgerEntries(school.id);
    expect(missingBefore.some((m) => m.scheduledPaymentId === sp.id)).toBe(true);

    const dryRun = await repairAllMissingCreditLedgerEntries({
      schoolId: school.id,
      dryRun: true,
      limit: 50,
    });
    expect(dryRun.found).toBeGreaterThan(0);

    let creditBefore = await storage.getCreditById(credit.id);
    expect(creditBefore?.usedAmountCents).toBe(0);

    const applied = await repairAllMissingCreditLedgerEntries({
      schoolId: school.id,
      dryRun: false,
      limit: 50,
    });
    expect(applied.repaired).toBeGreaterThan(0);

    creditBefore = await storage.getCreditById(credit.id);
    expect(creditBefore?.usedAmountCents).toBe(4000);

    const logs = await storage.getUnifiedCreditUsageLogsByScheduledPaymentId(sp.id);
    expect(logs.reduce((s, l) => s + (l.amountCents || 0), 0)).toBe(4000);

    const missingAfter = await findMissingCreditLedgerEntries(school.id);
    expect(missingAfter.some((m) => m.scheduledPaymentId === sp.id)).toBe(false);
  });
});
