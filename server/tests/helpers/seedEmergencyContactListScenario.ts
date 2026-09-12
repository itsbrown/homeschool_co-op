import { nanoid } from "nanoid";
import { getDb } from "../../db";
import { programEnrollments, userRoles } from "@shared/schema";
import { storage } from "../../storage";
import type { TestDatabase } from "./testDatabase";

export type EmergencyContactListSeedResult = {
  admin: { id: number; email: string; password: string };
  parentA: { id: number; email: string; password: string };
  parentB: { id: number; email: string; password: string };
  school: { id: number; name: string };
  classA: { id: number; title: string };
  classB: { id: number; title: string };
  childA: { id: number; firstName: string; lastName: string };
  childB: { id: number; firstName: string; lastName: string };
  contacts: {
    userTable: { name: string; phone: string };
    extra: { name: string; phone: string };
  };
};

export async function seedEmergencyContactListScenario(
  testDb: TestDatabase,
  options: { adminPassword?: string; parentPassword?: string } = {},
): Promise<EmergencyContactListSeedResult> {
  const uniqueId = nanoid(8).toLowerCase();
  const adminPassword = options.adminPassword ?? "TestPassword123!";
  const parentPassword = options.parentPassword ?? "TestPassword123!";

  const admin = await testDb.createTestUser({
    email: `ec_admin_${uniqueId}@test.com`,
    username: `ecadmin_${uniqueId}`,
    name: "Emergency List Admin",
    role: "schoolAdmin",
    password: adminPassword,
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Emergency List School ${uniqueId}`,
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  const parentA = await testDb.createTestUser({
    email: `ec_parent_a_${uniqueId}@test.com`,
    username: `ecparenta_${uniqueId}`,
    name: "Emergency Parent A",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
    phone: "555-0100",
  });
  const parentB = await testDb.createTestUser({
    email: `ec_parent_b_${uniqueId}@test.com`,
    username: `ecparentb_${uniqueId}`,
    name: "Emergency Parent B",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
    phone: "555-0200",
  });

  await storage.updateUser(parentA.id, {
    emergencyContactFirstName: "Aunt",
    emergencyContactLastName: "May",
    emergencyContactPhone: "555-111-1111",
    emergencyContactRelationship: "Aunt",
  });

  await storage.createEmergencyContact({
    userId: parentB.id,
    firstName: "Grandpa",
    lastName: "Lee",
    phoneNumber: "555-222-2222",
    relationship: "Grandfather",
    email: `grandpa_${uniqueId}@test.com`,
    isAuthorizedPickup: true,
  });

  const db = await getDb();
  if (!db) throw new Error("Postgres required for emergency contact list seed");

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

  const classATitle = `Yankee Doodle ${uniqueId}`;
  const classBTitle = `Tycoons ${uniqueId}`;
  const classA = await testDb.createTestClass(school.id, {
    title: classATitle,
    description: "Class A for emergency contact lists",
    category: "academic",
    price: 0,
    isPublished: true,
    enrollmentOpen: true,
    type: "school_admin",
    status: "active",
  });
  const classB = await testDb.createTestClass(school.id, {
    title: classBTitle,
    description: "Class B for emergency contact lists",
    category: "academic",
    price: 0,
    isPublished: true,
    enrollmentOpen: true,
    type: "school_admin",
    status: "active",
  });

  const childA = await testDb.createTestChild(parentA.id, {
    firstName: "Maya",
    lastName: `Rivera${uniqueId}`,
    birthdate: "2017-04-01",
    gradeLevel: "2nd Grade",
    schoolId: school.id,
    parentEmail: parentA.email,
  });
  const childB = await testDb.createTestChild(parentB.id, {
    firstName: "Liam",
    lastName: `Chen${uniqueId}`,
    birthdate: "2016-06-15",
    gradeLevel: "3rd Grade",
    schoolId: school.id,
    parentEmail: parentB.email,
  });

  const enroll = async (args: {
    classId: number;
    className: string;
    childId: number;
    childName: string;
    parentId: number;
    parentEmail: string;
  }) => {
    await db.insert(programEnrollments).values({
      schoolId: school.id,
      classType: "marketplace",
      marketplaceClassId: args.classId,
      childId: args.childId,
      childName: args.childName,
      className: args.className,
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
    classId: classA.id,
    className: classATitle,
    childId: childA.id,
    childName: `${childA.firstName} ${childA.lastName}`,
    parentId: parentA.id,
    parentEmail: parentA.email,
  });
  await enroll({
    classId: classB.id,
    className: classBTitle,
    childId: childB.id,
    childName: `${childB.firstName} ${childB.lastName}`,
    parentId: parentB.id,
    parentEmail: parentB.email,
  });

  return {
    admin: { id: admin.id, email: admin.email, password: adminPassword },
    parentA: { id: parentA.id, email: parentA.email, password: parentPassword },
    parentB: { id: parentB.id, email: parentB.email, password: parentPassword },
    school: { id: school.id, name: school.name },
    classA: { id: classA.id, title: classA.title },
    classB: { id: classB.id, title: classB.title },
    childA: { id: childA.id, firstName: childA.firstName, lastName: childA.lastName },
    childB: { id: childB.id, firstName: childB.firstName, lastName: childB.lastName },
    contacts: {
      userTable: { name: "Aunt May", phone: "555-111-1111" },
      extra: { name: "Grandpa Lee", phone: "555-222-2222" },
    },
  };
}
