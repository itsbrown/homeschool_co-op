/**
 * Structured supply lists on classes and sessions; household merge for parents.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  classes,
  parentSupplyChecks,
  schools,
  sessions,
  storeListings,
  storeProducts,
  supplyItems,
  type SupplyItem,
} from "@shared/schema";
import {
  ACTIVE_SUPPLY_ENROLLMENT_STATUSES,
  isSupplyOwnerType,
  mergeSupplyNeeds,
  type HouseholdSupplyRow,
  type SupplyNeed,
  type SupplyOwnerType,
  type SupplyScope,
} from "@shared/supply-list";
import { slugifyStoreListingTitle } from "./store-listing-slug";

export class SupplyListError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "SupplyListError";
  }
}

export type SupplyItemWrite = {
  name: string;
  quantity: number;
  unit?: string | null;
  scope: SupplyScope;
  required: boolean;
  notes?: string | null;
  storeProductId?: number | null;
};

export type ShopProductPickerRow = {
  id: number;
  name: string;
  productKind: "owned" | "affiliate";
  imageUrl: string | null;
  affiliateUrl: string | null;
  listingId: number | null;
  listingSlug: string | null;
  isPublished: boolean;
};

export type HouseholdProductCta = {
  id: number;
  name: string;
  productKind: "owned" | "affiliate";
  affiliateUrl: string | null;
  listingSlug: string | null;
  purchasableInCart: false;
};

export type HouseholdSupplyListResponse = {
  items: Array<HouseholdSupplyRow & { product: HouseholdProductCta | null }>;
  storeSlug: string | null;
  classCount: number;
  sessionCount: number;
};

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new SupplyListError("Database unavailable", 503);
  return db;
}

export async function assertOwnerInSchool(
  schoolId: number,
  ownerType: SupplyOwnerType,
  ownerId: number,
): Promise<{ name: string }> {
  const db = await dbOrThrow();
  if (ownerType === "class") {
    const [row] = await db
      .select({ id: classes.id, title: classes.title, schoolId: classes.schoolId })
      .from(classes)
      .where(eq(classes.id, ownerId))
      .limit(1);
    if (!row) throw new SupplyListError("Class not found", 404);
    if (row.schoolId !== schoolId) throw new SupplyListError("Class not in this school", 403);
    return { name: row.title };
  }
  const [row] = await db
    .select({ id: sessions.id, name: sessions.name, schoolId: sessions.schoolId })
    .from(sessions)
    .where(eq(sessions.id, ownerId))
    .limit(1);
  if (!row) throw new SupplyListError("Session not found", 404);
  if (row.schoolId !== schoolId) throw new SupplyListError("Session not in this school", 403);
  return { name: row.name };
}

export async function listSupplyItems(
  schoolId: number,
  ownerType: SupplyOwnerType,
  ownerId: number,
): Promise<SupplyItem[]> {
  await assertOwnerInSchool(schoolId, ownerType, ownerId);
  const db = await dbOrThrow();
  return db
    .select()
    .from(supplyItems)
    .where(
      and(
        eq(supplyItems.schoolId, schoolId),
        eq(supplyItems.ownerType, ownerType),
        eq(supplyItems.ownerId, ownerId),
      ),
    )
    .orderBy(asc(supplyItems.sortOrder), asc(supplyItems.id));
}

async function assertStoreProductInSchool(
  schoolId: number,
  storeProductId: number | null | undefined,
): Promise<void> {
  if (storeProductId == null) return;
  const db = await dbOrThrow();
  const [row] = await db
    .select({ id: storeProducts.id, schoolId: storeProducts.schoolId })
    .from(storeProducts)
    .where(eq(storeProducts.id, storeProductId))
    .limit(1);
  if (!row) throw new SupplyListError("Shop product not found", 400, "STORE_PRODUCT_NOT_FOUND");
  if (row.schoolId !== schoolId) {
    throw new SupplyListError("Shop product is not in this school", 403, "STORE_PRODUCT_WRONG_SCHOOL");
  }
}

export async function replaceSupplyItems(
  schoolId: number,
  ownerType: SupplyOwnerType,
  ownerId: number,
  items: SupplyItemWrite[],
): Promise<SupplyItem[]> {
  await assertOwnerInSchool(schoolId, ownerType, ownerId);
  for (const item of items) {
    await assertStoreProductInSchool(schoolId, item.storeProductId);
  }

  const db = await dbOrThrow();
  await db
    .delete(supplyItems)
    .where(
      and(
        eq(supplyItems.schoolId, schoolId),
        eq(supplyItems.ownerType, ownerType),
        eq(supplyItems.ownerId, ownerId),
      ),
    );

  if (items.length === 0) return [];

  const inserted = await db
    .insert(supplyItems)
    .values(
      items.map((item, index) => ({
        schoolId,
        ownerType,
        ownerId,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit?.trim() || null,
        scope: item.scope,
        required: item.required,
        notes: item.notes?.trim() || null,
        storeProductId: item.storeProductId ?? null,
        sortOrder: index,
        updatedAt: new Date(),
      })),
    )
    .returning();
  return inserted;
}

export async function copySupplyItems(
  schoolId: number,
  toOwnerType: SupplyOwnerType,
  toOwnerId: number,
  fromOwnerType: SupplyOwnerType,
  fromOwnerId: number,
): Promise<SupplyItem[]> {
  if (toOwnerType === fromOwnerType && toOwnerId === fromOwnerId) {
    throw new SupplyListError("Cannot copy a list onto itself", 400);
  }
  const source = await listSupplyItems(schoolId, fromOwnerType, fromOwnerId);
  return replaceSupplyItems(
    schoolId,
    toOwnerType,
    toOwnerId,
    source.map((row) => ({
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      scope: row.scope as SupplyScope,
      required: row.required,
      notes: row.notes,
      storeProductId: row.storeProductId,
    })),
  );
}

export async function listCopySources(schoolId: number): Promise<{
  classes: Array<{ id: number; name: string }>;
  sessions: Array<{ id: number; name: string }>;
}> {
  const db = await dbOrThrow();
  const classRows = await db
    .select({ id: classes.id, name: classes.title })
    .from(classes)
    .where(eq(classes.schoolId, schoolId))
    .orderBy(asc(classes.title));
  const sessionRows = await db
    .select({ id: sessions.id, name: sessions.name })
    .from(sessions)
    .where(eq(sessions.schoolId, schoolId))
    .orderBy(asc(sessions.name));
  return { classes: classRows, sessions: sessionRows };
}

export async function listShopProductsForPicker(schoolId: number): Promise<ShopProductPickerRow[]> {
  const db = await dbOrThrow();
  const products = await db
    .select()
    .from(storeProducts)
    .where(and(eq(storeProducts.schoolId, schoolId), eq(storeProducts.isActive, true)))
    .orderBy(asc(storeProducts.sortOrder), asc(storeProducts.id));

  const listings = await db
    .select()
    .from(storeListings)
    .where(and(eq(storeListings.schoolId, schoolId), eq(storeListings.listingType, "product")));

  const listingByProductId = new Map<number, (typeof listings)[number]>();
  for (const listing of listings) {
    listingByProductId.set(listing.sourceId, listing);
  }

  const publishedForSlugs = listings
    .filter((l) => l.isPublished)
    .map((l) => {
      const product = products.find((p) => p.id === l.sourceId);
      return { listingId: l.id, title: product?.name ?? `product-${l.sourceId}` };
    });
  const used = new Set<string>();
  const slugByListingId = new Map<number, string>();
  for (const item of publishedForSlugs) {
    const base = slugifyStoreListingTitle(item.title);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(slug);
    slugByListingId.set(item.listingId, slug);
  }

  return products.map((p) => {
    const listing = listingByProductId.get(p.id);
    const isPublished = listing?.isPublished === true;
    return {
      id: p.id,
      name: p.name,
      productKind: (p.productKind as "owned" | "affiliate") ?? "owned",
      imageUrl: p.imageUrl ?? null,
      affiliateUrl: p.affiliateUrl ?? null,
      listingId: listing?.id ?? null,
      listingSlug: isPublished && listing ? slugByListingId.get(listing.id) ?? null : null,
      isPublished,
    };
  });
}

type EnrollmentLike = {
  status?: string | null;
  sessionId?: number | null;
  marketplaceClassId?: number | null;
  classId?: number | null;
  className?: string | null;
  childId: number;
};

/** Class supply owner is `classes.id` — cart path uses marketplaceClassId; some seats only set classId. */
export function supplyClassOwnerId(enrollment: EnrollmentLike): number | null {
  const id = enrollment.marketplaceClassId ?? enrollment.classId ?? null;
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : null;
}

