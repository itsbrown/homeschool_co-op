import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  schools,
  storeCheckoutSnapshots,
  storeListings,
  storeOrderItems,
  storeOrders,
  storeProducts,
  programDeliveryDocuments,
  schoolDocuments,
  sessions,
  classes,
  type StoreListing,
  type StoreProduct,
} from '@shared/schema';

function mapStoreProduct(row: typeof storeProducts.$inferSelect): StoreProduct {
  return row;
}

function mapStoreListing(row: typeof storeListings.$inferSelect): StoreListing {
  return row;
}

export async function getSchoolByStoreSlug(storeSlug: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schools)
    .where(eq(schools.storeSlug, storeSlug))
    .limit(1);
  return row ?? null;
}

export async function getStoreProductsBySchoolId(schoolId: number): Promise<StoreProduct[]> {
  const db = await getDb();
  return db
    .select()
    .from(storeProducts)
    .where(eq(storeProducts.schoolId, schoolId))
    .orderBy(asc(storeProducts.sortOrder), asc(storeProducts.id));
}

export async function getStoreProductById(id: number): Promise<StoreProduct | null> {
  const db = await getDb();
  const [row] = await db.select().from(storeProducts).where(eq(storeProducts.id, id)).limit(1);
  return row ?? null;
}

export async function createStoreProduct(data: typeof storeProducts.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(storeProducts).values(data).returning();
  return row;
}

export async function updateStoreProduct(id: number, data: Partial<typeof storeProducts.$inferInsert>) {
  const db = await getDb();
  const [row] = await db
    .update(storeProducts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(storeProducts.id, id))
    .returning();
  return row ?? null;
}

export async function getStoreListingsBySchoolId(schoolId: number): Promise<StoreListing[]> {
  const db = await getDb();
  return db
    .select()
    .from(storeListings)
    .where(eq(storeListings.schoolId, schoolId))
    .orderBy(asc(storeListings.sortOrder), asc(storeListings.id));
}

export async function getPublishedStoreListings(schoolId: number): Promise<StoreListing[]> {
  const db = await getDb();
  return db
    .select()
    .from(storeListings)
    .where(and(eq(storeListings.schoolId, schoolId), eq(storeListings.isPublished, true)))
    .orderBy(asc(storeListings.sortOrder), asc(storeListings.id));
}

