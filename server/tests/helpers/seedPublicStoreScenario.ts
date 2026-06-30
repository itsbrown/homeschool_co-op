import { nanoid } from 'nanoid';
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
};

export async function seedPublicStoreScenario(
  testDb: TestDatabase,
  options: {
    adminPassword?: string;
    productImageUrl?: string | null;
    withPublishedProduct?: boolean;
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
    priceCents: 1999,
    imageUrl: options.productImageUrl ?? null,
    isActive: true,
    sortOrder: 0,
  });

  let listing = await upsertStoreListing({
    schoolId: school.id,
    listingType: 'product',
    sourceId: product.id,
    isPublished: options.withPublishedProduct !== false,
    membersOnly: false,
    sortOrder: 0,
  });

  return {
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
}
