import { nanoid } from 'nanoid';
import { getDb } from '../../db';
import { sessions } from '@shared/schema';
import { TestDatabase } from './testDatabase';
import { storage } from '../../storage';
import { ensurePublicStoreSchema } from '../../lib/ensure-public-store-schema';
import {
  createStoreProduct,
  upsertStoreListing,
  updateSchoolStoreSettings,
} from '../../lib/store-storage';

export type PublicStoreSeedResult = {
  admin: { id: number; email: string; password: string };
  school: { id: number; name: string; storeSlug: string };
  storeSlug: string;
  product: {
    id: number;
    name: string;
    priceCents: number;
    imageUrl: string | null;
  };
  listing: { id: number; isPublished: boolean };
  parent?: { id: number; email: string; password: string };
  child?: { id: number; firstName: string; lastName: string };
  class?: {
    id: number;
    title: string;
    priceCents: number;
    coverImage: string | null;
    listingId: number | null;
    listingPublished: boolean;
  };
  session?: {
    id: number;
    name: string;
    fullDayPrice: number | null;
    coverImage: string | null;
    listingId: number | null;
    listingPublished: boolean;
  };
};

export async function seedPublicStoreScenario(
  testDb: TestDatabase,
  options: {
    adminPassword?: string;
    productImageUrl?: string | null;
    withPublishedProduct?: boolean;
    /** Create a published marketplace class for store program tests. */
    withClass?: boolean;
    classTitle?: string;
    classPriceCents?: number;
    classCoverImage?: string | null;
    withPublishedClassListing?: boolean;
    /** Create an enrollment-open session with full-day pricing. */
    withSession?: boolean;
    sessionName?: string;
    sessionFullDayPriceCents?: number;
    sessionCoverImage?: string | null;
    withPublishedSessionListing?: boolean;
    /** Create a parent (+ child) enrolled at the store school for login E2E. */
    withParent?: boolean;
    parentPassword?: string;
    /** Override merch unit price (use 0 for Stripe-free checkout E2E). */
    productPriceCents?: number;
  } = {},
): Promise<PublicStoreSeedResult> {
  await ensurePublicStoreSchema();

  const uniqueId = nanoid(8).toLowerCase();
  const adminPassword = options.adminPassword ?? 'TestPassword123!';
  const storeSlug = `e2e-store-${uniqueId}`;

  const admin = await testDb.createTestUser({
    email: `store_admin_${uniqueId}@test.com`,
    username: `storeadmin_${uniqueId}`,
    name: 'Store E2E Admin',
    role: 'schoolAdmin',
  });
  const bcrypt = await import('bcryptjs');
  await storage.updateUser(admin.id, {
    password: await bcrypt.hash(adminPassword, 10),
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `E2E Public Store ${uniqueId}`,
    registrationCode: `STORE${uniqueId.toUpperCase()}`,
    membershipRequired: false,
    membershipFeeAmount: 0,
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  await updateSchoolStoreSettings(school.id, {
    storeSlug,
    publicStoreEnabled: true,
  });

  const features = await storage.getSchoolFeatures(school.id);
  await storage.updateSchoolFeatures(school.id, { ...features, publicStore: true });

  const product = await createStoreProduct({
    schoolId: school.id,
    name: `E2E Merch ${uniqueId}`,
    description: 'Playwright seeded merch item',
    priceCents:
      typeof options.productPriceCents === 'number' ? options.productPriceCents : 1999,
    imageUrl: options.productImageUrl ?? null,
    isActive: true,
    sortOrder: 0,
  });

  const listing = await upsertStoreListing({
    schoolId: school.id,
    listingType: 'product',
    sourceId: product.id,
    isPublished: options.withPublishedProduct !== false,
    membersOnly: false,
    sortOrder: 0,
  });

  const result: PublicStoreSeedResult = {
    admin: { id: admin.id, email: admin.email!, password: adminPassword },
    school: { id: school.id, name: school.name, storeSlug },
    storeSlug,
    product: {
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
    },
    listing: { id: listing.id, isPublished: listing.isPublished },
  };

  if (options.withClass) {
    const classPriceCents = options.classPriceCents ?? 7500;
    const classItem = await testDb.createTestClass(school.id, {
      title: options.classTitle ?? `E2E Summer Camp ${uniqueId}`,
      description: 'Playwright seeded store class',
      category: 'summer-camp',
      price: classPriceCents,
      isPublished: true,
      enrollmentOpen: true,
      coverImage: options.classCoverImage ?? null,
      type: 'school_admin',
    });

    let classListingId: number | null = null;
    let classListingPublished = false;
    if (options.withPublishedClassListing) {
      const classListing = await upsertStoreListing({
        schoolId: school.id,
        listingType: 'class',
        sourceId: classItem.id,
        isPublished: true,
        membersOnly: false,
        sortOrder: 1,
      });
      classListingId = classListing.id;
      classListingPublished = classListing.isPublished;
    }

    result.class = {
      id: classItem.id,
      title: classItem.title,
      priceCents: classItem.price,
      coverImage: classItem.coverImage ?? null,
      listingId: classListingId,
      listingPublished: classListingPublished,
    };
  }

  if (options.withSession) {
    const db = await getDb();
    const fullDay = options.sessionFullDayPriceCents ?? 37500;
    const [sessionRow] = await db
      .insert(sessions)
      .values({
        schoolId: school.id,
        name: options.sessionName ?? `E2E Session ${uniqueId}`,
        description: 'Playwright seeded enrollment session',
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        status: 'upcoming',
        enrollmentOpen: true,
        fullDayPrice: fullDay,
        halfDayPrice: Math.round(fullDay / 2),
        sortOrder: 0,
        coverImage: options.sessionCoverImage ?? null,
      })
      .returning();

    let sessionListingId: number | null = null;
    let sessionListingPublished = false;
    if (options.withPublishedSessionListing) {
      const sessionListing = await upsertStoreListing({
        schoolId: school.id,
        listingType: 'session',
        sourceId: sessionRow.id,
        isPublished: true,
        membersOnly: false,
        sortOrder: 2,
      });
      sessionListingId = sessionListing.id;
      sessionListingPublished = sessionListing.isPublished;
    }

    result.session = {
      id: sessionRow.id,
      name: sessionRow.name,
      fullDayPrice: sessionRow.fullDayPrice,
      coverImage: sessionRow.coverImage ?? null,
      listingId: sessionListingId,
      listingPublished: sessionListingPublished,
    };
  }

  if (options.withParent) {
    const parentPassword = options.parentPassword ?? adminPassword;
    const parentEmail = `store_parent_${uniqueId}@test.com`;
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `storeparent_${uniqueId}`,
      name: 'Store E2E Parent',
      role: 'parent',
      schoolId: school.id,
    });
    await storage.updateUser(parent.id, {
      password: await bcrypt.hash(parentPassword, 10),
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Store',
      lastName: 'Child',
      birthdate: '2015-03-15',
      gradeLevel: '4th Grade',
      schoolId: school.id,
      parentEmail,
    });
    result.parent = { id: parent.id, email: parentEmail, password: parentPassword };
    result.child = {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
    };
  }

  return result;
}
