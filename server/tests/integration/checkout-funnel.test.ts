import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import { buildSchoolAnalyticsTestApp } from '../helpers/schoolAnalyticsTestApp';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: checkout funnel', () => {
  let app: express.Application;
  let parentEmail: string;
  let adminEmail: string;
  let correlationId: string;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildSchoolAnalyticsTestApp();
    await testDb.cleanup();
    correlationId = `corr-${nanoid(12)}`;

    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      username: `funnel_adm_${uid}`,
      email: `funnel_adm_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Funnel Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Funnel School ${uid}`,
      registrationCode: `FS${uid.toUpperCase().slice(0, 4)}`,
    });
    adminEmail = admin.email;
    await storage.updateUser(admin.id, { schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `funnel_par_${uid}`,
      email: `funnel_par_${uid}@test.com`,
      role: 'parent',
      name: 'Funnel Parent',
    });
    parentEmail = parent.email;
    await storage.updateUser(parent.id, { schoolId: school.id } as any);
    await testDb.createTestChild(parent.id, { gradeLevel: '3', gender: 'female' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POST /api/telemetry/checkout-funnel records funnel steps', async () => {
    const steps = ['add_to_cart', 'view_cart', 'begin_checkout'] as const;
    for (const step of steps) {
      const res = await request(app)
        .post('/api/telemetry/checkout-funnel')
        .set('x-test-user-email', parentEmail)
        .send({
          correlationId,
          lane: 'member_cart',
          step,
          cartValueCents: 45000,
        });
      expect(res.status).toBe(201);
    }
  });

  it('GET /api/school-analytics/cart-abandonment returns funnel and summary', async () => {
    await request(app)
      .post('/api/telemetry/checkout-funnel')
      .set('x-test-user-email', parentEmail)
      .send({
        correlationId,
        lane: 'member_cart',
        step: 'add_to_cart',
        cartValueCents: 25000,
      });

    await request(app)
      .post('/api/telemetry/checkout-funnel')
      .set('x-test-user-email', parentEmail)
      .send({
        correlationId,
        lane: 'member_cart',
        step: 'begin_checkout',
        cartValueCents: 25000,
      });

    const res = await request(app)
      .get('/api/school-analytics/cart-abandonment')
      .set('x-test-user-email', adminEmail);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.funnel)).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalAbandoned).toBe('number');
    expect(Array.isArray(res.body.abandoned)).toBe(true);
  });

  it('emitStaleCheckoutAbandonEvents marks idle checkouts after 24h', async () => {
    const { getDb } = await import('../../db');
    const { checkoutFunnelEvents } = await import('../../../shared/schema');
    const { emitStaleCheckoutAbandonEvents } = await import('../../lib/school-analytics');
    const { eq } = await import('drizzle-orm');

    await request(app)
      .post('/api/telemetry/checkout-funnel')
      .set('x-test-user-email', parentEmail)
      .send({
        correlationId,
        lane: 'member_cart',
        step: 'begin_checkout',
        cartValueCents: 18000,
      });

    const db = await getDb();
    await db
      .update(checkoutFunnelEvents)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(checkoutFunnelEvents.correlationId, correlationId));

    const { emitted } = await emitStaleCheckoutAbandonEvents();
    expect(emitted).toBe(1);

    const res = await request(app)
      .get('/api/school-analytics/cart-abandonment')
      .set('x-test-user-email', adminEmail);
    expect(res.body.funnel.some((f: { step: string }) => f.step === 'abandon')).toBe(true);
  });

  it('recordCheckoutFunnelPurchase is idempotent per correlation', async () => {
    const { recordCheckoutFunnelPurchase } = await import('../../lib/school-analytics');
    const parent = await storage.getUserByEmail(parentEmail);
    const schoolId = parent!.schoolId!;

    await request(app)
      .post('/api/telemetry/checkout-funnel')
      .set('x-test-user-email', parentEmail)
      .send({
        correlationId,
        lane: 'public_store',
        step: 'begin_checkout',
        cartValueCents: 9900,
      });

    await recordCheckoutFunnelPurchase({
      schoolId,
      lane: 'public_store',
      correlationId,
      parentId: parent!.id,
      parentEmail,
      cartValueCents: 9900,
    });
    await recordCheckoutFunnelPurchase({
      schoolId,
      lane: 'public_store',
      correlationId,
      parentId: parent!.id,
      parentEmail,
      cartValueCents: 9900,
    });

    const res = await request(app)
      .get('/api/school-analytics/cart-abandonment')
      .set('x-test-user-email', adminEmail);
    const purchaseCount = res.body.funnel.find((f: { step: string }) => f.step === 'purchase')?.count ?? 0;
    expect(purchaseCount).toBe(1);
  });
});
