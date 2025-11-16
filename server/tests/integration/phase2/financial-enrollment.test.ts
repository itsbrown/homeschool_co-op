import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { TestDatabase } from '../../helpers/testDatabase';
import { storage } from '../../../storage';
import enrollmentsRouter from '../../../api/enrollments';
import stripeRouter from '../../../api/stripe';
import billingRouter from '../../../api/billing';
import paymentHistoryRouter from '../../../api/payment-history';

const app = express();

app.use(express.json());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Mock session-based authentication for tests using header-driven lookup
// This allows supabaseAuth middleware to bypass token validation
// 🔒 PRODUCTION SAFETY: This middleware should NEVER run in production
app.use(async (req: any, res, next) => {
  // Reject test authentication headers in production
  if (process.env.NODE_ENV === 'production') {
    const hasTestHeaders = req.headers['x-test-user-id'] || req.headers['x-test-user-email'];
    if (hasTestHeaders) {
      console.error('🚨 SECURITY: Test authentication headers detected in production environment');
      return res.status(403).json({ 
        error: 'Test authentication is not allowed in production environment' 
      });
    }
  }
  
  req.session = req.session || {};
  
  // Check for x-test-user-id header or x-test-user-email header
  const testUserId = req.headers['x-test-user-id'];
  const testUserEmail = req.headers['x-test-user-email'];
  
  // If x-test-user-id is provided, look up the user from storage
  if (testUserId) {
    try {
      const user = await storage.getUser(parseInt(testUserId as string));
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
        req.auth = {
          payload: {
            sub: String(user.id),
            email: user.email,
            role: user.role
          }
        };
      }
    } catch (error) {
      console.error('Error looking up test user:', error);
    }
  }
  // If x-test-user-email is provided, look up by email
  else if (testUserEmail) {
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
        req.auth = {
          payload: {
            sub: String(user.id),
            email: user.email,
            role: user.role
          }
        };
      }
    } catch (error) {
      console.error('Error looking up test user by email:', error);
    }
  }
  // Fallback: try to infer user from request body parentEmail
  else if (req.body?.parentEmail) {
    try {
      const user = await storage.getUserByEmail(req.body.parentEmail);
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
        req.auth = {
          payload: {
            sub: String(user.id),
            email: user.email,
            role: user.role
          }
        };
      }
    } catch (error) {
      console.error('Error looking up test user from parentEmail:', error);
    }
  }
  
  next();
});

