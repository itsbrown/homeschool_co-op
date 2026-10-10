import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../server/db";
import {
  childGuardians,
  children,
  classes,
  conciergeEvents,
  locations,
  programEnrollments,
  schools,
  skeletonBlocks,
  storeOrderItems,
  storeOrders,
  storeProducts,
  users,
  weekPlanBlocks,
  weekPlans,
  weeklySkeletons,
} from "@shared/schema";
import { emptyStoreEventRsvp, STORE_ATTENDEE_TYPES } from "@shared/store-event-rsvp";
import { resolveConciergeLocalUrl } from "./concierge-local-guard";

export const CONCIERGE_LOCAL_SCHOOL_CODE = "CONCIERGE-LOCAL";
export const CONCIERGE_WEEK_START = "2026-10-05";

const NO_LOGIN_PASSWORD = "masked-no-login";

export type ConciergeLocalSeed = {
  schoolId: number;
  locationId: number;
  weekStart: string;
  parents: {
    avery: { id: number; email: string };
    blake: { id: number; email: string };
    casey: { id: number; email: string };
  };
  children: {
    rowan: { id: number };
    quinn: { id: number };
    skyler: { id: number };
    reese: { id: number };
  };
  classes: { nature: { id: number }; studio: { id: number } };
  events: { free: { id: number }; paid: { id: number } };
};

async function applyConciergeMigration(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
  try {
    const usersTable = await sql`select to_regclass('public.users') as name`;
    if (!usersTable[0]?.name) {
      throw new Error(
        "Local database has no app schema. Bootstrap an empty local database before seeding. Do not point this at production.",
      );
    }
    const file = resolve(process.cwd(), "server/migrations/268-concierge-events.sql");
    await sql.unsafe(readFileSync(file, "utf8"));
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function deletePreviousFakeSchool(): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: schools.id, adminId: schools.adminId })
    .from(schools)
    .where(eq(schools.registrationCode, CONCIERGE_LOCAL_SCHOOL_CODE));

  for (const school of existing) {
    const schoolUsers = await db.select({ id: users.id }).from(users).where(eq(users.schoolId, school.id));
    const userIds = schoolUsers.map((row) => row.id);
    if (!userIds.includes(school.adminId)) userIds.push(school.adminId);

    if (userIds.length > 0) {
      await db.delete(conciergeEvents).where(inArray(conciergeEvents.userId, userIds));
      const orders = await db.select({ id: storeOrders.id }).from(storeOrders).where(inArray(storeOrders.parentId, userIds));
      const orderIds = orders.map((row) => row.id);
      if (orderIds.length > 0) {
        await db.delete(storeOrderItems).where(inArray(storeOrderItems.storeOrderId, orderIds));
      }
      await db.delete(storeOrders).where(inArray(storeOrders.parentId, userIds));
    }

    await db.delete(storeProducts).where(eq(storeProducts.schoolId, school.id));

    const plans = await db.select({ id: weekPlans.id }).from(weekPlans).where(eq(weekPlans.schoolId, school.id));
    const planIds = plans.map((row) => row.id);
    if (planIds.length > 0) {
      await db.delete(weekPlanBlocks).where(inArray(weekPlanBlocks.weekPlanId, planIds));
    }
    await db.delete(weekPlans).where(eq(weekPlans.schoolId, school.id));

    const skeletons = await db.select({ id: weeklySkeletons.id }).from(weeklySkeletons).where(eq(weeklySkeletons.schoolId, school.id));
    const skeletonIds = skeletons.map((row) => row.id);
    if (skeletonIds.length > 0) {
      await db.delete(skeletonBlocks).where(inArray(skeletonBlocks.skeletonId, skeletonIds));
    }
    await db.delete(weeklySkeletons).where(eq(weeklySkeletons.schoolId, school.id));

    await db.delete(programEnrollments).where(eq(programEnrollments.schoolId, school.id));

    const kids = await db.select({ id: children.id }).from(children).where(eq(children.schoolId, school.id));
    const kidIds = kids.map((row) => row.id);
    if (kidIds.length > 0) {
      await db.delete(childGuardians).where(inArray(childGuardians.childId, kidIds));
    }
    await db.delete(children).where(eq(children.schoolId, school.id));
    await db.delete(classes).where(eq(classes.schoolId, school.id));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(locations).where(eq(locations.schoolId, school.id));
    await db.delete(schools).where(eq(schools.id, school.id));
  }
}

