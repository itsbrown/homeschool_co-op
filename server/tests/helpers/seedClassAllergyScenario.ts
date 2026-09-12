import { nanoid } from "nanoid";
import { getDb } from "../../db";
import { programEnrollments, userRoles } from "@shared/schema";
import { storage } from "../../storage";
import { notifyClassParentsOfNewAllergens } from "../../lib/class-allergy-alerts";
import { extractSevereAllergens } from "@shared/class-allergy-alerts";
import type { TestDatabase } from "./testDatabase";

export type ClassAllergySeedResult = {
  admin: { id: number; email: string; password: string };
  parentA: { id: number; email: string; password: string };
  parentB: { id: number; email: string; password: string };
  school: { id: number; name: string };
  class: { id: number; title: string };
  childA: { id: number; firstName: string; lastName: string; allergies: string };
  childB: { id: number; firstName: string; lastName: string };
};

export async function seedClassAllergyScenario(
  testDb: TestDatabase,
  options: { adminPassword?: string; parentPassword?: string; notify?: boolean } = {},
): Promise<ClassAllergySeedResult> {
  const uniqueId = nanoid(8).toLowerCase();
  const adminPassword = options.adminPassword ?? "TestPassword123!";
  const parentPassword = options.parentPassword ?? "TestPassword123!";

  const admin = await testDb.createTestUser({
    email: `allergy_admin_${uniqueId}@test.com`,
    username: `allergyadmin_${uniqueId}`,
    name: "Allergy Admin",
    role: "schoolAdmin",
    password: adminPassword,
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Allergy School ${uniqueId}`,
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  const parentA = await testDb.createTestUser({
    email: `allergy_parent_a_${uniqueId}@test.com`,
    username: `allergya_${uniqueId}`,
    name: "Allergy Parent A",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
  });
  const parentB = await testDb.createTestUser({
    email: `allergy_parent_b_${uniqueId}@test.com`,
    username: `allergyb_${uniqueId}`,
    name: "Allergy Parent B",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
  });

  const db = await getDb();
  if (!db) throw new Error("Postgres required for class allergy seed");

  for (const roleRow of [
    { userId: admin.id, role: "schoolAdmin" as const, schoolId: school.id, isPrimary: true },
    { userId: parentA.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
    { userId: parentB.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
  ]) {
    try {
      await db.insert(userRoles).values(roleRow);
    } catch {
      /* role may already exist from createUser */
    }
  }

  const classTitle = `Yankee Doodle ${uniqueId}`;
  const cls = await testDb.createTestClass(school.id, {
    title: classTitle,
    description: "Class for allergy alert E2E",
    category: "academic",
    price: 0,
    isPublished: true,
    enrollmentOpen: true,
    type: "school_admin",
    status: "active",
  });

  const childA = await testDb.createTestChild(parentA.id, {
    firstName: "Jordan",
    lastName: "Allergen",
    birthdate: "2017-04-01",
    gradeLevel: "2nd Grade",
    schoolId: school.id,
    parentEmail: parentA.email,
    allergies: "Peanuts",
  });
  const childB = await testDb.createTestChild(parentB.id, {
    firstName: "Riley",
    lastName: "Classmate",
    birthdate: "2017-06-15",
    gradeLevel: "2nd Grade",
    schoolId: school.id,
    parentEmail: parentB.email,
  });

  const enroll = async (args: {
    childId: number;
    childName: string;
    parentId: number;
    parentEmail: string;
  }) => {
    await db.insert(programEnrollments).values({
      schoolId: school.id,
      classType: "marketplace",
      marketplaceClassId: cls.id,
      childId: args.childId,
      childName: args.childName,
      className: classTitle,
      parentId: args.parentId,
      parentEmail: args.parentEmail,
      totalCost: 0,
      totalPaid: 0,
      remainingBalance: 0,
      depositRequired: 0,
      paymentStatus: "completed",
      status: "enrolled",
      enrollmentDate: new Date(),
    });
  };

  await enroll({
    childId: childA.id,
    childName: `${childA.firstName} ${childA.lastName}`,
    parentId: parentA.id,
    parentEmail: parentA.email,
  });
  await enroll({
    childId: childB.id,
    childName: `${childB.firstName} ${childB.lastName}`,
    parentId: parentB.id,
    parentEmail: parentB.email,
  });

  if (options.notify !== false) {
    await notifyClassParentsOfNewAllergens({
      classId: cls.id,
      allergens: extractSevereAllergens(childA.allergies),
      schoolId: school.id,
    });
  }

  return {
    admin: { id: admin.id, email: admin.email, password: adminPassword },
    parentA: { id: parentA.id, email: parentA.email, password: parentPassword },
    parentB: { id: parentB.id, email: parentB.email, password: parentPassword },
    school: { id: school.id, name: school.name },
    class: { id: cls.id, title: classTitle },
    childA: {
      id: childA.id,
      firstName: childA.firstName,
      lastName: childA.lastName,
      allergies: String(childA.allergies || "Peanuts"),
    },
    childB: { id: childB.id, firstName: childB.firstName, lastName: childB.lastName },
  };
}