export async function buildHouseholdSupplyList(params: {
  parentId: number;
  schoolId: number | null;
  children: Array<{ id: number; firstName: string; lastName?: string | null }>;
  enrollments: EnrollmentLike[];
}): Promise<HouseholdSupplyListResponse> {
  const db = await dbOrThrow();
  const childrenById = new Map(
    params.children.map((c) => [
      c.id,
      `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`.trim(),
    ]),
  );

  const active = params.enrollments.filter((e) =>
    ACTIVE_SUPPLY_ENROLLMENT_STATUSES.includes(
      String(e.status ?? "").toLowerCase() as (typeof ACTIVE_SUPPLY_ENROLLMENT_STATUSES)[number],
    ),
  );

  const classIds = [
    ...new Set(
      active
        .map((e) => supplyClassOwnerId(e))
        .filter((id): id is number => id != null),
    ),
  ];
  const sessionIds = [
    ...new Set(active.map((e) => e.sessionId).filter((id): id is number => id != null)),
  ];

  const itemRows: SupplyItem[] = [];
  if (classIds.length > 0) {
    const classItems = await db
      .select()
      .from(supplyItems)
      .where(and(eq(supplyItems.ownerType, "class"), inArray(supplyItems.ownerId, classIds)))
      .orderBy(asc(supplyItems.sortOrder), asc(supplyItems.id));
    itemRows.push(...classItems);
  }
  if (sessionIds.length > 0) {
    const sessionItems = await db
      .select()
      .from(supplyItems)
      .where(and(eq(supplyItems.ownerType, "session"), inArray(supplyItems.ownerId, sessionIds)))
      .orderBy(asc(supplyItems.sortOrder), asc(supplyItems.id));
    itemRows.push(...sessionItems);
  }

  const schoolIds = [...new Set(itemRows.map((i) => i.schoolId))];
  if (params.schoolId != null) schoolIds.push(params.schoolId);
  const uniqueSchoolIds = [...new Set(schoolIds)];

  const classNameById = new Map<number, string>();
  if (classIds.length > 0) {
    const classRows = await db
      .select({ id: classes.id, title: classes.title })
      .from(classes)
      .where(inArray(classes.id, classIds));
    for (const row of classRows) classNameById.set(row.id, row.title);
  }
  const sessionNameById = new Map<number, string>();
  if (sessionIds.length > 0) {
    const sessionRows = await db
      .select({ id: sessions.id, name: sessions.name })
      .from(sessions)
      .where(inArray(sessions.id, sessionIds));
    for (const row of sessionRows) sessionNameById.set(row.id, row.name);
  }

  const needs: SupplyNeed[] = [];
  for (const enrollment of active) {
    const childName = childrenById.get(enrollment.childId) ?? "Child";
    const classId = supplyClassOwnerId(enrollment);
    if (classId != null) {
      for (const item of itemRows.filter((i) => i.ownerType === "class" && i.ownerId === classId)) {
        needs.push(needFromItem(item, enrollment.childId, childName, classNameById.get(classId) ?? enrollment.className ?? "Class"));
      }
    }
    if (enrollment.sessionId != null) {
      for (const item of itemRows.filter(
        (i) => i.ownerType === "session" && i.ownerId === enrollment.sessionId,
      )) {
        needs.push(
          needFromItem(
            item,
            enrollment.childId,
            childName,
            sessionNameById.get(enrollment.sessionId) ?? "Session",
          ),
        );
      }
    }
  }

  const checkRows = await db
    .select({ supplyItemId: parentSupplyChecks.supplyItemId })
    .from(parentSupplyChecks)
    .where(eq(parentSupplyChecks.parentId, params.parentId));
  const checked = new Set(checkRows.map((r) => r.supplyItemId));
  const merged = mergeSupplyNeeds(needs, checked);

  const productIds = [
    ...new Set(merged.map((r) => r.storeProductId).filter((id): id is number => id != null)),
  ];
  const productById = new Map<number, HouseholdProductCta>();
  let storeSlug: string | null = null;

  if (uniqueSchoolIds.length > 0) {
    const schoolRows = await db
      .select({ id: schools.id, storeSlug: schools.storeSlug })
      .from(schools)
      .where(inArray(schools.id, uniqueSchoolIds));
    storeSlug = schoolRows.find((s) => s.storeSlug)?.storeSlug ?? schoolRows[0]?.storeSlug ?? null;
  }

  if (productIds.length > 0) {
    const products = await db.select().from(storeProducts).where(inArray(storeProducts.id, productIds));
    const listings = await db
      .select()
      .from(storeListings)
      .where(
        and(
          eq(storeListings.listingType, "product"),
          inArray(storeListings.sourceId, productIds),
          eq(storeListings.isPublished, true),
        ),
      );
    const listingByProduct = new Map(listings.map((l) => [l.sourceId, l]));
    for (const p of products) {
      const listing = listingByProduct.get(p.id);
      productById.set(p.id, {
        id: p.id,
        name: p.name,
        productKind: (p.productKind as "owned" | "affiliate") ?? "owned",
        affiliateUrl: p.affiliateUrl ?? null,
        listingSlug: listing ? slugifyStoreListingTitle(p.name) : null,
        purchasableInCart: false,
      });
    }
  }

  const classOwners = new Set(
    needs.filter((n) => n.ownerType === "class").map((n) => n.ownerId),
  );
  const sessionOwners = new Set(
    needs.filter((n) => n.ownerType === "session").map((n) => n.ownerId),
  );

  return {
    items: merged.map((row) => ({
      ...row,
      product: row.storeProductId != null ? productById.get(row.storeProductId) ?? null : null,
    })),
    storeSlug,
    classCount: classOwners.size,
    sessionCount: sessionOwners.size,
  };
}

