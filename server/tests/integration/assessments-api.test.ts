import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import assessmentsRouter from '../../api/assessments';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );
  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) return next();
    try {
      const user = await storage.getUserByEmail(String(testUserEmail));
      if (user) {
        req.session = req.session || {};
        req.session.userId = user.id;
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
        };
      }
    } catch {
      /* missing user */
    }
    next();
  });
  app.use('/api/assessments', assessmentsRouter);
  return app;
}

describeWithDb('Integration: assessments API', () => {
  let app: express.Application;
  let educatorEmail: string;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildTestApp();
    await testDb.cleanup();

    const uid = nanoid(8).toLowerCase();
    educatorEmail = `assess_ed_${uid}@test.com`;
    const educator = await testDb.createTestUser({
      username: `assess_ed_${uid}`,
      email: educatorEmail,
      role: 'educator',
      name: 'Assess Educator',
    });
    const school = await testDb.createTestSchool(educator.id, {
      name: `Assess School ${uid}`,
      registrationCode: `AS${uid.toUpperCase().slice(0, 4)}`,
    });
    await storage.updateUser(educator.id, { ...(educator as any), schoolId: school.id } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /types returns 200 with school context', async () => {
    const res = await request(app)
      .get('/api/assessments/types')
      .set('x-test-user-email', educatorEmail);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
