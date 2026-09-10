import { nanoid } from "nanoid";
import { getDb } from "../../db";
import { schools, userRoles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { TestDatabase } from "./testDatabase";
import { ensureFamilyAccessCodesSchema } from "../../lib/ensure-family-access-codes-schema";
import { upsertParentAccessCode } from "../../lib/family-access-codes";
import { normalizeSchoolFeatures } from "../../lib/school-features";

export type FamilyAccessCodeSeedResult = {
  admin: { id: number; email: string; password: string };
  superAdmin: { id: number; email: string; password: string };
  parent: { id: number; email: string; password: string };
  parentB: { id: number; email: string; password: string };
  school: { id: number; name: string };
  keyedCampus: { id: number; name: string };
  otherCampus: { id: number; name: string };
  otherSchool: {
    admin: { id: number; email: string; password: string };
    school: { id: number };
    parent: { id: number; email: string };
  };
  assignedCode: string;
};

export async function seedFamilyAccessCodeScenario(
  testDb: TestDatabase,
  options: {
    adminPassword?: string;
    parentPassword?: string;
    assignCode?: boolean;
    doorCodesFeature?: boolean;
  } = {},
): Promise<FamilyAccessCodeSeedResult> {
  await ensureFamilyAccessCodesSchema();

  const uniqueId = nanoid(8).toLowerCase();
  const adminPassword = options.adminPassword ?? "TestPassword123!";
  const parentPassword = options.parentPassword ?? "TestPassword123!";
  const doorCodesFeature = options.doorCodesFeature !== false;

  const admin = await testDb.createTestUser({
    email: `door_admin_${uniqueId}@test.com`,
    username: `dooradmin_${uniqueId}`,
    name: "Door Code Admin",
    role: "schoolAdmin",
    password: adminPassword,
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Door Code School ${uniqueId}`,
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  const db = await getDb();
  if (!db) throw new Error("Postgres required for family access code seed");
  const [schoolRow] = await db
    .select({ enabledFeatures: schools.enabledFeatures })
    .from(schools)
    .where(eq(schools.id, school.id))
    .limit(1);
  await db
    .update(schools)
    .set({
      enabledFeatures: {
        ...normalizeSchoolFeatures(schoolRow?.enabledFeatures),
        doorCodes: doorCodesFeature,
      },
    })
    .where(eq(schools.id, school.id));

  const superAdmin = await testDb.createTestUser({
    email: `door_superadmin_${uniqueId}@test.com`,
    username: `doorsuperadmin_${uniqueId}`,
    name: "Door Code Super Admin",
    role: "superAdmin",
    password: adminPassword,
  });

  const keyedCampus = await testDb.createTestLocation(school.id, {
    name: "Brighton",
    code: "BRI",
    doorCodesEnabled: true,
  });
  const otherCampus = await testDb.createTestLocation(school.id, {
    name: "Greece",
    code: "GRE",
    doorCodesEnabled: false,
  });

  const parent = await testDb.createTestUser({
    email: `door_parent_${uniqueId}@test.com`,
    username: `doorparent_${uniqueId}`,
    name: "Door Code Parent",
    role: "parent",
    schoolId: school.id,
    locationId: keyedCampus.id,
    password: parentPassword,
  });
  await storage.updateUser(parent.id, { schoolId: school.id, locationId: keyedCampus.id });

  const parentB = await testDb.createTestUser({
    email: `door_parentb_${uniqueId}@test.com`,
    username: `doorparentb_${uniqueId}`,
    name: "Door Code Parent B",
    role: "parent",
    schoolId: school.id,
    locationId: keyedCampus.id,
    password: parentPassword,
  });
  await storage.updateUser(parentB.id, { schoolId: school.id, locationId: keyedCampus.id });

  const otherAdmin = await testDb.createTestUser({
    email: `door_other_admin_${uniqueId}@test.com`,
    username: `doorotheradmin_${uniqueId}`,
    name: "Other School Admin",
    role: "schoolAdmin",
    password: adminPassword,
  });
  const otherSchool = await testDb.createTestSchool(otherAdmin.id, {
    name: `Other School ${uniqueId}`,
  });
  await storage.updateUser(otherAdmin.id, { schoolId: otherSchool.id });
  const otherParent = await testDb.createTestUser({
    email: `door_other_parent_${uniqueId}@test.com`,
    username: `doorotherparent_${uniqueId}`,
    name: "Other Parent",
    role: "parent",
    schoolId: otherSchool.id,
    password: parentPassword,
  });

  for (const roleRow of [
    { userId: admin.id, role: "schoolAdmin" as const, schoolId: school.id, isPrimary: true },
    { userId: superAdmin.id, role: "superAdmin" as const, schoolId: null, isPrimary: true },
    { userId: parent.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
    { userId: parentB.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
    { userId: otherAdmin.id, role: "schoolAdmin" as const, schoolId: otherSchool.id, isPrimary: true },
    { userId: otherParent.id, role: "parent" as const, schoolId: otherSchool.id, isPrimary: true },
  ]) {
    try {
      await db.insert(userRoles).values(roleRow);
    } catch {
      /* role may already exist from createUser */
    }
  }

  const assignedCode = "4821";
  if (options.assignCode !== false) {
    await upsertParentAccessCode({
      schoolId: school.id,
      parentId: parent.id,
      code: assignedCode,
      assignedBy: admin.id,
      actorEmail: admin.email,
      actorRole: "schoolAdmin",
    });
  }

  return {
    admin: { id: admin.id, email: admin.email, password: adminPassword },
    superAdmin: { id: superAdmin.id, email: superAdmin.email, password: adminPassword },
    parent: { id: parent.id, email: parent.email, password: parentPassword },
    parentB: { id: parentB.id, email: parentB.email, password: parentPassword },
    school: { id: school.id, name: school.name },
    keyedCampus: { id: keyedCampus.id, name: keyedCampus.name },
    otherCampus: { id: otherCampus.id, name: otherCampus.name },
    otherSchool: {
      admin: { id: otherAdmin.id, email: otherAdmin.email, password: adminPassword },
      school: { id: otherSchool.id },
      parent: { id: otherParent.id, email: otherParent.email },
    },
    assignedCode,
  };
}