function eventConfig(startsOn: string, adultPriceCents: number, adultCapacity: number | null) {
  const rsvp = emptyStoreEventRsvp(startsOn);
  rsvp.location = "Lakeside campus";
  rsvp.startTime = "11:00";
  rsvp.endTime = "13:00";
  rsvp.closeOn = null;
  rsvp.attendees = STORE_ATTENDEE_TYPES.map((type) => ({
    type,
    enabled: type === "adult" || (adultPriceCents > 0 && type === "children"),
    priceCents: type === "adult" ? adultPriceCents : 0,
    capacity: type === "adult" ? adultCapacity : null,
  }));
  return rsvp;
}

export async function seedConciergeLocal(): Promise<ConciergeLocalSeed> {
  const url = resolveConciergeLocalUrl();
  process.env.DATABASE_URL = url;
  console.log("[concierge-seed] applying migration on local database");
  await applyConciergeMigration(url);
  console.log("[concierge-seed] replacing previous fake school");
  await deletePreviousFakeSchool();

  const db = await getDb();
  const [admin] = await db.insert(users).values({
    username: "morgan.lee.concierge",
    email: "morgan.lee@example.invalid",
    password: NO_LOGIN_PASSWORD,
    role: "schoolAdmin",
    name: "Morgan Lee",
    firstName: "Morgan",
    lastName: "Lee",
  }).returning({ id: users.id });

  const [school] = await db.insert(schools).values({
    name: "Northwood Seekers Co-op",
    type: "co-op",
    adminId: admin.id,
    city: "Lakeside",
    state: "NY",
    zipCode: "00000",
    email: "school-concierge@example.invalid",
    status: "active",
    registrationCode: CONCIERGE_LOCAL_SCHOOL_CODE,
  }).returning({ id: schools.id });

  const [location] = await db.insert(locations).values({
    schoolId: school.id,
    name: "Lakeside",
    code: "LK",
    address: "100 Masked Lane",
    city: "Lakeside",
    state: "NY",
    zipCode: "00000",
  }).returning({ id: locations.id });

  await db.update(users).set({ schoolId: school.id, locationId: location.id }).where(eq(users.id, admin.id));

  async function parent(username: string, email: string, name: string, first: string, last: string) {
    const [row] = await db.insert(users).values({
      username,
      email,
      password: NO_LOGIN_PASSWORD,
      role: "parent",
      name,
      firstName: first,
      lastName: last,
      phone: "555-010-0199",
      schoolId: school.id,
      locationId: location.id,
    }).returning({ id: users.id, email: users.email });
    return row;
  }

  const avery = await parent("avery.quinn.concierge", "avery.quinn@example.invalid", "Avery Quinn", "Avery", "Quinn");
  const blake = await parent("blake.rivera.concierge", "blake.rivera@example.invalid", "Blake Rivera", "Blake", "Rivera");
  const casey = await parent("casey.nguyen.concierge", "casey.nguyen@example.invalid", "Casey Nguyen", "Casey", "Nguyen");

  async function child(parentId: number, parentEmail: string, firstName: string, gradeLevel: string, birthdate: string) {
    const [row] = await db.insert(children).values({
      parentId,
      parentEmail,
      firstName,
      lastName: "Student",
      birthdate,
      gradeLevel,
      schoolId: school.id,
      locationId: location.id,
    }).returning({ id: children.id });
    return row;
  }

  const rowan = await child(avery.id, avery.email, "Rowan", "prek_k", "2021-01-01");
  const quinn = await child(avery.id, avery.email, "Quinn", "grades_1_3", "2017-01-01");
  const skyler = await child(blake.id, blake.email, "Skyler", "grades_4_8", "2013-01-01");
  const reese = await child(blake.id, blake.email, "Reese", "grades_9_12", "2009-01-01");

  await db.insert(childGuardians).values({
    childId: rowan.id,
    guardianUserId: casey.id,
    relationship: "guardian",
    addedBy: avery.id,
    isPrimary: false,
  });

  async function klass(title: string) {
    const [row] = await db.insert(classes).values({
      type: "marketplace",
      schoolId: school.id,
      locationId: location.id,
      title,
      description: `${title} for the local concierge seed.`,
      category: "enrichment",
      price: 0,
      isPublished: true,
      status: "active",
    }).returning({ id: classes.id });
    return row;
  }

  const nature = await klass("Nature Journaling");
  const studio = await klass("Studio Art");

  async function enroll(childId: number, childName: string, classId: number | null, className: string, parentId: number, parentEmail: string) {
    await db.insert(programEnrollments).values({
      schoolId: school.id,
      classType: "marketplace",
      classId: null,
      marketplaceClassId: classId,
      childId,
      childName,
      className,
      parentId,
      parentEmail,
      totalCost: 0,
      totalPaid: 0,
      remainingBalance: 0,
      status: "enrolled",
      locationId: location.id,
    });
  }

  await enroll(rowan.id, "Rowan Student", nature.id, "Nature Journaling", avery.id, avery.email);
  await enroll(rowan.id, "Rowan Student", null, "Unassigned session", avery.id, avery.email);
  await enroll(skyler.id, "Skyler Student", studio.id, "Studio Art", blake.id, blake.email);

  async function publishedWeek(classId: number, blockTitle: string, draftTitle?: string) {
    const [skeleton] = await db.insert(weeklySkeletons).values({
      schoolId: school.id,
      classId,
      name: blockTitle,
      status: "published",
      createdBy: admin.id,
    }).returning({ id: weeklySkeletons.id });
    const [block] = await db.insert(skeletonBlocks).values({
      skeletonId: skeleton.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      blockType: "curriculum",
      defaultTitle: blockTitle,
      createdBy: admin.id,
    }).returning({ id: skeletonBlocks.id });
    const [plan] = await db.insert(weekPlans).values({
      skeletonId: skeleton.id,
      schoolId: school.id,
      weekNumber: 1,
      weekStartDate: CONCIERGE_WEEK_START,
      status: "published",
      publishedAt: new Date("2026-10-01T12:00:00Z"),
      createdBy: admin.id,
    }).returning({ id: weekPlans.id });
    await db.insert(weekPlanBlocks).values({
      weekPlanId: plan.id,
      skeletonBlockId: block.id,
      title: blockTitle,
      description: `${blockTitle} in class.`,
      objectives: ["Notice one new detail"],
      materials: ["paper", "pencil"],
      homework: "Bring one example from home",
      lessonLink: "https://example.invalid/lesson",
    });
    if (draftTitle) {
      const [draft] = await db.insert(weekPlans).values({
        skeletonId: skeleton.id,
        schoolId: school.id,
        weekNumber: 99,
        weekStartDate: CONCIERGE_WEEK_START,
        status: "draft",
        createdBy: admin.id,
      }).returning({ id: weekPlans.id });
      await db.insert(weekPlanBlocks).values({
        weekPlanId: draft.id,
        skeletonBlockId: block.id,
        title: draftTitle,
        description: "Not published.",
      });
    }
  }

  await publishedWeek(nature.id, "Leaf rubbings", "Secret draft lesson");
  await publishedWeek(studio.id, "Color wheel");

  const [freeEvent] = await db.insert(storeProducts).values({
    schoolId: school.id,
    name: "Lakeside picnic",
    description: "A free family picnic.",
    priceCents: 0,
    productKind: "event",
    rsvp: eventConfig("2026-11-14", 0, 20),
    isActive: true,
  }).returning({ id: storeProducts.id });

  const [paidEvent] = await db.insert(storeProducts).values({
    schoolId: school.id,
    name: "Harvest supper",
    description: "A priced supper.",
    priceCents: 2500,
    productKind: "event",
    rsvp: eventConfig("2026-11-21", 2500, 20),
    isActive: true,
  }).returning({ id: storeProducts.id });

  return {
    schoolId: school.id,
    locationId: location.id,
    weekStart: CONCIERGE_WEEK_START,
    parents: { avery, blake, casey },
    children: { rowan, quinn, skyler, reese },
    classes: { nature, studio },
    events: { free: freeEvent, paid: paidEvent },
  };
}