export async function getPublishedStoreListingById(
  schoolId: number,
  listingId: number,
): Promise<StoreListing | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeListings)
    .where(
      and(
        eq(storeListings.schoolId, schoolId),
        eq(storeListings.id, listingId),
        eq(storeListings.isPublished, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getStoreListingBySource(
  schoolId: number,
  listingType: 'product' | 'session' | 'class',
  sourceId: number,
): Promise<StoreListing | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeListings)
    .where(
      and(
        eq(storeListings.schoolId, schoolId),
        eq(storeListings.listingType, listingType),
        eq(storeListings.sourceId, sourceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertStoreListing(data: {
  schoolId: number;
  listingType: 'product' | 'session' | 'class';
  sourceId: number;
  isPublished: boolean;
  membersOnly?: boolean;
  sortOrder?: number;
}): Promise<StoreListing> {
  const db = await getDb();
  const existing = await getStoreListingBySource(data.schoolId, data.listingType, data.sourceId);
  if (existing) {
    const [row] = await db
      .update(storeListings)
      .set({
        isPublished: data.isPublished,
        membersOnly: data.membersOnly ?? existing.membersOnly,
        sortOrder: data.sortOrder ?? existing.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(storeListings)
    .values({
      schoolId: data.schoolId,
      listingType: data.listingType,
      sourceId: data.sourceId,
      isPublished: data.isPublished,
      membersOnly: data.membersOnly ?? true,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return row!;
}

export async function updateStoreListing(
  id: number,
  data: Partial<typeof storeListings.$inferInsert>,
): Promise<StoreListing | null> {
  const db = await getDb();
  const [row] = await db
    .update(storeListings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(storeListings.id, id))
    .returning();
  return row ?? null;
}

export async function getSessionById(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return row ?? null;
}

export async function getClassById(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  return row ?? null;
}

export async function saveStoreCheckoutSnapshot(data: typeof storeCheckoutSnapshots.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(storeCheckoutSnapshots).values(data).returning();
  return row;
}

export async function getStoreCheckoutSnapshot(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeCheckoutSnapshots)
    .where(eq(storeCheckoutSnapshots.id, id))
    .limit(1);
  return row ?? null;
}

export async function markStoreSnapshotFulfilled(
  snapshotId: string,
  data: { stripeCheckoutSessionId?: string; storeOrderId?: number },
) {
  const db = await getDb();
  await db
    .update(storeCheckoutSnapshots)
    .set({
      fulfilledAt: new Date(),
      stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
      storeOrderId: data.storeOrderId ?? null,
    })
    .where(eq(storeCheckoutSnapshots.id, snapshotId));
}

export async function createStoreOrder(data: typeof storeOrders.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(storeOrders).values(data).returning();
  return row;
}

export async function getStoreOrderByCheckoutSessionId(sessionId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.stripeCheckoutSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

export async function getStoreOrderById(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
  return row ?? null;
}

export async function getStoreOrderByAccessToken(token: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.accessToken, token))
    .limit(1);
  return row ?? null;
}

export async function getStoreOrderByPaymentIntentId(paymentIntentId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  return row ?? null;
}

export async function updateStoreOrder(
  id: number,
  data: Partial<typeof storeOrders.$inferInsert>,
) {
  const db = await getDb();
  const [row] = await db
    .update(storeOrders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(storeOrders.id, id))
    .returning();
  return row ?? null;
}

export async function createStoreOrderItem(data: typeof storeOrderItems.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(storeOrderItems).values(data).returning();
  return row;
}

export async function getStoreOrderItems(storeOrderId: number) {
  const db = await getDb();
  return db
    .select()
    .from(storeOrderItems)
    .where(eq(storeOrderItems.storeOrderId, storeOrderId));
}

export async function getStoreOrdersBySchoolId(schoolId: number) {
  const db = await getDb();
  return db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.schoolId, schoolId))
    .orderBy(sql`${storeOrders.createdAt} DESC`);
}

export async function updateSchoolStoreSettings(
  schoolId: number,
  data: {
    storeSlug?: string | null;
    publicStoreEnabled?: boolean;
    publicStoreSettings?: Record<string, unknown>;
  },
) {
  const db = await getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.storeSlug !== undefined) patch.storeSlug = data.storeSlug;
  if (data.publicStoreEnabled !== undefined) patch.publicStoreEnabled = data.publicStoreEnabled;
  if (data.publicStoreSettings !== undefined) patch.publicStoreSettings = data.publicStoreSettings;
  const [row] = await db.update(schools).set(patch).where(eq(schools.id, schoolId)).returning();
  return row ?? null;
}

export async function getProgramDeliveryDocumentIds(
  schoolId: number,
  sourceType: 'class' | 'session',
  sourceId: number,
): Promise<number[]> {
  const db = await getDb();
  const rows = await db
    .select({ schoolDocumentId: programDeliveryDocuments.schoolDocumentId })
    .from(programDeliveryDocuments)
    .where(
      and(
        eq(programDeliveryDocuments.schoolId, schoolId),
        eq(programDeliveryDocuments.sourceType, sourceType),
        eq(programDeliveryDocuments.sourceId, sourceId),
      ),
    )
    .orderBy(asc(programDeliveryDocuments.sortOrder), asc(programDeliveryDocuments.id));
  return rows.map((r: { schoolDocumentId: number }) => r.schoolDocumentId);
}

export async function setProgramDeliveryDocuments(
  schoolId: number,
  sourceType: 'class' | 'session',
  sourceId: number,
  documentIds: number[],
) {
  const db = await getDb();
  await db
    .delete(programDeliveryDocuments)
    .where(
      and(
        eq(programDeliveryDocuments.schoolId, schoolId),
        eq(programDeliveryDocuments.sourceType, sourceType),
        eq(programDeliveryDocuments.sourceId, sourceId),
      ),
    );
  if (documentIds.length === 0) return;
  await db.insert(programDeliveryDocuments).values(
    documentIds.map((schoolDocumentId, index) => ({
      schoolId,
      sourceType,
      sourceId,
      schoolDocumentId,
      sortOrder: index,
    })),
  );
}

export async function getSchoolDocumentsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select().from(schoolDocuments);
  return rows.filter((d: { id: number }) => ids.includes(d.id));
}

export { mapStoreProduct, mapStoreListing };
