import { describe, expect, it } from "@jest/globals";
import { TestDatabase } from "./helpers/testDatabase";
import { describeIntegration } from "./helpers/integrationDb";
import { storage } from "../storage";
import { getDb } from "../db";
import { programEnrollments } from "@shared/schema";

describeIntegration("getEnrollmentsByClassId marketplace seats", () => {
  const testDb = new TestDatabase();

  it("returns enrollments keyed only by marketplaceClassId", async () => {
    await testDb.cleanup();
    const unique = `mkt_${Date.now()}`;
    const admin = await testDb.createTestUser({
      email: `${unique}@test.com`,
      username: unique,
      name: "Marketplace Enroll Admin",
      role: "schoolAdmin",
    });
    const school = await testDb.createTestSchool(admin.id, { name: `Mkt ${unique}` });
    const parent = await testDb.createTestUser({
      email: `p_${unique}@test.com`,
      username: `p_${unique}`,
      name: "Mkt Parent",
      role: "parent",
      schoolId: school.id,
    });
    const child = await storage.createChild({
      parentId: parent.id,
      parentEmail: parent.email,
      firstName: "Mkt",
      lastName: "Kid",
      birthdate: "2018-01-01",
      gradeLevel: "1st",
      schoolId: school.id,
    });
    const cls = await testDb.createTestClass(school.id, {
      title: `Mkt Class ${unique}`,
      price: 1000,
      status: "upcoming",
    });
    const db = await getDb();
    await db.insert(programEnrollments).values({
      classType: "marketplace",
      parentId: parent.id,
      parentEmail: parent.email,
      schoolId: school.id,
      status: "enrolled",
      paymentPlan: "full_payment",
      paymentSystemVersion: "v2_stripe",
      paymentStatus: "completed",
      totalCost: 1000,
      totalPaid: 1000,
      remainingBalance: 0,
      depositRequired: 0,
      enrollmentDate: new Date(),
      childId: child.id,
      marketplaceClassId: cls.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: cls.title,
    });

    const rows = await storage.getEnrollmentsByClassId(cls.id);
    expect(rows.some((e) => e.childId === child.id && e.marketplaceClassId === cls.id)).toBe(true);
    expect(rows.every((e) => e.classId == null || e.classId === cls.id || e.marketplaceClassId === cls.id)).toBe(
      true,
    );

    await testDb.cleanup();
  });
});
