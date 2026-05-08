import { Router, Request, Response } from 'express';
import { TestDatabase } from '../tests/helpers/testDatabase';
import { storage } from '../storage';
import { nanoid } from 'nanoid';
import { processOneScheduledPayment, recoverOneScheduledPayment } from '../services/auto-pay-scheduler';
import { handleScheduledPaymentFailed } from '../services/auto-pay-webhook-helpers';
import { getDb } from '../db';
import { eq, sql } from 'drizzle-orm';
import {
  programEnrollments,
  stripePaymentHistory,
  credits,
  membershipEnrollments,
  type InsertProgramEnrollment,
  type ProgramEnrollment,
  type InsertCredit,
  type Credit,
  type InsertMembershipEnrollment,
  type MembershipEnrollment,
  type Child,
  type Class,
  type Payment,
} from '@shared/schema';

const router = Router();

// 🔒 SECURITY: Only allow test endpoints in test environment
const testOnlyMiddleware = (req: Request, res: Response, next: Function) => {
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 SECURITY: Test endpoints are not available in production');
    return res.status(403).json({ 
      error: 'Test endpoints are not available in production environment' 
    });
  }
  
  // Require X-Test-Token header
  const testToken = req.headers['x-test-token'];
  if (!testToken || testToken !== 'test-secret-token') {
    return res.status(401).json({ 
      error: 'Missing or invalid test token' 
    });
  }
  
  next();
};

router.use(testOnlyMiddleware);

/**
 * POST /api/test/setup-cart-scenario
 * Seeds parent + child + class + pending program_enrollment for the
 * payment-flow harness. Writes via direct db.insert so MemStorage
 * fallback cannot mask NOT NULL / CHECK violations (Task #203 #1).
 */
