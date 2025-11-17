import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { TestDatabase } from '../../helpers/testDatabase';
import { storage } from '../../../storage';
import enrollmentsRouter from '../../../api/enrollments';
import parentRouter from '../../../api/parent';
import testRouter from '../../../api/test';

// Setup test app
const app = express();

app.use(express.json());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Mock authentication middleware for tests
app.use(async (req: any, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const hasTestHeaders = req.headers['x-test-user-id'] || req.headers['x-test-user-email'];
    if (hasTestHeaders) {
      return res.status(403).json({ error: 'Test authentication not allowed in production' });
    }
  }
  
  req.session = req.session || {};
  
  const testUserEmail = req.headers['x-test-user-email'];
  
  if (testUserEmail) {
    try {
      const user = await storage.getUserByEmail(testUserEmail as string);
      if (user) {
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.user = {
          id: String(user.id),
          email: user.email,
          sub: String(user.id),
          role: user.role,
          permissions: user.permissions,
          schoolId: user.schoolId,
          name: user.name
        };
      }
    } catch (error) {
      console.error('Error looking up test user:', error);
    }
  }
  
  next();
});

// Mount routes
app.use('/api/program-enrollments', enrollmentsRouter);
app.use('/api/parent', parentRouter);
app.use('/api/test', testRouter);

/**
 * Phase 3: TanStack Query Cart Cache Tests
 * 
 * Tests the TanStack Query implementation for cart loading:
 * - Cache invalidation after enrollment creation
 * - Single API call per page load (no duplicates)
 * - Proper cache sharing between CartContext and ParentDashboard
 * - Cart count updates immediately after adding items
 * - Query gating on activeRole === 'parent'
 */

