import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { describeIntegration } from "../../helpers/integrationDb";
import { testDb } from "../../helpers/testDatabase";
import { storage } from "../../../storage";
import type { InsertFamilyPaymentPlan } from "@shared/schema";

/**
 * F001 Phase 2 — family payment plans + price history storage (T005–T006).
 */
describeIntegration("F001 Phase 2: storage layer", () => {
  let parentId: number;
  let schoolId: number;
  let adminId: number;

  beforeAll(async () => {
    await testDb.cleanup();
    const admin = await testDb.createTestUser({
      email: "f001-phase2-admin@test.com",
      username: "f001_phase2_admin",
      role: "schoolAdmin",
    });
    adminId = admin.id;
    const school = await testDb.createTestSchool(adminId, {
      name: "F001 Phase 2 School",
    });
    schoolId = school.id;
    const parent = await testDb.createTestUser({
      email: "f001-phase2-parent@test.com",
      username: "f001_phase2_parent",
      role: "parent",
    });
    parentId = parent.id;
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it("creates and fetches a family payment plan", async () => {
    const planData: InsertFamilyPaymentPlan = {
      schoolId,
      parentId,
      totalAmountCents: 100_000,
      totalPaidCents: 0,
      remainingBalanceCents: 100_000,
      paymentFrequency: "biweekly",
      status: "active",
    };
    const created = await storage.createFamilyPaymentPlan(planData);
    expect(created.id).toBeGreaterThan(0);
    expect(created.remainingBalanceCents).toBe(100_000);

    const fetched = await storage.getFamilyPaymentPlan(created.id);
    expect(fetched?.parentId).toBe(parentId);

    const byParent = await storage.getFamilyPaymentPlansByParent(parentId, schoolId);
    expect(byParent.some((p) => p.id === created.id)).toBe(true);
  });

  it("acquire and release family plan lock (Safeguard 2)", async () => {
    const plan = await storage.createFamilyPaymentPlan({
      schoolId,
      parentId,
      totalAmountCents: 50_000,
      totalPaidCents: 0,
      remainingBalanceCents: 50_000,
      paymentFrequency: "monthly",
      status: "active",
    });

    expect(await storage.acquireFamilyPlanLock(plan.id, "op-a")).toBe(true);
    expect(await storage.acquireFamilyPlanLock(plan.id, "op-b")).toBe(false);
    expect(await storage.releaseFamilyPlanLock(plan.id, "op-a")).toBe(true);
    expect(await storage.acquireFamilyPlanLock(plan.id, "op-b")).toBe(true);
  });

  it("records and reads enrollment price history", async () => {
    const cls = await testDb.createTestClass(schoolId);
    const child = await testDb.createTestChild(parentId, { schoolId });
    const enrollment = await testDb.createTestEnrollment(cls.id, child.id, {
      parentId,
      schoolId,
      totalCost: 25_000,
      remainingBalance: 25_000,
    });

    const entry = await storage.createPriceHistoryEntry({
      enrollmentId: enrollment.id,
      changeType: "initial",
      previousDayType: null,
      newDayType: "half_day",
      previousPriceCents: 0,
      newPriceCents: 25_000,
      differenceCents: 25_000,
      effectiveDate: "2026-09-01",
      changedBy: adminId,
    });
    expect(entry.id).toBeGreaterThan(0);

    const history = await storage.getPriceHistory(enrollment.id);
    expect(history).toHaveLength(1);
    expect(history[0].changeType).toBe("initial");
  });

  it("getTotalPaidForEnrollment sums completed payments referencing enrollment", async () => {
    const cls = await testDb.createTestClass(schoolId);
    const child = await testDb.createTestChild(parentId, { schoolId });
    const enrollment = await testDb.createTestEnrollment(cls.id, child.id, {
      parentId,
      schoolId,
      totalCost: 10_000,
      remainingBalance: 5_000,
    });

    await testDb.createTestPayment("f001-phase2-parent@test.com", {
      schoolId,
      parentId,
      amount: 5_000,
      status: "completed",
      enrollmentIds: [enrollment.id],
    });

    const totalPaid = await storage.getTotalPaidForEnrollment(enrollment.id);
    expect(totalPaid).toBe(5_000);
  });
});