router.post('/setup-cart-scenario', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);

    type AllowedPaymentPlan = 'full_payment' | 'deposit_only' | 'biweekly' | 'custom';
    const validPaymentPlans = ['full_payment', 'deposit_only', 'biweekly', 'custom'] as const;
    const isAllowedPaymentPlan = (value: unknown): value is AllowedPaymentPlan =>
      typeof value === 'string' &&
      (validPaymentPlans as readonly string[]).includes(value);
    const requestedPaymentPlan: unknown = req.body?.paymentPlan;
    if (requestedPaymentPlan !== undefined && !isAllowedPaymentPlan(requestedPaymentPlan)) {
      return res.status(400).json({
        error: `Invalid paymentPlan. Must be one of: ${validPaymentPlans.join(', ')}`,
      });
    }
    const paymentPlan: AllowedPaymentPlan = isAllowedPaymentPlan(requestedPaymentPlan)
      ? requestedPaymentPlan
      : 'full_payment';

    const rawWithCredits: unknown = req.body?.withCredits;
    let withCreditsCents = 0;
    if (rawWithCredits !== undefined && rawWithCredits !== false && rawWithCredits !== null) {
      if (typeof rawWithCredits !== 'number' || !Number.isFinite(rawWithCredits) || rawWithCredits < 0) {
        return res.status(400).json({
          error: 'withCredits must be a non-negative integer (amount in cents) or omitted.',
        });
      }
      withCreditsCents = Math.floor(rawWithCredits);
    }
    const withMembership = req.body?.withMembership === true;

    // 1. Create school admin
    // Note: Don't pass password in overrides - let createTestUser hash it properly
    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `admin_${uniqueId}@test.com`,
      username: `testadmin_${uniqueId}`,
      name: 'Test Admin',
      role: 'schoolAdmin'
    });
    const bcrypt = await import('bcryptjs');
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    await storage.updateUser(admin.id, { password: hashedAdminPassword });

    // 2. Create school
    const school = await testDb.createTestSchool(admin.id, {
      name: `Test School Cart ${uniqueId}`,
      registrationCode: `CART${uniqueId.toUpperCase()}`
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    // 3. Create parent user
    const parentEmail = `parent_${uniqueId}@test.com`;
    const parentPassword = 'TestPassword123!';
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `testparent_${uniqueId}`,
      name: 'Test Parent',
      role: 'parent',
      schoolId: school.id
    });
    const hashedParentPassword = await bcrypt.hash(parentPassword, 10);
    await storage.updateUser(parent.id, { password: hashedParentPassword });

    // 4. Create child
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Test',
      lastName: 'Child',
      birthdate: '2015-01-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
      parentEmail: parentEmail
    });

    // 5. Create category (with text `category` column for DB CHECK compatibility)
    const category = await testDb.createTestCategory(school.id, {
      name: `Cart Category ${uniqueId}`
    });

    // 6. Create class
    const classItem = await testDb.createTestClass(school.id, {
      title: `Math Fundamentals Cart Test ${uniqueId}`,
      description: 'Test class for cart persistence',
      price: 10000, // $100.00 in cents
      status: 'upcoming',
      categoryId: category.id,
      category: `Cart Category ${uniqueId}`,
    });

    // 7. Pending enrollment — direct db.insert (no MemStorage fallback).
    //    createTestClass writes to the marketplace `classes` table, so the
    //    enrollment must use classType='marketplace' + marketplaceClassId
    //    (not classId, which FKs to school_classes).
    const enrollmentInsert: InsertProgramEnrollment = {
      childId: child.id,
      classType: 'marketplace',
      marketplaceClassId: classItem.id,
      parentId: parent.id,
      parentEmail,
      schoolId: school.id,
      status: 'pending_payment',
      paymentPlan,
      paymentSystemVersion: 'v2_stripe',
      paymentStatus: 'pending',
      childName: `${child.firstName} ${child.lastName}`,
      className: classItem.title,
      totalCost: 10000,
      totalPaid: 0,
      remainingBalance: 10000,
      depositRequired: 0,
      enrollmentDate: new Date(),
    };

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Postgres required (getDb returned null)' });
    }
    const inserted = await db
      .insert(programEnrollments)
      .values(enrollmentInsert)
      .returning();
    const enrollment: ProgramEnrollment | undefined = inserted[0];
    if (!enrollment) {
      return res.status(500).json({ error: 'enrollment insert returned no row' });
    }

    // 7b. Round-trip SELECT — confirms the row is visible to the same
    //     storage layer that downstream endpoints use. If a NOT NULL or
    //     CHECK violation silently routed us to MemStorage, this lookup
    //     will return undefined and we return 5xx instead of pretending
    //     the seed succeeded (Task #221, ARCHITECTURAL_PATTERNS §11).
    const enrollmentRoundTrip = await storage.getProgramEnrollmentById(enrollment.id);
    if (!enrollmentRoundTrip) {
      return res.status(500).json({
        error: 'enrollment round-trip SELECT returned no row',
        details: `inserted enrollment id=${enrollment.id} not visible to storage.getProgramEnrollmentById`,
      });
    }

    // 8. Optional credit grant — direct insert, status='approved' so the
    //    cart pricing path can spend it. Used to drive the credits-applied
    //    branch of /api/cart/snapshot in regression tests.
    let credit: Credit | null = null;
    if (withCreditsCents > 0) {
      const creditInsert: InsertCredit = {
        userId: parent.id,
        schoolId: school.id,
        creditType: 'marketing',
        creditAmountCents: withCreditsCents,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test seed credit (${withCreditsCents}¢)`,
      };
      const insertedCredits = await db.insert(credits).values(creditInsert).returning();
      credit = insertedCredits[0] ?? null;
      if (!credit) {
        return res.status(500).json({ error: 'credit insert returned no row' });
      }
      const creditRoundTrip = await storage.getCreditById(credit.id);
      if (!creditRoundTrip) {
        return res.status(500).json({
          error: 'credit round-trip SELECT returned no row',
          details: `inserted credit id=${credit.id} not visible to storage.getCreditById`,
        });
      }
    }

    // 9. Optional membership enrollment — direct insert, status='enrolled'
    //    so the cart membership-required branch is satisfied.
    let membership: MembershipEnrollment | null = null;
    if (withMembership) {
      const now = new Date();
      const oneYearOut = new Date(now);
      oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      const membershipAmount = 5000;
      const membershipInsert: InsertMembershipEnrollment = {
        schoolId: school.id,
        parentUserId: parent.id,
        membershipYear: now.getFullYear(),
        amount: membershipAmount,
        amountPaid: membershipAmount,
        remainingBalance: 0,
        totalAmount: membershipAmount,
        balanceDue: 0,
        status: 'enrolled',
        dueDate: now,
        endDate: oneYearOut,
        expirationDate: oneYearOut,
        membershipTier: 'basic',
        startDate: now,
      };
      const insertedMemberships = await db
        .insert(membershipEnrollments)
        .values(membershipInsert)
        .returning();
      membership = insertedMemberships[0] ?? null;
      if (!membership) {
        return res.status(500).json({ error: 'membership insert returned no row' });
      }
      const membershipRoundTrip = await storage.getMembershipEnrollmentById(membership.id);
      if (!membershipRoundTrip) {
        return res.status(500).json({
          error: 'membership round-trip SELECT returned no row',
          details: `inserted membership id=${membership.id} not visible to storage.getMembershipEnrollmentById`,
        });
      }
    }

    console.log(`✅ Created cart test scenario:
      - Parent: ${parentEmail}
      - Child: ${child.firstName} ${child.lastName} (ID: ${child.id})
      - Class: ${classItem.title} (ID: ${classItem.id})
      - Enrollment: ID ${enrollment.id} (status: ${enrollment.status}, totalCost: ${enrollment.totalCost}, remainingBalance: ${enrollment.remainingBalance})
      - School: ${school.name} (Code: ${school.registrationCode})
    `);

    res.json({
      success: true,
      data: {
        parent: {
          email: parentEmail,
          password: parentPassword,
          id: parent.id
        },
        admin: {
          email: admin.email,
          password: adminPassword,
          id: admin.id,
        },
        child: {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName
        },
        class: {
          id: classItem.id,
          title: classItem.title,
          price: classItem.price
        },
        enrollment: {
          id: enrollment.id,
          status: enrollment.status,
          totalCost: enrollment.totalCost,
          remainingBalance: enrollment.remainingBalance,
          paymentPlan: enrollment.paymentPlan,
        },
        school: {
          id: school.id,
          name: school.name,
          registrationCode: school.registrationCode
        },
        credit: credit
          ? { id: credit.id, amountCents: credit.creditAmountCents, status: credit.status }
          : null,
        membership: membership
          ? {
              id: membership.id,
              status: membership.status,
              membershipYear: membership.membershipYear,
              totalAmount: membership.totalAmount,
            }
          : null,
      }
    });

  } catch (error) {
    console.error('❌ Error setting up cart test scenario:', error);
    res.status(500).json({
      error: 'Failed to setup cart test scenario',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/test/setup-multi-enrollment-cart-scenario
 * Seeds a parent + 2 children + 2 pending enrollments so a single
 * PaymentIntent can be allocated across both enrollments by the webhook
 * handler.
 */
router.post('/setup-multi-enrollment-cart-scenario', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    const bcrypt = await import('bcryptjs');

    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `admin_multi_${uniqueId}@test.com`,
      username: `testadmin_multi_${uniqueId}`,
      name: 'Test Admin Multi',
      role: 'schoolAdmin',
    });
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    await storage.updateUser(admin.id, { password: hashedAdminPassword });

    const school = await testDb.createTestSchool(admin.id, {
      name: `Test School Multi ${uniqueId}`,
      registrationCode: `MULT${uniqueId.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const parentEmail = `parent_multi_${uniqueId}@test.com`;
    const parentPassword = 'TestPassword123!';
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `testparent_multi_${uniqueId}`,
      name: 'Test Parent Multi',
      role: 'parent',
      schoolId: school.id,
    });
    const hashedParentPassword = await bcrypt.hash(parentPassword, 10);
    await storage.updateUser(parent.id, { password: hashedParentPassword });

    const childA = await testDb.createTestChild(parent.id, {
      firstName: 'Alice',
      lastName: 'Multi',
      birthdate: '2015-01-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
      parentEmail,
    });
    const childB = await testDb.createTestChild(parent.id, {
      firstName: 'Bob',
      lastName: 'Multi',
      birthdate: '2016-01-01',
      gradeLevel: '2nd Grade',
      schoolId: school.id,
      parentEmail,
    });

    const category = await testDb.createTestCategory(school.id, {
      name: `Multi Category ${uniqueId}`,
    });
    const classA = await testDb.createTestClass(school.id, {
      title: `Multi Class A ${uniqueId}`,
      price: 10000,
      status: 'upcoming',
      categoryId: category.id,
      category: `Multi Category ${uniqueId}`,
    });
    const classB = await testDb.createTestClass(school.id, {
      title: `Multi Class B ${uniqueId}`,
      price: 10000,
      status: 'upcoming',
      categoryId: category.id,
      category: `Multi Category ${uniqueId}`,
    });

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Postgres required (getDb returned null)' });
    }

    const insertEnrollment = async (child: Child, cls: Class): Promise<ProgramEnrollment> => {
      const insert: InsertProgramEnrollment = {
        childId: child.id,
        classType: 'marketplace',
        marketplaceClassId: cls.id,
        parentId: parent.id,
        parentEmail,
        schoolId: school.id,
        status: 'pending_payment',
        paymentPlan: 'full_payment',
        paymentSystemVersion: 'v2_stripe',
        paymentStatus: 'pending',
        childName: `${child.firstName} ${child.lastName}`,
        className: cls.title,
        totalCost: 10000,
        totalPaid: 0,
        remainingBalance: 10000,
        depositRequired: 0,
        enrollmentDate: new Date(),
      };
      const rows = await db.insert(programEnrollments).values(insert).returning();
      if (!rows[0]) throw new Error('enrollment insert returned no row');
      return rows[0];
    };

    const enrollmentA = await insertEnrollment(childA, classA);
    const enrollmentB = await insertEnrollment(childB, classB);

    res.json({
      success: true,
      data: {
        parent: { email: parentEmail, password: parentPassword, id: parent.id },
        school: { id: school.id, name: school.name, registrationCode: school.registrationCode },
        enrollments: [
          {
            id: enrollmentA.id,
            childId: childA.id,
            childName: `${childA.firstName} ${childA.lastName}`,
            classId: classA.id,
            className: classA.title,
            totalCost: enrollmentA.totalCost,
            remainingBalance: enrollmentA.remainingBalance,
          },
          {
            id: enrollmentB.id,
            childId: childB.id,
            childName: `${childB.firstName} ${childB.lastName}`,
            classId: classB.id,
            className: classB.title,
            totalCost: enrollmentB.totalCost,
            remainingBalance: enrollmentB.remainingBalance,
          },
        ],
      },
    });
  } catch (error) {
    console.error('❌ Error setting up multi-enrollment cart scenario:', error);
    res.status(500).json({
      error: 'Failed to setup multi-enrollment cart scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/payment-by-stripe-id/:stripeId
 * Returns the payments-table row whose stripePaymentIntentId matches.
 */
router.get('/payment-by-stripe-id/:stripeId', async (req: Request, res: Response) => {
  try {
    const stripeId = req.params.stripeId;
    if (!stripeId) return res.status(400).json({ error: 'stripeId required' });
    const payment = await storage.getPaymentByStripeId(stripeId);
    return res.json(payment ?? null);
  } catch (error) {
    console.error('[Test] payment-by-stripe-id error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/test/seed-paid-enrollment-with-payment
 * Seeds an enrollment marked paid plus a matching row in the legacy payments
 * table — the same shape the cart/balance webhook path produces. Used by the
 * charge.refunded regression so the refund handler can find the original
 * payment regardless of which success branch (legacy vs PaymentProcessor)
 * actually wrote it in production. Pre-seeding keeps the refund test focused
 * on refund-handling logic in isolation.
 */
router.post('/seed-paid-enrollment-with-payment', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    const bcrypt = await import('bcryptjs');

    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `admin_paid_${uniqueId}@test.com`,
      username: `testadmin_paid_${uniqueId}`,
      name: 'Test Admin Paid',
      role: 'schoolAdmin',
    });
    await storage.updateUser(admin.id, { password: await bcrypt.hash(adminPassword, 10) });

    const school = await testDb.createTestSchool(admin.id, {
      name: `Test School Paid ${uniqueId}`,
      registrationCode: `PAID${uniqueId.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const parentEmail = `parent_paid_${uniqueId}@test.com`;
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `testparent_paid_${uniqueId}`,
      name: 'Test Parent Paid',
      role: 'parent',
      schoolId: school.id,
    });

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Paid',
      lastName: 'Child',
      birthdate: '2015-01-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
      parentEmail,
    });

    const category = await testDb.createTestCategory(school.id, {
      name: `Paid Category ${uniqueId}`,
    });
    const cls = await testDb.createTestClass(school.id, {
      title: `Paid Class ${uniqueId}`,
      price: 10000,
      status: 'upcoming',
      categoryId: category.id,
      category: `Paid Category ${uniqueId}`,
    });

    const totalCost = 10000;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'Postgres required (getDb returned null)' });

    const enrollmentInsert: InsertProgramEnrollment = {
      childId: child.id,
      classType: 'marketplace',
      marketplaceClassId: cls.id,
      parentId: parent.id,
      parentEmail,
      schoolId: school.id,
      status: 'enrolled',
      paymentPlan: 'full_payment',
      paymentSystemVersion: 'v2_stripe',
      paymentStatus: 'completed',
      childName: `${child.firstName} ${child.lastName}`,
      className: cls.title,
      totalCost,
      totalPaid: totalCost,
      remainingBalance: 0,
      depositRequired: 0,
      enrollmentDate: new Date(),
    };
    const [enrollment] = await db.insert(programEnrollments).values(enrollmentInsert).returning();
    if (!enrollment) throw new Error('enrollment insert returned no row');

    const stripePaymentIntentId = `pi_test_seed_${uniqueId}_${Date.now()}`;
    const payment = await storage.createPayment({
      schoolId: school.id,
      parentId: parent.id,
      parentEmail,
      childName: `${child.firstName} ${child.lastName}`,
      className: cls.title,
      description: `Seeded payment for refund test ${uniqueId}`,
      amount: totalCost,
      currency: 'usd',
      status: 'completed',
      stripePaymentIntentId,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      enrollmentIds: [enrollment.id],
      paymentMethod: 'stripe',
      paymentDate: new Date(),
      metadata: { seeded: true, scenario: 'refund-regression' },
    });

    res.json({
      success: true,
      data: {
        parent: { id: parent.id, email: parentEmail },
        school: { id: school.id, name: school.name },
        enrollment: {
          id: enrollment.id,
          totalCost: enrollment.totalCost,
          totalPaid: enrollment.totalPaid,
          remainingBalance: enrollment.remainingBalance,
        },
        payment: {
          id: payment.id,
          stripePaymentIntentId,
          amount: payment.amount,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error seeding paid enrollment with payment:', error);
    res.status(500).json({
      error: 'Failed to seed paid enrollment with payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/refund-payment-for/:originalPaymentId
 * Returns the refund payment row (negative amount, originalPaymentId set).
 */
router.get('/refund-payment-for/:originalPaymentId', async (req: Request, res: Response) => {
  try {
    const originalId = parseInt(req.params.originalPaymentId);
    if (isNaN(originalId)) return res.status(400).json({ error: 'invalid originalPaymentId' });
    const all: Payment[] = await storage.getAllPayments();
    const refund = all.find((p) => p.originalPaymentId === originalId && (p.amount ?? 0) < 0) ?? null;
    return res.json(refund);
  } catch (error) {
    console.error('[Test] refund-payment-for error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/test/manual-payment-enrollment-visibility/:id
 *
 * Exercises the *exact* lookup path that `POST /api/payment-history/manual`
 * uses to find an enrollment: `storage.getAllEnrollments().find(e => e.id === id)`.
 * If the seed silently routed through MemStorage (Task #203 finding #1, Task #221),
 * this lookup returns `visible: false` and the regression test fails.
 *
 * Returns: { visible: boolean, totalEnrollments: number, enrollment: ProgramEnrollment | null }
 */
router.get('/manual-payment-enrollment-visibility/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'enrollment id must be an integer' });
    }
    const allEnrollments: ProgramEnrollment[] = await storage.getAllEnrollments();
    const found: ProgramEnrollment | null =
      allEnrollments.find((e: ProgramEnrollment) => e.id === id) ?? null;
    return res.json({
      visible: found !== null,
      totalEnrollments: allEnrollments.length,
      enrollment: found,
    });
  } catch (error) {
    console.error('[Test] manual-payment-enrollment-visibility error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/program-enrollment/:id — returns the row or null. */
router.get('/program-enrollment/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'enrollment id must be an integer' });
    }
    const enrollment = await storage.getProgramEnrollmentById(id);
    return res.json(enrollment ?? null);
  } catch (error) {
    console.error('[Test] program-enrollment lookup error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/stripe-payment/:paymentIntentId — returns the row or null. */
router.get('/stripe-payment/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const piId = req.params.paymentIntentId;
    if (!piId) {
      return res.status(400).json({ error: 'paymentIntentId required' });
    }
    const record = await storage.getStripePaymentByIntentId(piId);
    return res.json(record ?? null);
  } catch (error) {
    console.error('[Test] stripe-payment lookup error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/task-219-skips/:eventId — Task #219 runtime skip-WARN proof. */
router.get('/task-219-skips/:eventId', async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  if (!eventId) return res.status(400).json({ error: 'eventId required' });
  const { getTask219SkipsForEvent } = await import('../lib/task219SkipLog');
  return res.json({ entries: getTask219SkipsForEvent(eventId) });
});

/**
 * POST /api/test/seed-checkout-owned-pi
 * Pre-inserts a stripe_payment_history row with idempotency_key='checkout:<sessionId>'
 * for the given paymentIntentId — simulating the state where checkout.session.completed
 * has already claimed the PI. Used by the P4 "checkout_session_completed_already_owns"
 * runtime branch test.
 */
router.post('/seed-checkout-owned-pi', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, userId, amount } = req.body ?? {};
    if (!paymentIntentId || !userId) {
      return res.status(400).json({ error: 'paymentIntentId and userId required' });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'Postgres required' });
    const sessionId = `cs_test_seed_${nanoid(8)}`;
    const seedRow: typeof stripePaymentHistory.$inferInsert = {
      userId,
      paymentIntentId,
      customerId: null,
      subscriptionId: null,
      amount: amount ?? 1000,
      currency: 'usd',
      status: 'succeeded',
      paymentMethod: null,
      description: `Pre-seeded checkout-owned PI for ${paymentIntentId}`,
      idempotencyKey: `checkout:${sessionId}`,
      source: 'stripe',
      stripeCreatedAt: new Date(),
    };
    const inserted = await db.insert(stripePaymentHistory).values(seedRow).returning();
    return res.json({ id: inserted[0]?.id, sessionId });
  } catch (error) {
    console.error('[Test] seed-checkout-owned-pi error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/stripe-payment-by-event/:eventId — Task #219 idempotency proof. */
router.get('/stripe-payment-by-event/:eventId', async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId;
    if (!eventId) {
      return res.status(400).json({ error: 'eventId required' });
    }
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'requires Postgres; getDb() returned null.' });
    }
    const rows = await db
      .select()
      .from(stripePaymentHistory)
      .where(eq(stripePaymentHistory.stripeEventId, eventId));
    return res.json({
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        stripeEventId: r.stripeEventId,
        paymentIntentId: r.paymentIntentId,
        amount: r.amount,
        status: r.status,
        idempotencyKey: r.idempotencyKey,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Test] stripe-payment-by-event error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/stripe-payment-count/:paymentIntentId — Task #203 #3. */
router.get('/stripe-payment-count/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const piId = req.params.paymentIntentId;
    if (!piId) {
      return res.status(400).json({ error: 'paymentIntentId required' });
    }
    const db = await getDb();
    if (!db) {
      return res.status(500).json({
        error: 'stripe-payment-count requires Postgres; getDb() returned null.',
      });
    }
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stripePaymentHistory)
      .where(eq(stripePaymentHistory.paymentIntentId, piId));
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (error) {
    console.error('[Test] stripe-payment-count error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/test/login
 * Authenticates a test user without Supabase (for E2E testing)
 * 
 * Body: { email, password }
 * Returns: { success: true, user: {...} } with session cookie set
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    // Look up user by email
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid login credentials',
        details: 'User not found'
      });
    }
    
    // Verify password (bcrypt compare)
    const bcrypt = await import('bcryptjs');
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'Invalid login credentials',
        details: 'Password mismatch'
      });
    }
    
    // Create session (Express session)
    if (req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userEmail = user.email;
    }
    
    console.log(`✅ Test login successful for: ${email} (ID: ${user.id}, Role: ${user.role})`);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        schoolId: user.schoolId
      }
    });
    
  } catch (error) {
    console.error('❌ Error during test login:', error);
    res.status(500).json({ 
      error: 'Login failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test/diagnose-user/:email
 * Check user's status including roles and related data
 */
router.get('/diagnose-user/:email', async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(req.params.email);
    console.log(`🔍 Diagnosing user: ${email}`);
    
    // Get user by email
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.json({
        success: false,
        error: 'User not found',
        email
      });
    }
    
    // Get user roles
    const userRoles = await storage.getUserRolesByUserId(user.id);
    
    // Get children for parent (using email lookup since that's the standard method)
    const children = await storage.getChildrenByParentEmail(user.email);
    
    // Get enrollments for parent
    const parentEnrollments = await storage.getProgramEnrollmentsByParent(user.id);
    
    // Map enrollments to children
    const childrenEnrollments = children.map((child: any) => {
      const enrollments = parentEnrollments.filter((e: any) => e.childId === child.id);
      return {
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        enrollments: enrollments.map((e: any) => ({
          id: e.id,
          status: e.status,
          classId: e.classId
        }))
      };
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        activeRoleId: user.activeRoleId,
        activeRole: user.activeRole
      },
      userRoles: userRoles.map((r: any) => ({
        id: r.id,
        role: r.role,
        schoolId: r.schoolId,
        isPrimary: r.isPrimary
      })),
      children: children.map((c: any) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        schoolId: c.schoolId
      })),
      childrenEnrollments,
      diagnosis: {
        hasUser: true,
        hasRoles: userRoles.length > 0,
        hasActiveRoleId: !!user.activeRoleId,
        hasSchoolId: !!user.schoolId,
        hasChildren: children.length > 0,
        roleCount: userRoles.length,
        childCount: children.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error diagnosing user:', error);
    res.status(500).json({ 
      error: 'Failed to diagnose user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test/debug-parents/:schoolId
 * Debug endpoint to check parent lookup for a school
 */
router.get('/debug-parents/:schoolId', async (req: Request, res: Response) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).json({ error: 'Invalid schoolId' });
    }
    
    console.log(`[DEBUG] Testing getParentsBySchoolId for school ${schoolId}`);
    const parents = await storage.getParentsBySchoolId(schoolId);
    
    res.json({
      success: true,
      schoolId,
      parentCount: parents.length,
      parents: parents.map((p: any) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        firstName: p.firstName,
        lastName: p.lastName,
        schoolId: p.schoolId
      }))
    });
  } catch (error) {
    console.error('[DEBUG] Error testing parents lookup:', error);
    res.status(500).json({ 
      error: 'Failed to test parents lookup',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/test/simulate-409
 * Simulates a 409 conflict response to test checkout retry logic
 * 
 * This endpoint mimics what happens when the server detects a price mismatch
 * and returns authoritative data for the client to retry with.
 * 
 * Used to verify:
 * - Retry count increments correctly (using ref, not state)
 * - After MAX_RETRIES, hasCheckoutConflict flag is set
 * - No infinite loop occurs
 */
router.post('/simulate-409', async (req: Request, res: Response) => {
  try {
    const { attemptNumber = 1 } = req.body;
    
    console.log(`🧪 [Test] Simulating 409 conflict - attempt ${attemptNumber}`);
    
    // Return 409 with authoritative data, simulating UNIFIED_TOTAL_MISMATCH
    res.status(409).json({
      error: 'UNIFIED_TOTAL_MISMATCH',
      message: 'Cart total mismatch detected. Please refresh your cart.',
      details: {
        clientTotal: 10000,
        serverTotal: 12500,
        difference: 2500,
        reason: 'test_simulation'
      },
      authoritative: {
        itemsTotal: 12500,
        membershipAmount: 0,
        membershipAlreadyPaid: true,
        membershipRequired: false,
        membershipSchoolId: null,
        membershipSchoolName: 'Test School',
        membershipYear: new Date().getFullYear(),
        grandTotal: 12500,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0
        },
        schoolSettings: null,
        payableAmount: 12500,
        paymentPlans: []
      }
    });
  } catch (error) {
    console.error('[Test] Error simulating 409:', error);
    res.status(500).json({ 
      error: 'Failed to simulate 409',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/test/cleanup
 * Clears all test data from storage
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    storage.clearAll();
    console.log('✅ Test data cleaned up');
    
    res.json({
      success: true,
      message: 'Test data cleared'
    });
    
  } catch (error) {
    console.error('❌ Error cleaning up test data:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup test data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test/locations
 * Lists all locations in the database for data migration verification
 */
router.get('/locations', async (req: Request, res: Response) => {
  try {
    const locations = await storage.getLocations();
    console.log(`[Test] Found ${locations.length} locations`);
    res.json({ locations, count: locations.length });
  } catch (error) {
    console.error('[Test] Error fetching locations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch locations',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test/school-students
 * Lists all school students by location for data migration verification
 */
router.get('/school-students', async (req: Request, res: Response) => {
  try {
    const allSchoolStudents = await storage.getAllSchoolStudents();
    const locationCounts: Record<number, number> = {};
    for (const ss of allSchoolStudents) {
      const locId = ss.locationId ?? 0;
      locationCounts[locId] = (locationCounts[locId] || 0) + 1;
    }
    console.log(`[Test] School students by location:`, locationCounts);
    res.json({ 
      totalStudents: allSchoolStudents.length,
      byLocation: locationCounts,
      students: allSchoolStudents
    });
  } catch (error) {
    console.error('[Test] Error fetching school students:', error);
    res.status(500).json({ 
      error: 'Failed to fetch school students',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/test/setup-auto-pay-scenario
 * Seeds a self-contained DB state for a named auto-pay guard scenario.
 * Uses nanoid for unique emails to avoid conflicts with existing data.
 *
 * Body: { scenario: 'autopay-disabled' | 'no-payment-method' | 'amount-too-small' |
 *                   'enrollment-paid-in-full' | 'already-processing' }
 * Returns: { scheduledPaymentId, parentId, enrollmentId }
 *
 * Note: 'already-processing' tests the idempotency guard:
 *   A payment already in 'processing' state must not be charged again.
 *   Guard fires before Stripe: sp.status !== 'pending' → return 'skipped'
 *   Status is left unchanged at 'processing'.
 *
 * Note: DB constraints prevent the 'enrollment-not-found' scenario:
 *   scheduled_payments.enrollment_id is NOT NULL + FK to program_enrollments.
 *   Neon also blocks SET session_replication_role = 'replica' (superuser only).
 *   That guard is covered by the code fix in auto-pay-scheduler.ts.
 *
 * Note: DB constraints prevent 'balance-null-still-blocks' scenario:
 *   program_enrollments.remaining_balance is NOT NULL in DB (schema drift).
 *   The ?? fallback is defensive code; the guard is validated by G4.
 */
router.post('/setup-auto-pay-scenario', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.body;
    const validScenarios = [
      'autopay-disabled',
      'no-payment-method',
      'amount-too-small',
      'enrollment-paid-in-full',
      'already-processing',
      'retry-cap-exceeded',
      'staleness-cutoff',
      'stuck-processing-no-pi',
      'credits-partial-cover',
      'credits-full-cover',
      'credits-floor-guard',
      'credits-held-async-fail',
      'comped-credits-full-cover',
      // Task 173 — parent-initiated manual Pay Now where credits fully cover
      // the installment. Mirrors auto-pay's credits-full-cover but uses
      // chargedBy='parent_manual' / completionSource='parent_manual_credits_only'.
      'parent-manual-credits-only',
    ];
    if (!scenario || !validScenarios.includes(scenario)) {
      return res.status(400).json({ error: `Invalid scenario. Must be one of: ${validScenarios.join(', ')}` });
    }

    const uid = nanoid(8);
    const testDb = new TestDatabase();

    // Every scenario needs a school and parent — create minimal shared base
    const admin = await testDb.createTestUser({
      email: `ap_admin_${uid}@test.com`,
      name: 'AutoPay Test Admin',
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `AutoPay School ${uid}`,
      registrationCode: `AP${uid.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    // Determine parent config per scenario
    const isAutoPayEnabled = scenario !== 'autopay-disabled';
    const hasSavedCard = scenario !== 'no-payment-method' && scenario !== 'credits-held-async-fail';

    const parent = await testDb.createTestUser({
      email: `ap_parent_${uid}@test.com`,
      name: 'AutoPay Test Parent',
      role: 'parent',
      schoolId: school.id,
    });
    await storage.updateUser(parent.id, {
      autoPayEnabled: isAutoPayEnabled,
      stripeCustomerId: hasSavedCard ? 'cus_test_placeholder' : null,
      stripeDefaultPaymentMethodId: hasSavedCard ? 'pm_test_placeholder' : null,
    });

    // Create child (required for enrollment FK)
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'AutoPay',
      lastName: 'TestChild',
      birthdate: '2015-01-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
      parentEmail: `ap_parent_${uid}@test.com`,
    });

    // Create a class using DB storage directly (must pass `category` text column required by DB)
    const category = await testDb.createTestCategory(school.id, { name: `AutoPay Category ${uid}` });
    const cls = await testDb.createTestClass(school.id, {
      title: `AutoPay Class ${uid}`,
      price: 10000,
      status: 'upcoming',
      categoryId: category.id,
      category: `AutoPay Category ${uid}`,
    });

    // Create enrollment — must pass all NOT NULL DB columns:
    //   child_name, class_name (text, not null in DB)
    //   status must be one of the CHECK constraint values:
    //     pending_payment|pending_admin_approval|enrolled|waitlist|cancelled|completed|withdrawn|failed
    //   remaining_balance is NOT NULL in DB (schema drift — Drizzle shows nullable but DB enforces NOT NULL)
    const isFullyPaid = scenario === 'enrollment-paid-in-full';
    const isCompedScenario = scenario === 'comped-credits-full-cover';
    const enrollment = await storage.createProgramEnrollment({
      childId: child.id,
      classId: cls.id,
      parentId: parent.id,
      parentEmail: `ap_parent_${uid}@test.com`,
      schoolId: school.id,
      status: 'enrolled',
      paymentPlan: 'biweekly',
      price: 10000,
      totalCost: 10000,
      // comped scenario: 2000¢ comp, 3000¢ already paid, 5000¢ installment left
      totalPaid: isFullyPaid ? 10000 : (isCompedScenario ? 3000 : 5000),
      remainingBalance: isFullyPaid ? 0 : (isCompedScenario ? 5000 : 5000),
      ...(isCompedScenario && { compAmountCents: 2000 }),
      childName: 'AutoPay TestChild',
      className: cls.title,
      paymentType: 'v2_stripe',
    } as any);

    // Determine payment amount, status and date per scenario
    const paymentAmount = scenario === 'amount-too-small' ? 30 : 5000;
    const paymentStatus =
      scenario === 'already-processing' || scenario === 'stuck-processing-no-pi' ? 'processing' : 'pending';
    const yesterday = new Date(Date.now() - 86400000);
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000);
    const scheduledDate = scenario === 'staleness-cutoff' ? twentyDaysAgo : yesterday;

    const scheduledPayment = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: `ap_parent_${uid}@test.com`,
      amount: paymentAmount,
      currency: 'usd',
      scheduledDate,
      frequency: 'one_time',
      installmentNumber: 2,
      totalInstallments: 2,
      status: paymentStatus,
    });

    // For retry-cap-exceeded: set retryCount to MAX so the guard fires immediately
    if (scenario === 'retry-cap-exceeded') {
      await storage.updateScheduledPayment(scheduledPayment.id, { retryCount: 3 });
    }

    // For credit scenarios: seed an approved credit record for the parent
    // credits-partial-cover: credit (2000¢) < installment (5000¢) → card charged net remainder (3000¢)
    // credits-full-cover:   credit (5000¢) = installment (5000¢) → no Stripe charge at all
    // credits-floor-guard:  credit would push charge below $0.50 → cap credits, charge exactly 50¢
    let seededCreditId: number | null = null;

    if (scenario === 'credits-partial-cover') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 2000,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Partial Credit ${uid}`,
        description: 'Seeded for credits-partial-cover integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;
    }

    if (scenario === 'credits-full-cover') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 5000,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Full Credit ${uid}`,
        description: 'Seeded for credits-full-cover integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;
    }

    if (scenario === 'credits-floor-guard') {
      // Installment is 5000¢; credit is 4980¢ — naive application would leave 20¢ charge which is below $0.50.
      // The floor guard must cap credits so charge stays at exactly 50¢ (credits applied: 4950¢).
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 4980,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Floor Guard Credit ${uid}`,
        description: 'Seeded for credits-floor-guard integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;
    }

    // credits-held-async-fail: seed a credit and create a credit hold to simulate
    // an async payment failure where the hold should be released by the webhook handler.
    let seededHoldSessionId: string | null = null;
    if (scenario === 'credits-held-async-fail') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 2000,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Async Fail Credit ${uid}`,
        description: 'Seeded for credits-held-async-fail integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;

      // Create a credit hold to simulate the scheduler reserving credits before Stripe call
      const holdSessionId = `hold_test_${uid}`;
      await storage.createCreditHolds(parent.id, 2000, holdSessionId, 'Test hold for async-fail scenario', 60);
      seededHoldSessionId = holdSessionId;

      // Store holdSessionId in the scheduled payment metadata so the simulate endpoint can read it
      await storage.updateScheduledPayment(scheduledPayment.id, {
        metadata: { creditHoldSessionId: holdSessionId } as any,
      });
    }

    // parent-manual-credits-only: seed a credit that fully covers the
    // installment so the parent-initiated Pay Now flow takes the credits-only
    // zero-charge branch (no Stripe call, chargedBy='parent_manual').
    if (scenario === 'parent-manual-credits-only') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 5000,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Parent-Manual Credit ${uid}`,
        description: 'Seeded for parent-manual-credits-only integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;
    }

    // comped-credits-full-cover: seed a credit that fully covers the installment.
    // The enrollment has compAmountCents=2000, so effective cost = 8000; totalPaid=3000 → 5000 left.
    // After auto-pay, newTotalPaid=8000, newBalance=max(0,10000-8000-2000)=0 → paymentStatus='completed'.
    if (scenario === 'comped-credits-full-cover') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 5000,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Comped Full Credit ${uid}`,
        description: 'Seeded for comped-credits-full-cover integration test',
        sourceType: 'manual_grant',
        sourceId: null,
        expiresAt: null,
        rejectionReason: null,
        notes: null,
        metadata: null,
      } as any);
      seededCreditId = credit.id;
    }

    console.log(`✅ Auto-pay scenario seeded: ${scenario} (paymentId=${scheduledPayment.id}, parentId=${parent.id})`);

    return res.json({
      success: true,
      scenario,
      scheduledPaymentId: scheduledPayment.id,
      parentId: parent.id,
      parentEmail: `ap_parent_${uid}@test.com`,
      enrollmentId: enrollment.id,
      schoolId: school.id,
      ...(seededCreditId !== null && { creditId: seededCreditId }),
      ...(seededHoldSessionId !== null && { holdSessionId: seededHoldSessionId }),
    });
  } catch (error) {
    console.error('[Test] Error seeding auto-pay scenario:', error);
    return res.status(500).json({
      error: 'Failed to seed auto-pay scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/run-auto-pay-for/:scheduledPaymentId
 * Runs processOneScheduledPayment() for exactly one payment record.
 * Only touches the specified payment — no other DB records affected.
 *
 * Returns: { result: 'charged' | 'skipped' | 'failed' }
 */
router.post('/run-auto-pay-for/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const result = await processOneScheduledPayment(sp);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('[Test] Error running auto-pay for payment:', error);
    return res.status(500).json({
      error: 'Failed to run auto-pay for payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/run-parent-manual-credits-only/:scheduledPaymentId
 *
 * Task 173 — exercises the credits-only branch of the parent-initiated
 * Pay Now flow without going through Supabase auth or Stripe. The test
 * runs the same `createCreditHolds` → `completeCreditsOnlyPayment`
 * sequence with `chargedBy='parent_manual'` /
 * `completionSource='parent_manual_credits_only'` so we can assert that
 * the manual flow shares the auto-pay credit guarantees.
 *
 * Returns: { result: 'completed' | 'failed', creditsApplied, originalAmount, error? }
 */
router.post('/run-parent-manual-credits-only/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const { computeManualPayCredits } = await import('../utils/manualPayCredits');
    const availableCreditsRows = await storage.getAvailableCredits(sp.parentId);
    const totalAvailable = availableCreditsRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const decision = computeManualPayCredits({
      amount: sp.amount,
      availableCredits: totalAvailable,
      applyCredits: true,
    });

    if (!decision.isCreditsOnly) {
      return res.status(400).json({
        error: 'Scenario does not produce a credits-only decision',
        decision,
      });
    }

    const holdSessionId = `parent_manual_credits_${sp.id}_${Date.now()}`;
    const enrollment = sp.enrollmentId
      ? await storage.getProgramEnrollmentById(sp.enrollmentId)
      : null;
    let holdsCreated = false;
    try {
      const { totalHeld } = await storage.createCreditHolds(
        sp.parentId,
        decision.creditsToApply,
        holdSessionId,
        `Parent-manual credits-only payment for scheduled payment ${sp.id}`,
        5,
      );
      if (totalHeld < decision.creditsToApply) {
        throw new Error(`Could not reserve enough credits: needed ${decision.creditsToApply}¢, reserved ${totalHeld}¢`);
      }
      holdsCreated = true;

      await storage.completeCreditsOnlyPayment({
        holdSessionId,
        scheduledPaymentId: sp.id,
        parentId: sp.parentId,
        enrollmentId: sp.enrollmentId ?? null,
        schoolId: sp.schoolId,
        creditsApplied: decision.creditsToApply,
        originalAmount: sp.amount,
        installmentNumber: sp.installmentNumber || 1,
        totalInstallments: sp.totalInstallments || 1,
        parentEmail: sp.parentEmail,
        childName: enrollment?.childName ?? null,
        className: enrollment?.className ?? null,
        chargedBy: 'parent_manual',
        completionSource: 'parent_manual_credits_only',
        description:
          `Parent-manual installment ${sp.installmentNumber || 1}` +
          `/${sp.totalInstallments || 1} — fully covered by credits`,
      });

      return res.json({
        success: true,
        result: 'completed',
        creditsApplied: decision.creditsToApply,
        originalAmount: sp.amount,
      });
    } catch (err: any) {
      if (holdsCreated) {
        try {
          await storage.releaseCreditHolds(holdSessionId);
        } catch (releaseErr) {
          console.error('[Test] Failed to release holds after failure:', releaseErr);
        }
      }
      return res.json({
        success: false,
        result: 'failed',
        error: err?.message || String(err),
      });
    }
  } catch (error) {
    console.error('[Test] Error running parent-manual credits-only:', error);
    return res.status(500).json({
      error: 'Failed to run parent-manual credits-only',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/run-parent-manual-divergence-guard/:scheduledPaymentId
 *
 * Task 173 — exercises the divergence guard from `/api/scheduled-payments/pay`
 * directly so integration tests can prove the 409 short-circuit fires when a
 * client supplies a stale `expectedChargeAmount`. Mirrors the same
 * `computeManualPayCredits` + `isChargeAmountDivergent` pair the production
 * handler uses, plus the `emitDivergenceAlert` side-effect (write to
 * `error_logs`).
 *
 * Body: { expectedChargeAmount: number; applyCredits?: boolean }
 * Returns the same shape `/pay` would (200 success or 409 charge_amount_diverged).
 */
router.post('/run-parent-manual-divergence-guard/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const { computeManualPayCredits, isChargeAmountDivergent } = await import('../utils/manualPayCredits');
    const expectedChargeAmount = req.body?.expectedChargeAmount;
    const applyCredits = req.body?.applyCredits !== false;

    // Mirror /pay: expectedChargeAmount is mandatory (Task 173).
    if (
      typeof expectedChargeAmount !== 'number' ||
      !Number.isFinite(expectedChargeAmount) ||
      expectedChargeAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        code: 'expected_charge_amount_required',
        error: 'expectedChargeAmount is required',
      });
    }

    const availableCreditsRows = await storage.getAvailableCredits(sp.parentId);
    const totalAvailable = availableCreditsRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const decision = computeManualPayCredits({
      amount: sp.amount,
      availableCredits: totalAvailable,
      applyCredits,
    });

    if (isChargeAmountDivergent(expectedChargeAmount, decision.chargeAmount)) {
      // Mirror the production alert side-effect so tests can verify it.
      try {
        await storage.createErrorLog({
          errorType: 'payment',
          severity: 'high',
          message:
            `Pay Now charge amount diverged from displayed amount ` +
            `(expected ${expectedChargeAmount}¢, server ${decision.chargeAmount}¢) ` +
            `for parent ${sp.parentEmail}. Charge was blocked.`,
          route: '/api/scheduled-payments/pay',
          method: 'POST',
          userEmail: sp.parentEmail,
          schoolId: sp.schoolId,
          stackTrace: null,
          metadata: {
            paymentId: sp.id,
            parentId: sp.parentId,
            expectedChargeAmount,
            actualChargeAmount: decision.chargeAmount,
            creditsApplied: decision.creditsToApply,
            originalAmount: sp.amount,
            source: 'pay',
            detectedAt: new Date().toISOString(),
          },
          notificationSent: false,
        });
      } catch (alertErr) {
        console.error('[Test] Failed to emit divergence alert:', alertErr);
      }
      return res.status(409).json({
        success: false,
        code: 'charge_amount_diverged',
        error:
          'The amount we are about to charge no longer matches what was shown. ' +
          'Please refresh the page and try again.',
        expectedChargeAmount,
        // Task 193 — mirror the production handler's contract: client reads
        // `serverChargeAmount`; `actualChargeAmount` kept for backward-compat.
        serverChargeAmount: decision.chargeAmount,
        actualChargeAmount: decision.chargeAmount,
        creditsApplied: decision.creditsToApply,
        originalAmount: sp.amount,
      });
    }

    return res.json({
      success: true,
      chargeAmount: decision.chargeAmount,
      creditsApplied: decision.creditsToApply,
      originalAmount: sp.amount,
      isCreditsOnly: decision.isCreditsOnly,
    });
  } catch (error) {
    console.error('[Test] Error running divergence guard:', error);
    return res.status(500).json({
      error: 'Failed to run divergence guard',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/run-stale-pi-credits-only-transition/:scheduledPaymentId
 *
 * Task 173 — exercises `cancelStalePiForCreditsOnlyTransition` directly.
 * Pre-flips the row into `processing` with a fake stale PI ID, then runs
 * the helper that the production /pay handler calls before its credits-only
 * branch. Stripe's retrieve call will fail (the PI is fake) and the helper
 * returns 'gone', but the post-conditions on the DB row are the same:
 *   - status reset to 'pending'
 *   - stripePaymentIntentId cleared
 *   - metadata flags previousStripePaymentIntentId, stalePiCancelledAt,
 *     canceledDueToCreditsOnly=true, stalePiCancelOutcome
 * After the helper completes, the credits-only branch is executed via
 * `completeCreditsOnlyPayment` so callers can assert the row was settled
 * and credits were consumed despite the prior PI.
 *
 * Body: { fakeStalePaymentIntentId?: string }
 */
router.post('/run-stale-pi-credits-only-transition/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const stalePiId: string =
      typeof req.body?.fakeStalePaymentIntentId === 'string' && req.body.fakeStalePaymentIntentId.length > 0
        ? req.body.fakeStalePaymentIntentId
        : `pi_test_fake_stale_${id}_${Date.now()}`;

    // Step 1: pre-flip the row into 'processing' with the stale PI attached.
    await storage.updateScheduledPayment(id, {
      status: 'processing',
      stripePaymentIntentId: stalePiId,
    });

    // Step 2: run the production helper.
    const { cancelStalePiForCreditsOnlyTransition } = await import('./scheduled-payments');
    const outcome = await cancelStalePiForCreditsOnlyTransition(stalePiId, [id]);

    // Step 3: read back the row and surface its post-state.
    const after = await storage.getScheduledPaymentById(id);
    if (!after) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const meta = (after.metadata as Record<string, any>) || {};

    if (outcome === 'not_cancelable') {
      return res.status(409).json({
        success: false,
        code: 'stale_pi_not_cancelable',
        rowAfter: {
          status: after.status,
          stripePaymentIntentId: after.stripePaymentIntentId,
          metadata: meta,
        },
      });
    }

    // Step 4: complete the credits-only path so the test can also verify the
    // installment ends up `completed` after the stale-PI transition.
    const { computeManualPayCredits } = await import('../utils/manualPayCredits');
    const availableCreditsRows = await storage.getAvailableCredits(after.parentId);
    const totalAvailable = availableCreditsRows.reduce(
      (sum, c) => sum + (c.creditAmountCents - (c.usedAmountCents || 0)),
      0,
    );
    const decision = computeManualPayCredits({
      amount: after.amount,
      availableCredits: totalAvailable,
      applyCredits: true,
    });
    if (!decision.isCreditsOnly) {
      return res.status(400).json({
        error: 'Scenario does not produce a credits-only decision after PI cleanup',
        decision,
      });
    }
    const holdSessionId = `parent_manual_credits_after_stale_${id}_${Date.now()}`;
    const enrollment = after.enrollmentId
      ? await storage.getProgramEnrollmentById(after.enrollmentId)
      : null;
    const { totalHeld } = await storage.createCreditHolds(
      after.parentId,
      decision.creditsToApply,
      holdSessionId,
      `Parent-manual credits-only payment for scheduled payment ${id} (after stale PI)`,
      5,
    );
    if (totalHeld < decision.creditsToApply) {
      await storage.releaseCreditHolds(holdSessionId);
      throw new Error(`Could not reserve enough credits: needed ${decision.creditsToApply}¢, reserved ${totalHeld}¢`);
    }
    await storage.completeCreditsOnlyPayment({
      holdSessionId,
      scheduledPaymentId: id,
      parentId: after.parentId,
      enrollmentId: after.enrollmentId ?? null,
      schoolId: after.schoolId,
      creditsApplied: decision.creditsToApply,
      originalAmount: after.amount,
      installmentNumber: after.installmentNumber || 1,
      totalInstallments: after.totalInstallments || 1,
      parentEmail: after.parentEmail,
      childName: enrollment?.childName ?? null,
      className: enrollment?.className ?? null,
      chargedBy: 'parent_manual',
      completionSource: 'parent_manual_credits_only',
      description: `Parent-manual installment — fully covered by credits (after stale PI cleanup)`,
    });

    const final = await storage.getScheduledPaymentById(id);
    return res.json({
      success: true,
      outcome,
      stalePaymentIntentId: stalePiId,
      rowAfterCancel: {
        status: after.status,
        stripePaymentIntentId: after.stripePaymentIntentId,
        metadata: meta,
      },
      rowAfterComplete: {
        status: final?.status,
        stripePaymentIntentId: final?.stripePaymentIntentId,
        chargedBy: final?.chargedBy,
        completionSource: final?.completionSource,
      },
    });
  } catch (error) {
    console.error('[Test] Error running stale-PI credits-only transition:', error);
    return res.status(500).json({
      error: 'Failed to run stale-PI credits-only transition',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/count-error-logs?errorType=...&severity=...
 * Returns the count of error_log rows matching the filters. Used by Task 173
 * tests to assert the divergence guard wrote an audit alert.
 */
router.get('/count-error-logs', async (req: Request, res: Response) => {
  try {
    const filters: { errorType?: string; severity?: string } = {};
    if (typeof req.query.errorType === 'string') filters.errorType = req.query.errorType;
    if (typeof req.query.severity === 'string') filters.severity = req.query.severity;
    const logs = await storage.getErrorLogs({ ...filters, limit: 10000 });
    return res.json({ success: true, count: logs.length });
  } catch (error) {
    console.error('[Test] Error counting error_logs:', error);
    return res.status(500).json({
      error: 'Failed to count error_logs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/scheduled-payment/:id
 * Returns the current state of a scheduled payment record.
 * Used by tests to assert final status after triggering the scheduler.
 */
router.get('/scheduled-payment/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const payment = await storage.getScheduledPaymentById(id);
    if (!payment) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    return res.json({ success: true, payment });
  } catch (error) {
    console.error('[Test] Error fetching scheduled payment:', error);
    return res.status(500).json({
      error: 'Failed to fetch scheduled payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/run-recovery-for/:scheduledPaymentId
 * Calls recoverOneScheduledPayment() directly for a specific payment ID.
 * Bypasses the olderThanMinutes time filter — intended for test use only.
 *
 * Returns: { result: 'reset' | 'completed' | 'failed' | 'left-alone' }
 */
router.post('/run-recovery-for/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const result = await recoverOneScheduledPayment(sp);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('[Test] Error running recovery for payment:', error);
    return res.status(500).json({
      error: 'Failed to run recovery for payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/due-scheduled-payments
 * Returns IDs of pending payments within the 14-day staleness window.
 * Used by G7 to verify that stale payments are excluded at the DB level.
 *
 * Returns: { paymentIds: number[] }
 */
router.get('/due-scheduled-payments', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const payments = await storage.getDueScheduledPayments(today, 14);
    return res.json({
      success: true,
      paymentIds: payments.map((p: any) => p.id),
      count: payments.length,
    });
  } catch (error) {
    console.error('[Test] Error fetching due scheduled payments:', error);
    return res.status(500).json({
      error: 'Failed to fetch due scheduled payments',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/enrollment/:id
 * Returns the current state of a program enrollment record.
 * Used by G10 to assert enrollment balance after credits-only auto-pay completes.
 */
router.get('/enrollment/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const enrollment = await storage.getProgramEnrollmentById(id);
    if (!enrollment) return res.status(404).json({ error: `Enrollment ${id} not found` });

    return res.json({ success: true, enrollment });
  } catch (error) {
    console.error('[Test] Error fetching enrollment:', error);
    return res.status(500).json({
      error: 'Failed to fetch enrollment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/credit/:id
 * Returns the current state of a credit record.
 * Used by G10 to assert usedAmountCents after credits-only auto-pay completes.
 */
router.get('/credit/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const credit = await storage.getCreditById(id);
    if (!credit) return res.status(404).json({ error: `Credit ${id} not found` });

    return res.json({ success: true, credit });
  } catch (error) {
    console.error('[Test] Error fetching credit:', error);
    return res.status(500).json({
      error: 'Failed to fetch credit',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/simulate-credits-only-payment/:scheduledPaymentId
 * Directly invokes the completeCreditsOnlyPayment storage path for a scheduled payment.
 * Bypasses the AUTO_APPLY_CREDITS feature flag so Bug 3 can be tested regardless of env.
 *
 * This tests Bug 3: balance formula must include compAmountCents when computing newBalance
 * and when determining whether paymentStatus should become 'completed'.
 *
 * Returns: { paymentStatus, remainingBalance, totalPaid }
 */
router.post('/simulate-credits-only-payment/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const enrollment = sp.enrollmentId ? await storage.getProgramEnrollmentById(sp.enrollmentId) : null;
    if (!enrollment) return res.status(400).json({ error: 'No enrollment found for scheduled payment' });

    const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
    if (!parent) return res.status(400).json({ error: 'No parent found for scheduled payment' });

    const holdSessionId = `test_credits_only_${id}_${Date.now()}`;

    await storage.createCreditHolds(parent.id, sp.amount, holdSessionId, `Test credits-only hold for sp ${id}`, 60);

    await storage.completeCreditsOnlyPayment({
      holdSessionId,
      scheduledPaymentId: sp.id,
      parentId: parent.id,
      enrollmentId: sp.enrollmentId,
      schoolId: sp.schoolId,
      creditsApplied: sp.amount,
      originalAmount: sp.amount,
      installmentNumber: sp.installmentNumber || 1,
      totalInstallments: sp.totalInstallments || 1,
      parentEmail: parent.email,
      childName: enrollment.childName,
      className: enrollment.className,
    });

    const updatedEnrollment = sp.enrollmentId ? await storage.getProgramEnrollmentById(sp.enrollmentId) : null;
    return res.json({
      success: true,
      paymentStatus: updatedEnrollment?.paymentStatus,
      remainingBalance: updatedEnrollment?.remainingBalance,
      totalPaid: updatedEnrollment?.totalPaid,
    });
  } catch (error) {
    console.error('[Test] Error simulating credits-only payment:', error);
    return res.status(500).json({
      error: 'Failed to simulate credits-only payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/simulate-async-payment-failed/:scheduledPaymentId
 * Simulates the payment_intent.payment_failed webhook path for a payment that
 * has a creditHoldSessionId in its metadata.
 *
 * This tests Bug 2: credit holds must be released immediately on async payment
 * failure rather than waiting for the 60-minute TTL.
 *
 * Returns: { releasedCount, totalReleased }
 */
router.post('/simulate-async-payment-failed/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const meta = (sp.metadata as Record<string, any>) || {};

    const result = await handleScheduledPaymentFailed(id, {
      parentEmail: meta.parentEmail ?? sp.parentEmail ?? '',
      creditHoldSessionId: meta.creditHoldSessionId,
      lastPaymentErrorMessage: 'Async payment failure (test simulation)',
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Test] Error simulating async payment failed:', error);
    return res.status(500).json({
      error: 'Failed to simulate async payment failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});


// ─── Membership Idempotency Test Endpoints ────────────────────────────────────

/**
 * POST /api/test/membership-idempotency/setup
 * Seeds a clean parent + school with NO membership enrollment yet.
 * Returns { parentId, schoolId, membershipYear, paymentIntentId }
 */
router.post('/membership-idempotency/setup', async (req: Request, res: Response) => {
  try {
    const uid = nanoid(8);
    const testDb = new TestDatabase();
    const overrideSchoolId: number | undefined = req.body.schoolId;

    let schoolId: number;
    if (overrideSchoolId) {
      const existing = await storage.getSchool(overrideSchoolId);
      if (!existing) {
        return res.status(400).json({ error: `schoolId ${overrideSchoolId} not found` });
      }
      schoolId = overrideSchoolId;
    } else {
      const admin = await testDb.createTestUser({
        email: `mi_admin_${uid}@test.com`,
        name: 'MI Test Admin',
        role: 'schoolAdmin',
      });
      const school = await testDb.createTestSchool(admin.id, {
        name: `MI School ${uid}`,
        registrationCode: `MI${uid.toUpperCase()}`,
      });
      schoolId = school.id;
    }

    const parent = await testDb.createTestUser({
      email: `mi_parent_${uid}@test.com`,
      name: 'MI Test Parent',
      role: 'parent',
      schoolId,
    });

    const membershipYear = req.body.membershipYear ?? new Date().getFullYear();
    const paymentIntentId = `pi_test_mi_${uid}`;

    return res.json({
      parentId: parent.id,
      schoolId,
      membershipYear,
      membershipAmount: req.body.membershipAmount ?? 10000,
      paymentIntentId,
    });
  } catch (error) {
    console.error('[Test] membership-idempotency/setup error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/test/membership-idempotency/simulate-confirm
 * Mirrors the confirm endpoint's !memberId / first-time-payer membership logic (post-#134).
 * Body: { parentId, schoolId, membershipYear, membershipAmount, paymentIntentId }
 * Returns { membershipId, action: 'created' | 'updated' | 'skipped' }
 */
router.post('/membership-idempotency/simulate-confirm', async (req: Request, res: Response) => {
  try {
    const { parentId, schoolId, membershipYear, membershipAmount, paymentIntentId } = req.body;
    if (!parentId || !schoolId || !membershipYear || !paymentIntentId) {
      return res.status(400).json({ error: 'parentId, schoolId, membershipYear, paymentIntentId required' });
    }
    const amount = membershipAmount ?? 10000;

    const existing = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentId, schoolId, membershipYear
    );

    if (existing) {
      // Idempotency: if this paymentIntent already recorded, skip
      if (existing.notes?.includes(paymentIntentId)) {
        return res.json({ membershipId: existing.id, action: 'skipped' });
      }
      // Update existing record to enrolled
      const startDate = new Date();
      const expirationDate = new Date(startDate);
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      await storage.updateMembershipEnrollment(existing.id, {
        status: 'enrolled',
        amountPaid: amount,
        remainingBalance: 0,
        balanceDue: 0,
        startDate,
        renewalDate: expirationDate,
        expirationDate,
        notes: `${existing.notes || ''} | Updated via cart checkout (${paymentIntentId})`.trim(),
      });
      return res.json({ membershipId: existing.id, action: 'updated' });
    }

    // No existing record — create new enrolled membership
    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    const created = await storage.createMembershipEnrollment({
      schoolId,
      parentUserId: parentId,
      membershipYear,
      membershipTier: 'basic',
      amount,
      amountPaid: amount,
      remainingBalance: 0,
      totalAmount: amount,
      balanceDue: 0,
      status: 'enrolled',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      startDate,
      renewalDate: expirationDate,
      dueDate: startDate,
      endDate: expirationDate,
      expirationDate,
      gracePeriodEnd: null,
      paymentMethod: 'other',
      notes: `Stripe payment via cart checkout (${paymentIntentId}) - confirmed via confirm endpoint`,
    });
    return res.json({ membershipId: created.id, action: 'created' });
  } catch (error) {
    console.error('[Test] membership-idempotency/simulate-confirm error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/test/membership-idempotency/simulate-webhook
 * Mirrors the handleDirectPaymentSuccess webhook membership logic.
 * Body: { parentId, schoolId, membershipYear, membershipAmount, paymentIntentId }
 * Returns { membershipId, action: 'created' | 'updated' | 'skipped' }
 */
router.post('/membership-idempotency/simulate-webhook', async (req: Request, res: Response) => {
  try {
    const { parentId, schoolId, membershipYear, membershipAmount, paymentIntentId } = req.body;
    if (!parentId || !schoolId || !membershipYear || !paymentIntentId) {
      return res.status(400).json({ error: 'parentId, schoolId, membershipYear, paymentIntentId required' });
    }
    const amount = membershipAmount ?? 10000;

    const existing = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentId, schoolId, membershipYear
    );

    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    if (existing) {
      if (existing.status === 'enrolled') {
        // Already enrolled — webhook idempotency: skip entirely
        return res.json({ membershipId: existing.id, action: 'skipped' });
      }
      // pending_payment or other status — update to enrolled
      await storage.updateMembershipEnrollment(existing.id, {
        status: 'enrolled',
        amountPaid: amount,
        remainingBalance: 0,
        balanceDue: 0,
        startDate,
        renewalDate: expirationDate,
        expirationDate,
        notes: `Stripe payment via cart checkout (${paymentIntentId})`,
      });
      return res.json({ membershipId: existing.id, action: 'updated' });
    }

    // No existing record — create new enrolled membership
    const created = await storage.createMembershipEnrollment({
      schoolId,
      parentUserId: parentId,
      membershipYear,
      membershipTier: 'basic',
      amount,
      amountPaid: amount,
      remainingBalance: 0,
      totalAmount: amount,
      balanceDue: 0,
      status: 'enrolled',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      startDate,
      renewalDate: expirationDate,
      dueDate: startDate,
      endDate: expirationDate,
      expirationDate,
      gracePeriodEnd: null,
      paymentMethod: 'other',
      notes: `Stripe payment via cart checkout (${paymentIntentId})`,
    });
    return res.json({ membershipId: created.id, action: 'created' });
  } catch (error) {
    console.error('[Test] membership-idempotency/simulate-webhook error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/test/membership-idempotency/enrollment/:parentId/:schoolId/:year
 * Returns the current membership enrollment record for audit assertions.
 */
router.get('/membership-idempotency/enrollment/:parentId/:schoolId/:year', async (req: Request, res: Response) => {
  try {
    const parentId = parseInt(req.params.parentId);
    const schoolId = parseInt(req.params.schoolId);
    const year = parseInt(req.params.year);
    if (isNaN(parentId) || isNaN(schoolId) || isNaN(year)) {
      return res.status(400).json({ error: 'parentId, schoolId, year must be integers' });
    }
    const enrollment = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(parentId, schoolId, year);
    return res.json(enrollment ?? null);
  } catch (error) {
    console.error('[Test] membership-idempotency/enrollment lookup error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

export default router;