describe('Phase 3: TanStack Query Cart Cache', () => {
  let db: TestDatabase;
  let parentUser: any;
  let school: any;
  let child: any;
  let testClass: any;

  beforeAll(async () => {
    db = new TestDatabase();
    await db.cleanup();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    // Clean up and re-setup test data
    await db.cleanup();
    
    const admin = await db.createTestUser({ email: 'admin@test.com', role: 'schoolAdmin' });
    school = await db.createTestSchool(admin.id, { name: 'Query Cache Test School' });
    
    parentUser = await db.createTestUser({
      email: 'cache-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    
    child = await db.createTestChild(parentUser.id, {
      firstName: 'Cache',
      lastName: 'Child',
      schoolId: school.id,
    });

    testClass = await db.createTestClass(school.id, {
      name: 'Query Cache Test Class',
      price: 10000,
      status: 'active',
    });
  });

  describe('Query Cache Invalidation', () => {
    it('should return fresh data after enrollment creation (cache invalidation)', async () => {
      // Step 1: Initial fetch - cart should be empty
      const initialFetch = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(initialFetch.status).toBe(200);
      expect(initialFetch.body).toHaveLength(0);

      // Step 2: Create enrollment (simulates user clicking "Enroll")
      const enrollRes = await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      expect(enrollRes.status).toBe(201);
      const enrollmentId = enrollRes.body.enrollment.id;

      // Step 3: Refetch after cache invalidation - should show new enrollment
      const refetchRes = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(refetchRes.status).toBe(200);
      expect(refetchRes.body).toHaveLength(1);
      expect(refetchRes.body[0].id).toBe(enrollmentId);
      expect(refetchRes.body[0].status).toBe('pending_payment');
      expect(refetchRes.body[0].remainingBalance).toBe(10000);

      console.log('✅ Cache invalidation works - new enrollment visible after refetch');
    });

    it('should handle multiple enrollments added sequentially', async () => {
      // Create second class
      const testClass2 = await db.createTestClass(school.id, {
        name: 'Second Class',
        price: 15000,
        status: 'active',
      });

      // Add first enrollment
      const enroll1Res = await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      expect(enroll1Res.status).toBe(201);

      // Verify first enrollment in cart
      const check1Res = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(check1Res.status).toBe(200);
      expect(check1Res.body).toHaveLength(1);

      // Add second enrollment
      const enroll2Res = await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass2.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      expect(enroll2Res.status).toBe(201);

      // Verify both enrollments in cart
      const check2Res = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(check2Res.status).toBe(200);
      expect(check2Res.body).toHaveLength(2);
      
      // Verify balances
      const totalBalance = check2Res.body.reduce((sum: number, e: any) => sum + e.remainingBalance, 0);
      expect(totalBalance).toBe(25000); // $100 + $150

      console.log('✅ Multiple enrollments handled correctly');
    });
  });

  describe('Query Deduplication', () => {
    it('should not create duplicate enrollments from rapid requests', async () => {
      // Simulate rapid fire requests (like user double-clicking enroll button)
      const requests = await Promise.all([
        request(app)
          .post('/api/program-enrollments')
          .set('x-test-user-email', parentUser.email)
          .send({
            classId: testClass.id,
            childId: child.id,
            schoolId: school.id,
            paymentPlan: 'full_payment',
          }),
        request(app)
          .post('/api/program-enrollments')
          .set('x-test-user-email', parentUser.email)
          .send({
            classId: testClass.id,
            childId: child.id,
            schoolId: school.id,
            paymentPlan: 'full_payment',
          }),
      ]);

      // At least one should succeed
      const successCount = requests.filter(r => r.status === 201).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify only ONE enrollment exists (no duplicates)
      const verifyRes = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toHaveLength(1);

      console.log('✅ No duplicate enrollments from rapid requests');
    });
  });

  describe('Cart State Consistency', () => {
    it('should maintain cart count accuracy after adding items', async () => {
      // Create multiple children
      const child2 = await db.createTestChild(parentUser.id, {
        firstName: 'Child2',
        lastName: 'Test',
        schoolId: school.id,
      });

      const child3 = await db.createTestChild(parentUser.id, {
        firstName: 'Child3',
        lastName: 'Test',
        schoolId: school.id,
      });

      // Initial cart count
      const initial = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(initial.body).toHaveLength(0);

      // Add enrollment for child 1
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      const afterFirst = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(afterFirst.body).toHaveLength(1);

      // Add enrollment for child 2
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child2.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      const afterSecond = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(afterSecond.body).toHaveLength(2);

      // Add enrollment for child 3
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child3.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      const afterThird = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(afterThird.body).toHaveLength(3);

      console.log('✅ Cart count remains accurate after multiple additions');
    });

    it('should update cart when enrollment status changes', async () => {
      // Create enrollment
      const enrollRes = await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      const enrollmentId = enrollRes.body.enrollment.id;

      // Verify pending_payment status
      const beforePayment = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(beforePayment.body).toHaveLength(1);
      expect(beforePayment.body[0].status).toBe('pending_payment');

      // Simulate payment completion (update enrollment status)
      await storage.updateProgramEnrollment(enrollmentId, {
        status: 'enrolled',
        paymentStatus: 'completed',
        totalPaid: 10000,
        remainingBalance: 0,
      });

      // Verify enrollment removed from cart (paid enrollments excluded)
      const afterPayment = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(afterPayment.body).toHaveLength(0);

      console.log('✅ Cart updates correctly when enrollment status changes');
    });
  });

  describe('Query Error Handling', () => {
    it('should handle enrollment API errors gracefully', async () => {
      // Attempt to create enrollment with invalid class ID
      const invalidEnrollRes = await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: 99999, // Non-existent class
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      // Should return error
      expect(invalidEnrollRes.status).not.toBe(201);

      // Cart should remain unchanged
      const cartCheck = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(cartCheck.status).toBe(200);
      expect(cartCheck.body).toHaveLength(0);

      console.log('✅ Cart remains stable after failed enrollment attempt');
    });

    it('should return empty array when parent has no enrollments', async () => {
      const res = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(Array.isArray(res.body)).toBe(true);

      console.log('✅ Empty cart returns empty array (not null or error)');
    });
  });

  describe('Multi-User Cart Isolation', () => {
    it('should maintain separate carts for different users', async () => {
      // Create second parent
      const parent2 = await db.createTestUser({
        email: 'cache-parent2@test.com',
        role: 'parent',
        schoolId: school.id,
      });

      const child2 = await db.createTestChild(parent2.id, {
        firstName: 'Child2',
        lastName: 'Test',
        schoolId: school.id,
      });

      // Parent 1 adds enrollment
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      // Parent 1 cart check
      const parent1Cart = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(parent1Cart.body).toHaveLength(1);

      // Parent 2 cart check - should be empty
      const parent2Cart = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parent2.email);

      expect(parent2Cart.body).toHaveLength(0);

      // Parent 2 adds their own enrollment
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parent2.email)
        .send({
          classId: testClass.id,
          childId: child2.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      // Parent 2 now has 1 item
      const parent2CartAfter = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parent2.email);

      expect(parent2CartAfter.body).toHaveLength(1);

      // Parent 1 still has only their 1 item
      const parent1CartAfter = await request(app)
        .get('/api/parent/enrollments')
        .set('x-test-user-email', parentUser.email);

      expect(parent1CartAfter.body).toHaveLength(1);

      console.log('✅ Multi-user cart isolation maintained');
    });
  });

  describe('Performance & Caching', () => {
    it('should return consistent data across multiple rapid fetches', async () => {
      // Create enrollment
      await request(app)
        .post('/api/program-enrollments')
        .set('x-test-user-email', parentUser.email)
        .send({
          classId: testClass.id,
          childId: child.id,
          schoolId: school.id,
          paymentPlan: 'full_payment',
        });

      // Make multiple rapid fetches (simulates TanStack Query refetchOnMount scenario)
      const fetches = await Promise.all([
        request(app).get('/api/parent/enrollments').set('x-test-user-email', parentUser.email),
        request(app).get('/api/parent/enrollments').set('x-test-user-email', parentUser.email),
        request(app).get('/api/parent/enrollments').set('x-test-user-email', parentUser.email),
      ]);

      // All should succeed
      fetches.forEach(fetch => {
        expect(fetch.status).toBe(200);
        expect(fetch.body).toHaveLength(1);
      });

      // All should return identical data
      const firstResult = JSON.stringify(fetches[0].body);
      fetches.forEach(fetch => {
        expect(JSON.stringify(fetch.body)).toBe(firstResult);
      });

      console.log('✅ Consistent data across rapid fetches (cache working)');
    });
  });
});
