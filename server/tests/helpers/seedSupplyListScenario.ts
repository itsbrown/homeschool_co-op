import { getDb } from "../../db";
import { programEnrollments } from "@shared/schema";
import { TestDatabase } from "./testDatabase";
import { seedPublicStoreScenario } from "./seedPublicStoreScenario";
import { ensureSupplyListsSchema } from "../../lib/ensure-supply-lists-schema";
import { replaceSupplyItems } from "../../lib/supply-lists";
import { storage } from "../../storage";

const AFFILIATE_URL = "https://www.amazon.com/dp/B08SUPPLY1?tag=asa-e2e-20";

export type SupplyListSeedResult = {
  admin: { id: number; email: string; password: string };
  parent: { id: number; email: string; password: string };
  school: { id: number; name: string; storeSlug: string };
  storeSlug: string;
  affiliateProduct: {
    id: number;
    name: string;
    affiliateUrl: string;
  };
  affiliateListing: { id: number };
  session: { id: number; name: string };
  classA: { id: number; title: string };
  classB: { id: number; title: string };
  children: {
    maya: { id: number; firstName: string; lastName: string };
    liam: { id: number; firstName: string; lastName: string };
  };
  items: {
    waterBottleId: number;
    tissuesId: number;
    glueSticksId: number;
  };
};

export async function seedSupplyListScenario(
  testDb: TestDatabase,
  options: { adminPassword?: string; parentPassword?: string } = {},
): Promise<SupplyListSeedResult> {
  await ensureSupplyListsSchema();

  const store = await seedPublicStoreScenario(testDb, {
    adminPassword: options.adminPassword,
    parentPassword: options.parentPassword,
    withAffiliateProduct: true,
    affiliateUrl: AFFILIATE_URL,
    affiliateAsin: "B08SUPPLY1",
    affiliateName: "E2E Supply Tissues",
    withClass: true,
    classTitle: "Trailblazers",
    withSession: true,
    sessionName: "Fall 2026",
    withParent: true,
  });

  if (!store.parent || !store.child || !store.class || !store.session || !store.affiliateProduct || !store.affiliateListing) {
    throw new Error("supply list seed missing store parent/class/session/affiliate");
  }

  const classB = await testDb.createTestClass(store.school.id, {
    title: "Tycoons",
    description: "Second class for supply list E2E",
    category: "academic",
    price: 5000,
    isPublished: true,
    enrollmentOpen: true,
    type: "school_admin",
  });

  const maya = await storage.updateChild(store.child.id, {
    firstName: "Maya",
    lastName: "Supply",
  });
  if (!maya) throw new Error("failed to rename seeded child to Maya");

  const liam = await testDb.createTestChild(store.parent.id, {
    firstName: "Liam",
    lastName: "Supply",
    birthdate: "2016-08-01",
    gradeLevel: "3rd Grade",
    schoolId: store.school.id,
    parentEmail: store.parent.email,
  });
  const db = await getDb();
  if (!db) throw new Error("Postgres required for supply list seed");

  const enroll = async (args: {
    childId: number;
    childName: string;
    className: string;
    marketplaceClassId?: number | null;
    sessionId?: number | null;
  }) => {
    await db.insert(programEnrollments).values({
      schoolId: store.school.id,
      classType: "marketplace",
      marketplaceClassId: args.marketplaceClassId ?? null,
      sessionId: args.sessionId ?? null,
      childId: args.childId,
      childName: args.childName,
      className: args.className,
      parentId: store.parent!.id,
      parentEmail: store.parent!.email,
      totalCost: 0,
      totalPaid: 0,
      remainingBalance: 0,
      depositRequired: 0,
      paymentStatus: "completed",
      status: "enrolled",
      enrollmentDate: new Date(),
    });
  };

  const mayaName = `${maya.firstName} ${maya.lastName}`;
  const liamName = `${liam.firstName} ${liam.lastName}`;

  await enroll({
    childId: maya.id,
    childName: mayaName,
    className: store.session.name,
    sessionId: store.session.id,
  });
  await enroll({
    childId: liam.id,
    childName: liamName,
    className: store.session.name,
    sessionId: store.session.id,
  });
  await enroll({
    childId: maya.id,
    childName: mayaName,
    className: store.class.title,
    marketplaceClassId: store.class.id,
  });
  await enroll({
    childId: liam.id,
    childName: liamName,
    className: classB.title,
    marketplaceClassId: classB.id,
  });

  const sessionItems = await replaceSupplyItems(store.school.id, "session", store.session.id, [
    {
      name: "Water bottle",
      quantity: 1,
      scope: "student",
      required: true,
      notes: "Labeled with first name",
    },
  ]);
  const classAItems = await replaceSupplyItems(store.school.id, "class", store.class.id, [
    {
      name: "Tissues",
      quantity: 1,
      scope: "class",
      required: true,
      storeProductId: store.affiliateProduct.id,
    },
    {
      name: "Dimensions Math Textbook 2A",
      quantity: 1,
      scope: "student",
      required: true,
    },
    {
      name: "Dimensions Math Textbook KA",
      quantity: 1,
      scope: "student",
      required: false,
    },
  ]);
  const classBItems = await replaceSupplyItems(store.school.id, "class", classB.id, [
    {
      name: "Glue sticks",
      quantity: 2,
      scope: "student",
      required: true,
      storeProductId: store.affiliateProduct.id,
    },
  ]);

  return {
    admin: store.admin,
    parent: store.parent,
    school: store.school,
    storeSlug: store.storeSlug,
    affiliateProduct: {
      id: store.affiliateProduct.id,
      name: store.affiliateProduct.name,
      affiliateUrl: store.affiliateProduct.affiliateUrl,
    },
    affiliateListing: { id: store.affiliateListing.id },
    session: { id: store.session.id, name: store.session.name },
    classA: { id: store.class.id, title: store.class.title },
    classB: { id: classB.id, title: classB.title },
    children: {
      maya: { id: maya.id, firstName: maya.firstName, lastName: maya.lastName },
      liam: { id: liam.id, firstName: liam.firstName, lastName: liam.lastName },
    },
    items: {
      waterBottleId: sessionItems[0].id,
      tissuesId: classAItems[0].id,
      glueSticksId: classBItems[0].id,
    },
  };
}