function needFromItem(
  item: SupplyItem,
  childId: number,
  childName: string,
  ownerName: string,
): SupplyNeed {
  return {
    supplyItemId: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    scope: item.scope as SupplyScope,
    required: item.required,
    notes: item.notes,
    storeProductId: item.storeProductId,
    ownerType: item.ownerType as SupplyOwnerType,
    ownerId: item.ownerId,
    ownerName,
    childId,
    childName,
  };
}

export async function setParentSupplyChecks(
  parentId: number,
  supplyItemIds: number[],
  checked: boolean,
  allowedItemIds: Set<number>,
): Promise<void> {
  for (const id of supplyItemIds) {
    if (!allowedItemIds.has(id)) {
      throw new SupplyListError("Supply item is not on this household list", 403);
    }
  }
  const db = await dbOrThrow();
  if (checked) {
    if (supplyItemIds.length === 0) return;
    await db
      .insert(parentSupplyChecks)
      .values(
        supplyItemIds.map((supplyItemId) => ({
          parentId,
          supplyItemId,
          checkedAt: new Date(),
        })),
      )
      .onConflictDoNothing();
    return;
  }
  if (supplyItemIds.length === 0) return;
  await db
    .delete(parentSupplyChecks)
    .where(
      and(
        eq(parentSupplyChecks.parentId, parentId),
        inArray(parentSupplyChecks.supplyItemId, supplyItemIds),
      ),
    );
}

export function parseOwnerType(value: string): SupplyOwnerType {
  if (!isSupplyOwnerType(value)) {
    throw new SupplyListError("ownerType must be class or session", 400);
  }
  return value;
}