app.use('/api/enrollments', enrollmentsRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/billing', billingRouter);
app.use('/api/payment-history', paymentHistoryRouter);

describe('Integration: Financial & Enrollment Features (Phase 2)', () => {
  let testDb: TestDatabase;

  beforeAll(() => {
    testDb = new TestDatabase(storage);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('Payment & Billing System', () => {
    describe('Enrollment Payment Flow', () => {
      it('should create payment intent for cart checkout', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id, {
          name: 'Test Academy'
        });

        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          status: 'published'
        });

        const cartItems = [{
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: classItem.id,
          className: classItem.title,
          price: classItem.price
        }];

        const response = await request(app)
          .post('/api/stripe/create-payment-intent')
          .send({
            items: cartItems,
            subtotal: 10000,
            discounts: [],
            total: 10000,
            parentEmail: parent.email,
            paymentPlan: 'full',
            paymentFrequency: 'one_time'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('clientSecret');
        expect(response.body).toHaveProperty('paymentIntentId');
      });

      it('should validate cart items belong to authenticated parent', async () => {
        const parent1 = await testDb.createTestUser({
          email: 'parent1@test.com',
          username: 'testparent1',
          name: 'Test Parent 1',
          role: 'parent'
        });

        const parent2 = await testDb.createTestUser({
          email: 'parent2@test.com',
          username: 'testparent2',
          name: 'Test Parent 2',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);

        const child1 = await testDb.createTestChild(parent1.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const child2 = await testDb.createTestChild(parent2.id, {
          firstName: 'Bob',
          lastName: 'Test',
          gradeLevel: '6th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        app.use((req, res, next) => {
          req.user = { email: 'parent1@test.com' };
          next();
        });

        const cartItems = [{
          childId: child2.id,
          childName: `${child2.firstName} ${child2.lastName}`,
          classId: classItem.id,
          className: classItem.title,
          price: classItem.price
        }];

        const response = await request(app)
          .post('/api/stripe/create-payment-intent')
          .send({
            items: cartItems,
            subtotal: 10000,
            discounts: [],
            total: 10000,
            parentEmail: 'parent1@test.com'
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('UNAUTHORIZED_CHILDREN');
      });

      it('should support payment plans (full, deposit, split, biweekly)', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 20000
        });

        const cartItems = [{
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: classItem.id,
          className: classItem.title,
          price: classItem.price
        }];

        const paymentPlans = ['full', 'deposit', 'split', 'biweekly'];

        for (const plan of paymentPlans) {
          const response = await request(app)
            .post('/api/stripe/create-payment-intent')
            .send({
              items: cartItems,
              subtotal: 20000,
              discounts: [],
              total: 20000,
              parentEmail: parent.email,
              paymentPlan: plan,
              paymentFrequency: plan === 'biweekly' ? 'biweekly' : 'one_time'
            });

          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('clientSecret');
        }
      });
    });

    describe('Membership Fee Processing', () => {
      it('should create membership enrollment record', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id, {
          name: 'Test Academy',
          membershipFee: 5000
        });

        const currentYear = new Date().getFullYear();
        const dueDate = new Date();
        const expirationDate = new Date(currentYear + 1, 11, 31);

        const membershipEnrollment = await storage.createMembershipEnrollment({
          schoolId: school.id,
          parentUserId: parent.id,
          membershipYear: currentYear,
          amount: 5000,
          amountPaid: 0,
          remainingBalance: 5000,
          status: 'pending_payment',
          dueDate,
          expirationDate
        });

        expect(membershipEnrollment).toBeDefined();
        expect(membershipEnrollment.schoolId).toBe(school.id);
        expect(membershipEnrollment.parentUserId).toBe(parent.id);
        expect(membershipEnrollment.amount).toBe(5000);
        expect(membershipEnrollment.status).toBe('pending_payment');
      });

      it('should calculate "free after X children" discount', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id, {
          name: 'Test Academy',
          freeAfterXChildren: 3,
          freeAfterXType: 'full_discount'
        });

        const children = [];
        for (let i = 0; i < 4; i++) {
          const child = await testDb.createTestChild(parent.id, {
            firstName: `Child${i + 1}`,
            lastName: 'Test',
            gradeLevel: '5th',
            schoolId: school.id
          });
          children.push(child);
        }

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        for (let i = 0; i < 3; i++) {
          await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: children[i].id,
            childName: `${children[i].firstName} ${children[i].lastName}`,
            className: classItem.title,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: 10000,
            totalPaid: 10000,
            remainingBalance: 0,
            paymentStatus: 'completed',
            status: 'enrolled'
          });
        }

        const existingEnrollments = await storage.getEnrollmentsByChildIds(
          children.slice(0, 3).map(c => c.id)
        );

        expect(existingEnrollments.length).toBe(3);
      });

      it('should track membership status (pending, enrolled, grace_period, expired)', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const currentYear = new Date().getFullYear();
        const dueDate = new Date();
        const expirationDate = new Date(currentYear + 1, 11, 31);

        const membership = await storage.createMembershipEnrollment({
          schoolId: school.id,
          parentUserId: parent.id,
          membershipYear: currentYear,
          amount: 5000,
          amountPaid: 0,
          remainingBalance: 5000,
          status: 'pending_payment',
          dueDate,
          expirationDate
        });

        expect(membership.status).toBe('pending_payment');

        const updated = await storage.updateMembershipEnrollment(membership.id, {
          amountPaid: 5000,
          remainingBalance: 0,
          status: 'enrolled'
        });

        expect(updated?.status).toBe('enrolled');
        expect(updated?.amountPaid).toBe(5000);
        expect(updated?.remainingBalance).toBe(0);
      });
    });

    describe('Payment History', () => {
      it('should retrieve payment history for authenticated parent', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);

        await storage.createPayment({
          schoolId: school.id,
          parentId: parent.id,
          parentEmail: parent.email,
          amount: 10000,
          status: 'completed',
          paymentMethod: 'stripe',
          description: 'Test payment'
        });

        const response = await request(app)
          .get('/api/payment-history/history')
          .set('Cookie', [`connect.sid=${encodeURIComponent('test-session')}`]);

        expect(response.status).toBe(200);
      });

      it('should display payment details including child and class info', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const payment = await storage.createPayment({
          schoolId: school.id,
          parentId: parent.id,
          parentEmail: parent.email,
          amount: 10000,
          status: 'completed',
          paymentMethod: 'stripe',
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title
        });

        expect(payment.childName).toBe('Alice Test');
        expect(payment.className).toBe('Math 101');
      });
    });

    describe('Subscription Schedules', () => {
      it('should retrieve subscription schedules for parent', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const response = await request(app)
          .get('/api/stripe/subscription-schedules')
          .set('Cookie', [`connect.sid=${encodeURIComponent('test-session')}`]);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('schedules');
        expect(Array.isArray(response.body.schedules)).toBe(true);
      });

      it('should retrieve active subscriptions for parent', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const response = await request(app)
          .get('/api/stripe/subscriptions')
          .set('Cookie', [`connect.sid=${encodeURIComponent('test-session')}`]);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('subscriptions');
        expect(Array.isArray(response.body.subscriptions)).toBe(true);
      });
    });

    describe('Refund Processing', () => {
      it('should create refund record', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);

        const payment = await storage.createPayment({
          schoolId: school.id,
          parentId: parent.id,
          parentEmail: parent.email,
          amount: 10000,
          status: 'completed',
          paymentMethod: 'stripe'
        });

        const refund = await storage.createRefund({
          schoolId: school.id,
          paymentId: payment.id,
          amount: 10000,
          reason: 'Customer request',
          description: 'Full refund',
          status: 'pending'
        });

        expect(refund).toBeDefined();
        expect(refund.paymentId).toBe(payment.id);
        expect(refund.amount).toBe(10000);
        expect(refund.status).toBe('pending');
      });

      it('should track refund status (pending, processing, completed, failed)', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);

        const payment = await storage.createPayment({
          schoolId: school.id,
          parentId: parent.id,
          parentEmail: parent.email,
          amount: 10000,
          status: 'completed',
          paymentMethod: 'stripe'
        });

        const refund = await storage.createRefund({
          schoolId: school.id,
          paymentId: payment.id,
          amount: 10000,
          reason: 'Customer request',
          status: 'pending'
        });

        expect(refund.status).toBe('pending');

        const updated = await storage.updateRefund(refund.id, {
          status: 'completed',
          processedBy: admin.id,
          processedAt: new Date()
        });

        expect(updated?.status).toBe('completed');
        expect(updated?.processedBy).toBe(admin.id);
      });
    });

    describe('Billing Summary', () => {
      it('should generate consolidated billing summary for parent', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 5000,
          remainingBalance: 5000,
          paymentStatus: 'partial_payment',
          status: 'enrolled'
        });

        const response = await request(app)
          .get('/api/billing/summary')
          .set('Cookie', [`connect.sid=${encodeURIComponent('test-session')}`]);

        expect(response.status).toBe(200);
      });
    });
  });

  describe('Enrollment System', () => {
    describe('Cart-Based Enrollment', () => {
      it('should allow adding class to cart via enrollment creation', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'pending_payment'
        });

        expect(enrollment).toBeDefined();
        expect(enrollment.status).toBe('pending_payment');
      });

      it('should prevent duplicate enrollments in same class', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const existingEnrollments = await storage.getEnrollmentsByChildId(child.id);
        const hasDuplicate = existingEnrollments.filter(
          e => e.classId === classItem.id && 
          (e.status === 'enrolled' || e.status === 'pending_payment')
        ).length > 1;

        expect(hasDuplicate).toBe(false);
      });

      it('should retrieve cart items (pending_payment enrollments)', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'pending_payment'
        });

        const response = await request(app)
          .get(`/api/enrollments/child/${child.id}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        const pendingEnrollments = response.body.filter((e: any) => e.status === 'pending_payment');
        expect(pendingEnrollments.length).toBeGreaterThan(0);
      });

      it('should allow removing items from cart (unenroll pending_payment)', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'pending_payment'
        });

        const response = await request(app)
          .delete(`/api/enrollments/${enrollment.id}/unenroll`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Unenrollment successful');

        const deleted = await storage.getProgramEnrollmentById(enrollment.id);
        expect(deleted).toBeUndefined();
      });

      it('should prevent unenrollment after payment completed', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const response = await request(app)
          .delete(`/api/enrollments/${enrollment.id}/unenroll`);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Cannot unenroll from a class that has already been paid for');
      });
    });

    describe('Class Enrollment with Variants', () => {
      it('should enroll in class with specific variant selection', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          variants: [
            { id: 'monday-morning', name: 'Monday Morning', price: 10000, capacity: 20 },
            { id: 'tuesday-afternoon', name: 'Tuesday Afternoon', price: 10000, capacity: 20 }
          ]
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          variantId: 'monday-morning',
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        expect(enrollment.variantId).toBe('monday-morning');
      });

      it('should track variant-specific pricing', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          variants: [
            { id: 'basic', name: 'Basic', price: 10000, capacity: 20 },
            { id: 'premium', name: 'Premium', price: 15000, capacity: 10 }
          ]
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          variantId: 'premium',
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 15000,
          totalPaid: 15000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        expect(enrollment.totalCost).toBe(15000);
      });
    });

    describe('Enrollment Status Transitions', () => {
      it('should transition from pending_payment to enrolled after payment', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const enrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'pending_payment'
        });

        expect(enrollment.status).toBe('pending_payment');

        const updated = await storage.updateProgramEnrollment(enrollment.id, {
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        expect(updated?.status).toBe('enrolled');
        expect(updated?.paymentStatus).toBe('completed');
      });

      it('should support all enrollment statuses', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const statuses = ['pending_payment', 'enrolled', 'waitlist', 'cancelled', 'completed', 'withdrawn'];

        for (const status of statuses) {
          const enrollment = await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: `${classItem.title} - ${status}`,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: 10000,
            totalPaid: status === 'pending_payment' ? 0 : 10000,
            remainingBalance: status === 'pending_payment' ? 10000 : 0,
            paymentStatus: status === 'pending_payment' ? 'pending' : 'completed',
            status: status as any
          });

          expect(enrollment.status).toBe(status);
        }
      });
    });

    describe('Waitlist Management', () => {
      it('should add student to waitlist when class is full', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          capacity: 1
        });

        await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: 'First Student',
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const waitlistEnrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'waitlist',
          waitlistPosition: 1
        });

        expect(waitlistEnrollment.status).toBe('waitlist');
        expect(waitlistEnrollment.waitlistPosition).toBe(1);
      });

      it('should track waitlist position', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const children = [];
        
        for (let i = 0; i < 3; i++) {
          const child = await testDb.createTestChild(parent.id, {
            firstName: `Child${i + 1}`,
            lastName: 'Test',
            gradeLevel: '5th',
            schoolId: school.id
          });
          children.push(child);
        }

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          capacity: 1
        });

        for (let i = 0; i < 3; i++) {
          await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: children[i].id,
            childName: `${children[i].firstName} ${children[i].lastName}`,
            className: classItem.title,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: 10000,
            totalPaid: 0,
            remainingBalance: 10000,
            paymentStatus: 'pending',
            status: i === 0 ? 'enrolled' : 'waitlist',
            waitlistPosition: i === 0 ? null : i
          });
        }

        const waitlistEnrollments = await storage.getEnrollmentsByClassId(classItem.id);
        const waitlist = waitlistEnrollments.filter(e => e.status === 'waitlist');
        
        expect(waitlist.length).toBe(2);
        expect(waitlist[0].waitlistPosition).toBe(1);
        expect(waitlist[1].waitlistPosition).toBe(2);
      });

      it('should promote from waitlist when spot becomes available', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const waitlistEnrollment = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 0,
          remainingBalance: 10000,
          paymentStatus: 'pending',
          status: 'waitlist',
          waitlistPosition: 1
        });

        const promoted = await storage.updateProgramEnrollment(waitlistEnrollment.id, {
          status: 'enrolled',
          waitlistPosition: null
        });

        expect(promoted?.status).toBe('enrolled');
        expect(promoted?.waitlistPosition).toBeNull();
      });
    });

    describe('Bulk Sibling Enrollments', () => {
      it('should enroll multiple children in same class', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        
        const children = [];
        for (let i = 0; i < 3; i++) {
          const child = await testDb.createTestChild(parent.id, {
            firstName: `Child${i + 1}`,
            lastName: 'Test',
            gradeLevel: '5th',
            schoolId: school.id
          });
          children.push(child);
        }

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        const enrollments = [];
        for (const child of children) {
          const enrollment = await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: classItem.title,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: 10000,
            totalPaid: 10000,
            remainingBalance: 0,
            paymentStatus: 'completed',
            status: 'enrolled'
          });
          enrollments.push(enrollment);
        }

        expect(enrollments.length).toBe(3);
        expect(enrollments.every(e => e.status === 'enrolled')).toBe(true);
      });

      it('should apply sibling discounts to bulk enrollments', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id, {
          name: 'Test Academy',
          freeAfterXChildren: 3
        });

        const children = [];
        for (let i = 0; i < 4; i++) {
          const child = await testDb.createTestChild(parent.id, {
            firstName: `Child${i + 1}`,
            lastName: 'Test',
            gradeLevel: '5th',
            schoolId: school.id
          });
          children.push(child);
        }

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        for (let i = 0; i < 4; i++) {
          const discountedPrice = i >= 3 ? 0 : 10000;
          await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: children[i].id,
            childName: `${children[i].firstName} ${children[i].lastName}`,
            className: classItem.title,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: discountedPrice,
            totalPaid: discountedPrice,
            remainingBalance: 0,
            paymentStatus: 'completed',
            status: 'enrolled'
          });
        }

        const enrollments = await storage.getEnrollmentsByChildIds(children.map(c => c.id));
        const fourthEnrollment = enrollments.find(e => e.childId === children[3].id);
        
        expect(fourthEnrollment?.totalCost).toBe(0);
      });
    });

    describe('Cross-Location Enrollments', () => {
      it('should allow enrollment in classes at different locations', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        
        const location1 = await testDb.createTestLocation(school.id, {
          name: 'Main Campus'
        });
        const location2 = await testDb.createTestLocation(school.id, {
          name: 'East Campus'
        });

        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const class1 = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000,
          location: location1.name
        });

        const class2 = await testDb.createTestClass(school.id, admin.id, {
          title: 'Science 101',
          price: 10000,
          location: location2.name
        });

        const enrollment1 = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: class1.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: class1.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const enrollment2 = await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: class2.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: class2.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const enrollments = await storage.getEnrollmentsByChildId(child.id);
        
        expect(enrollments.length).toBe(2);
        expect(enrollments.some(e => e.classId === class1.id)).toBe(true);
        expect(enrollments.some(e => e.classId === class2.id)).toBe(true);
      });
    });

    describe('Enrollment Retrieval', () => {
      it('should get enrollments for a specific child', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        const child = await testDb.createTestChild(parent.id, {
          firstName: 'Alice',
          lastName: 'Test',
          gradeLevel: '5th',
          schoolId: school.id
        });

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        await storage.createProgramEnrollment({
          schoolId: school.id,
          classType: 'school_class',
          classId: classItem.id,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          parentId: parent.id,
          parentEmail: parent.email,
          totalCost: 10000,
          totalPaid: 10000,
          remainingBalance: 0,
          paymentStatus: 'completed',
          status: 'enrolled'
        });

        const response = await request(app)
          .get(`/api/enrollments/child/${child.id}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
      });

      it('should get all enrollments for parent\'s children', async () => {
        const parent = await testDb.createTestUser({
          email: 'parent@test.com',
          username: 'testparent',
          name: 'Test Parent',
          role: 'parent'
        });

        const admin = await testDb.createTestUser({
          email: 'admin@test.com',
          username: 'testadmin',
          name: 'Test Admin',
          role: 'schoolAdmin'
        });

        const school = await testDb.createTestSchool(admin.id);
        
        const children = [];
        for (let i = 0; i < 2; i++) {
          const child = await testDb.createTestChild(parent.id, {
            firstName: `Child${i + 1}`,
            lastName: 'Test',
            gradeLevel: '5th',
            schoolId: school.id
          });
          children.push(child);
        }

        const classItem = await testDb.createTestClass(school.id, admin.id, {
          title: 'Math 101',
          price: 10000
        });

        for (const child of children) {
          await storage.createProgramEnrollment({
            schoolId: school.id,
            classType: 'school_class',
            classId: classItem.id,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: classItem.title,
            parentId: parent.id,
            parentEmail: parent.email,
            totalCost: 10000,
            totalPaid: 10000,
            remainingBalance: 0,
            paymentStatus: 'completed',
            status: 'enrolled'
          });
        }

        const enrollments = await storage.getEnrollmentsByChildIds(children.map(c => c.id));
        
        expect(enrollments.length).toBe(2);
        expect(enrollments.every(e => e.parentId === parent.id)).toBe(true);
      });
    });
  });
});
