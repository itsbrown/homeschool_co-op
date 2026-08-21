/**
 * List My Orthography Notebook as owned merch (pickup at school only) and
 * link Brighton F2026 Tycoons / Seekers / Pioneers / Patriots supply lists.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/add-orthography-pickup-product-production.ts --dry-run
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/add-orthography-pickup-product-production.ts
 */
import { and, eq, ilike, like, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { classes, storeListings, storeProducts, supplyItems } from '@shared/schema';
import { createStoreProduct, updateStoreProduct, upsertStoreListing } from '../lib/store-storage';

const SCHOOL_ID = 2;
const TITLE_SUFFIX = '| Brighton | F2026';
const PRODUCT_NAME = 'My Orthography Notebook';
const PRICE_CENTS = 2500;
const NOTES = 'Order through the ASA shop — pickup at school only';
const DESCRIPTION = [
  'My Orthography Notebook is the companion student notebook for Literacy Essentials: The Journey from Spelling to Reading.',
  'Consumable reference book students complete with lessons. Not a stand-alone product.',
  'Pickup at school only — this item cannot be shipped.',
].join('\n\n');

const DRY_RUN = process.argv.includes('--dry-run');

function isOrthographyCohort(title: string): boolean {
  const head = title.split('|')[0]?.trim().toLowerCase() ?? '';
  return (
    head.startsWith('tycoon') ||
    head.startsWith('seeker') ||
    head.startsWith('pioneer') ||
    head.startsWith('patriot')
  );
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error('No database');

  await db.execute(
    sql`ALTER TABLE store_products ADD COLUMN IF NOT EXISTS pickup_only boolean NOT NULL DEFAULT false`,
  );

  const products = await db
    .select()
    .from(storeProducts)
    .where(eq(storeProducts.schoolId, SCHOOL_ID));

  const owned =
    products.find((p) => p.productKind === 'owned' && /orthography|notebook/i.test(p.name)) ??
    null;
  const affiliates = products.filter(
    (p) =>
      p.productKind === 'affiliate' &&
      (/orthography|access literacy/i.test(p.name) ||
        (p.affiliateUrl ?? '').includes('accessliteracy.com')),
  );

  const classRows = await db
    .select({ id: classes.id, title: classes.title })
    .from(classes)
    .where(and(eq(classes.schoolId, SCHOOL_ID), like(classes.title, `%${TITLE_SUFFIX}%`)));
  const targetClasses = classRows.filter((c) => isOrthographyCohort(c.title));

  const summary: Record<string, unknown> = {
    dryRun: DRY_RUN,
    priceCents: PRICE_CENTS,
    existingOwnedProductId: owned?.id ?? null,
    affiliateProductIds: affiliates.map((p) => p.id),
    targetClasses: targetClasses.map((c) => ({ id: c.id, title: c.title })),
  };

  let productId = owned?.id ?? null;

  if (!DRY_RUN) {
    if (owned) {
      const updated = await updateStoreProduct(owned.id, {
        name: PRODUCT_NAME,
        description: DESCRIPTION,
        priceCents: PRICE_CENTS,
        productKind: 'owned',
        pickupOnly: true,
        affiliateUrl: null,
        asin: null,
        isActive: true,
      });
      productId = updated?.id ?? owned.id;
    } else {
      const created = await createStoreProduct({
        schoolId: SCHOOL_ID,
        name: PRODUCT_NAME,
        description: DESCRIPTION,
        priceCents: PRICE_CENTS,
        imageUrl: null,
        inventoryQty: null,
        isActive: true,
        sortOrder: 0,
        productKind: 'owned',
        pickupOnly: true,
      });
      productId = created.id;
    }

    const listing = await upsertStoreListing({
      schoolId: SCHOOL_ID,
      listingType: 'product',
      sourceId: productId,
      isPublished: true,
      membersOnly: false,
    });
    summary.productId = productId;
    summary.listingId = listing.id;

    for (const affiliate of affiliates) {
      await updateStoreProduct(affiliate.id, { isActive: false });
      const [listingRow] = await db
        .select({ id: storeListings.id })
        .from(storeListings)
        .where(
          and(
            eq(storeListings.schoolId, SCHOOL_ID),
            eq(storeListings.listingType, 'product'),
            eq(storeListings.sourceId, affiliate.id),
          ),
        )
        .limit(1);
      if (listingRow) {
        await upsertStoreListing({
          schoolId: SCHOOL_ID,
          listingType: 'product',
          sourceId: affiliate.id,
          isPublished: false,
        });
      }
    }
  } else {
    summary.wouldCreateOrUpdate = owned ? 'update' : 'create';
  }

  const supplyActions: Array<Record<string, unknown>> = [];
  for (const cls of targetClasses) {
    const items = await db
      .select()
      .from(supplyItems)
      .where(
        and(
          eq(supplyItems.schoolId, SCHOOL_ID),
          eq(supplyItems.ownerType, 'class'),
          eq(supplyItems.ownerId, cls.id),
          or(ilike(supplyItems.name, '%orthography%'), ilike(supplyItems.name, '%access literacy%')),
        ),
      );

    if (items.length === 0) {
      supplyActions.push({
        classId: cls.id,
        title: cls.title,
        action: DRY_RUN ? 'would-insert' : 'insert',
      });
      if (!DRY_RUN && productId != null) {
        const maxSort = (
          await db
            .select({ sortOrder: supplyItems.sortOrder })
            .from(supplyItems)
            .where(
              and(
                eq(supplyItems.schoolId, SCHOOL_ID),
                eq(supplyItems.ownerType, 'class'),
                eq(supplyItems.ownerId, cls.id),
              ),
            )
        ).reduce((max, row) => Math.max(max, row.sortOrder), -1);
        await db.insert(supplyItems).values({
          schoolId: SCHOOL_ID,
          ownerType: 'class',
          ownerId: cls.id,
          name: 'Orthography Book / Student Notebook',
          quantity: 1,
          unit: null,
          scope: 'student',
          required: true,
          notes: NOTES,
          storeProductId: productId,
          sortOrder: maxSort + 1,
          updatedAt: new Date(),
        });
      }
      continue;
    }

    for (const item of items) {
      const changed =
        item.storeProductId !== productId ||
        item.notes !== NOTES ||
        item.name !== 'Orthography Book / Student Notebook';
      supplyActions.push({
        classId: cls.id,
        title: cls.title,
        itemId: item.id,
        action: changed ? (DRY_RUN ? 'would-update' : 'update') : 'keep',
        fromProductId: item.storeProductId,
      });
      if (!DRY_RUN && changed && productId != null) {
        await db
          .update(supplyItems)
          .set({
            name: 'Orthography Book / Student Notebook',
            notes: NOTES,
            storeProductId: productId,
            updatedAt: new Date(),
          })
          .where(eq(supplyItems.id, item.id));
      }
    }
  }

  summary.supplyActions = supplyActions;
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
