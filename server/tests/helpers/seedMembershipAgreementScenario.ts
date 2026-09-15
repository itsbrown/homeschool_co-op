import { nanoid } from "nanoid";
import { getDb } from "../../db";
import { userRoles } from "@shared/schema";
import { storage } from "../../storage";
import type { TestDatabase } from "./testDatabase";

export const MEMBERSHIP_AGREEMENT_SEED_TEMPLATE = `# ASA Membership Agreement

By signing this membership agreement, I acknowledge that I have read the terms, agree to the code of conduct, and understand that this is a private membership association.

1. I will follow school policies.
2. I will keep contact information current.
3. I understand membership fees and renewal terms.
`;

export type MembershipAgreementSeedResult = {
  admin: { id: number; email: string; password: string };
  parent: { id: number; email: string; password: string };
  signedParent: { id: number; email: string; password: string };
  school: { id: number; name: string; membershipAgreementVersion: string };
};

export async function seedMembershipAgreementScenario(
  testDb: TestDatabase,
  options: { adminPassword?: string; parentPassword?: string } = {},
): Promise<MembershipAgreementSeedResult> {
  const uniqueId = nanoid(8).toLowerCase();
  const adminPassword = options.adminPassword ?? "TestPassword123!";
  const parentPassword = options.parentPassword ?? "TestPassword123!";

  const admin = await testDb.createTestUser({
    email: `agree_admin_${uniqueId}@test.com`,
    username: `agreeadmin_${uniqueId}`,
    name: "Agreement Admin",
    role: "schoolAdmin",
    password: adminPassword,
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Agreement School ${uniqueId}`,
    membershipAgreementTemplate: MEMBERSHIP_AGREEMENT_SEED_TEMPLATE,
    membershipAgreementVersion: "1.0",
    membershipAgreementUpdatedAt: new Date(),
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  const parent = await testDb.createTestUser({
    email: `agree_parent_${uniqueId}@test.com`,
    username: `agreeparent_${uniqueId}`,
    name: "Unsigned Parent",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
  });
  await storage.updateUser(parent.id, { schoolId: school.id });

  const signedParent = await testDb.createTestUser({
    email: `agree_signed_${uniqueId}@test.com`,
    username: `agreesigned_${uniqueId}`,
    name: "Signed Parent",
    role: "parent",
    schoolId: school.id,
    password: parentPassword,
  });
  await storage.updateUser(signedParent.id, { schoolId: school.id });

  const db = await getDb();
  if (!db) throw new Error("Postgres required for membership agreement seed");

  for (const roleRow of [
    { userId: admin.id, role: "schoolAdmin" as const, schoolId: school.id, isPrimary: true },
    { userId: parent.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
    { userId: signedParent.id, role: "parent" as const, schoolId: school.id, isPrimary: true },
  ]) {
    try {
      await db.insert(userRoles).values(roleRow);
    } catch {
      /* role may already exist from createUser */
    }
  }

  await storage.createMembershipAgreement({
    schoolId: school.id,
    parentUserId: signedParent.id,
    signatoryName: "Signed Parent",
    agreementVersion: "1.0",
    agreementContent: MEMBERSHIP_AGREEMENT_SEED_TEMPLATE,
    ipAddress: "127.0.0.1",
    userAgent: "seed",
  });

  return {
    admin: { id: admin.id, email: admin.email, password: adminPassword },
    parent: { id: parent.id, email: parent.email, password: parentPassword },
    signedParent: {
      id: signedParent.id,
      email: signedParent.email,
      password: parentPassword,
    },
    school: {
      id: school.id,
      name: school.name,
      membershipAgreementVersion: "1.0",
    },
  };
}
