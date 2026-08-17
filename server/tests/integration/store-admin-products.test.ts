import express from 'express';
import request from 'supertest';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, expect, it } from '@jest/globals';
import { TestDatabase } from '../helpers/testDatabase';
import { seedPublicStoreScenario } from '../helpers/seedPublicStoreScenario';
import storeAdminRouter from '../../api/store-admin';
import { ensurePublicStoreSchema } from '../../lib/ensure-public-store-schema';
import { describeIntegration } from '../helpers/integrationDb';
import {
  createStoreOrder,
  createStoreOrderItem,
  getStoreListingBySource,
  getStoreOrderItems,
  getStoreProductById,
} from '../../lib/store-storage';

describeIntegration('Integration: store admin product links and delete', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedPublicStoreScenario>>;
  const testDb = new TestDatabase();

  beforeAll(async () => {
    await ensurePublicStoreSchema();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    seed = await seedPublicStoreScenario(testDb, {
      withPublishedProduct: true,
      withAffiliateProduct: true,
    });
    app = express();
    app.use(express.json());
    app.use('/api/school-admin/public-store', storeAdminRouter);
  });

  it('PATCH keeps an owned merch outbound URL', async () => {
    const url = 'https://accessliteracy.com/orthography-notebook';
    const res = await request(app)
      .patch(`/api/school-admin/public-store/products/${seed.product.id}`)
      .set('x-test-user-email', seed.admin.email)
      .send({ affiliateUrl: url });
    expect(res.status).toBe(200);
    expect(res.body.affiliateUrl).toBe(url);
    expect(res.body.productKind).toBe('owned');

    const again = await request(app)
      .patch(`/api/school-admin/public-store/products/${seed.product.id}`)
      .set('x-test-user-email', seed.admin.email)
      .send({ name: `${seed.product.name} renamed` });
    expect(again.status).toBe(200);
    expect(again.body.affiliateUrl).toBe(url);
  });

  it('PATCH requires an affiliate URL for affiliate products', async () => {
    const res = await request(app)
      .patch(`/api/school-admin/public-store/products/${seed.affiliateProduct!.id}`)
      .set('x-test-user-email', seed.admin.email)
      .send({ affiliateUrl: '' });
    expect(res.status).toBe(400);
  });

  it('DELETE nulls order product_id and listing_id and removes the listing', async () => {
    const order = await createStoreOrder({
      schoolId: seed.school.id,
      parentEmail: 'store-buyer@test.com',
      accessToken: nanoid(),
      totalCents: seed.product.priceCents,
    });
    await createStoreOrderItem({
      storeOrderId: order.id,
      listingId: seed.listing.id,
      productId: seed.product.id,
      name: seed.product.name,
      quantity: 1,
      unitPriceCents: seed.product.priceCents,
      lineTotalCents: seed.product.priceCents,
    });

    const res = await request(app)
      .delete(`/api/school-admin/public-store/products/${seed.product.id}`)
      .set('x-test-user-email', seed.admin.email);
    expect(res.status).toBe(204);

    expect(await getStoreProductById(seed.product.id)).toBeNull();
    expect(await getStoreListingBySource(seed.school.id, 'product', seed.product.id)).toBeNull();

    const items = await getStoreOrderItems(order.id);
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBeNull();
    expect(items[0].listingId).toBeNull();
    expect(items[0].name).toBe(seed.product.name);
  });

  it('DELETE is school-scoped', async () => {
    const other = await seedPublicStoreScenario(testDb, { withPublishedProduct: true });
    const res = await request(app)
      .delete(`/api/school-admin/public-store/products/${other.product.id}`)
      .set('x-test-user-email', seed.admin.email);
    expect(res.status).toBe(404);
    expect(await getStoreProductById(other.product.id)).toBeTruthy();
  });
});
