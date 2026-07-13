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
  refundEvents,
  credits,
  userRoles,
  membershipEnrollments,
  type InsertProgramEnrollment,
  type ProgramEnrollment,
  type InsertCredit,
  type Credit,
  type InsertMembershipEnrollment,
  type MembershipEnrollment,
  sessions,
  type Child,
  type Class,
  type Payment,
  type InsertScheduledPayment,
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

/** Links a seeded DB user to Supabase Auth so Playwright can sign in via /login. */
async function linkSeedUserToSupabase(params: {
  dbUserId: number;
  email: string;
  password: string;
  role: string;
  schoolId: number;
  displayName: string;
}): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return false;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    app_metadata: {
      role: params.role,
      school_id: params.schoolId,
    },
    user_metadata: {
      name: params.displayName,
    },
  });

  let supabaseUserId: string | null = null;

  if (createErr) {
    const msg = (createErr.message || '').toLowerCase();
    const already =
      msg.includes('already') ||
      msg.includes('registered') ||
      (createErr as { code?: string }).code === 'email_exists';
    if (!already) {
      throw new Error(createErr.message);
    }
    let match: { id: string } | undefined;
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: pageNum,
        perPage: 200,
      });
      if (listErr || !listData?.users?.length) {
        break;
      }
      match = listData.users.find((u) => u.email?.toLowerCase() === params.email.toLowerCase());
      if (match) {
        break;
      }
      if (listData.users.length < 200) {
        break;
      }
    }
    if (!match) {
      throw new Error('Supabase reported existing user but listUsers did not return a match');
    }
    supabaseUserId = match.id;
    await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      password: params.password,
      email_confirm: true,
      app_metadata: { role: params.role, school_id: params.schoolId },
    });
  } else if (created.user?.id) {
    supabaseUserId = created.user.id;
  }

  if (supabaseUserId) {
    await storage.updateUser(params.dbUserId, { supabaseId: supabaseUserId });
    return true;
  }
  return false;
}

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

    /** When > 0, school requires membership at this fee and no enrolled membership row is created (for checkout E2E). */
    let unpaidMembershipFeeCents = 0;
    const rawUnpaid = req.body?.unpaidMembershipFeeCents;
    if (rawUnpaid !== undefined && rawUnpaid !== null && rawUnpaid !== false) {
      if (typeof rawUnpaid !== 'number' || !Number.isFinite(rawUnpaid) || rawUnpaid <= 0) {
        return res.status(400).json({
          error: 'unpaidMembershipFeeCents must be a positive integer (cents) or omitted.',
        });
      }
      unpaidMembershipFeeCents = Math.floor(rawUnpaid);
    }
    if (unpaidMembershipFeeCents > 0 && withMembership) {
      return res.status(400).json({
        error: 'Use either unpaidMembershipFeeCents (unpaid fee at checkout) or withMembership (pre-paid row), not both.',
      });
    }

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

    if (unpaidMembershipFeeCents > 0) {
      await storage.updateSchool(school.id, {
        membershipRequired: true,
        membershipFeeAmount: unpaidMembershipFeeCents,
      });
    }

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

    /** When true, links the seeded parent (and optionally admin) to Supabase Auth for Playwright login. */
    let supabaseLinked = false;
    let adminSupabaseLinked = false;
    if (req.body?.linkSupabaseAuth === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuth requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment',
        });
      }
      try {
        supabaseLinked = await linkSeedUserToSupabase({
          dbUserId: parent.id,
          email: parentEmail,
          password: parentPassword,
          role: 'parent',
          schoolId: school.id,
          displayName: parent.name || 'Test Parent',
        });
      } catch (e) {
        console.error('linkSupabaseAuth failed (continuing without Supabase link):', e);
        supabaseLinked = false;
      }

      if (req.body?.linkSupabaseAuthAdmin === true) {
        try {
          adminSupabaseLinked = await linkSeedUserToSupabase({
            dbUserId: admin.id,
            email: admin.email,
            password: adminPassword,
            role: 'schoolAdmin',
            schoolId: school.id,
            displayName: admin.name || 'Test Admin',
          });
        } catch (e) {
          console.error('linkSupabaseAuthAdmin failed (continuing without admin Supabase link):', e);
          adminSupabaseLinked = false;
        }
      }
    }

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
        renewalDate: oneYearOut,
        gracePeriodEnd: null,
        paymentMethod: 'other',
        notes: 'Seeded via /api/test/setup-cart-scenario',
        stripeSubscriptionId: null,
        stripeCustomerId: null,
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
        supabaseLinked,
        adminSupabaseLinked,
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
          registrationCode: school.registrationCode,
          ...(unpaidMembershipFeeCents > 0
            ? { membershipFeeAmountCents: unpaidMembershipFeeCents, membershipRequired: true }
            : {}),
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
 * POST /api/test/setup-credit-lookup-scenario
 * Seeds a school admin plus:
 * - legacyParent: users.school_id only (no user_roles row) — reproduces credit lookup gaps
 * - roleLinkedParent: explicit user_roles parent row for parity checks
 */
router.post('/setup-credit-lookup-scenario', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    let db;
    try {
      db = await getDb();
    } catch {
      return res.status(400).json({
        error: 'Postgres required (set DATABASE_URL for credit lookup E2E)',
      });
    }
    if (!db) {
      return res.status(400).json({ error: 'Postgres required (getDb returned null)' });
    }

    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `credit_admin_${uniqueId}@test.com`,
      username: `creditadmin_${uniqueId}`,
      name: 'Credit Lookup Admin',
      role: 'schoolAdmin',
    });
    const bcrypt = await import('bcryptjs');
    await storage.updateUser(admin.id, {
      password: await bcrypt.hash(adminPassword, 10),
    });

    const school = await testDb.createTestSchool(admin.id, {
      name: `Credit Lookup School ${uniqueId}`,
      registrationCode: `CRLK${uniqueId.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const legacyEmail = `legacy_parent_${uniqueId}@test.com`;
    const legacyParent = await testDb.createTestUser({
      email: legacyEmail,
      username: `legacyparent_${uniqueId}`,
      name: 'Legacy School Parent',
      role: 'parent',
      schoolId: school.id,
    });

    const roleEmail = `role_parent_${uniqueId}@test.com`;
    const roleLinkedParent = await testDb.createTestUser({
      email: roleEmail,
      username: `roleparent_${uniqueId}`,
      name: 'Role Linked Parent',
      role: 'parent',
      schoolId: school.id,
    });
    await db.insert(userRoles).values({
      userId: roleLinkedParent.id,
      role: 'parent',
      schoolId: school.id,
      isPrimary: true,
    });

    const legacyRoleRows = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.userId, legacyParent.id));
    if (legacyRoleRows.length > 0) {
      return res.status(500).json({
        error: 'legacy parent unexpectedly has user_roles rows',
        details: `userId=${legacyParent.id}`,
      });
    }

    let adminSupabaseLinked = false;
    if (req.body?.linkSupabaseAuthAdmin === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuthAdmin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      try {
        adminSupabaseLinked = await linkSeedUserToSupabase({
          dbUserId: admin.id,
          email: admin.email,
          password: adminPassword,
          role: 'schoolAdmin',
          schoolId: school.id,
          displayName: admin.name || 'Credit Lookup Admin',
        });
      } catch (e) {
        console.error('linkSupabaseAuthAdmin failed:', e);
        adminSupabaseLinked = false;
      }
    }

    res.json({
      success: true,
      data: {
        adminSupabaseLinked,
        school: { id: school.id, name: school.name, registrationCode: school.registrationCode },
        admin: { id: admin.id, email: admin.email, password: adminPassword },
        legacyParent: {
          id: legacyParent.id,
          email: legacyEmail,
          name: legacyParent.name || 'Legacy School Parent',
        },
        roleLinkedParent: {
          id: roleLinkedParent.id,
          email: roleEmail,
          name: roleLinkedParent.name || 'Role Linked Parent',
        },
      },
    });
  } catch (error) {
    console.error('❌ setup-credit-lookup-scenario:', error);
    res.status(500).json({
      error: 'Failed to setup credit lookup scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/setup-registration-scenario
 * School-code registration / public locations / misaligned admin school_id.
 */
router.post('/setup-registration-scenario', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(400).json({ error: 'Postgres required (set DATABASE_URL)' });
    }

    const { seedRegistrationScenario } = await import(
      '../tests/helpers/seedRegistrationScenario'
    );
    const testDb = new TestDatabase();
    const seed = await seedRegistrationScenario(testDb);

    const verifySchool = await storage.getSchool(seed.registrationSchool.id);
    if (!verifySchool?.registrationCode) {
      return res.status(500).json({
        error: 'Round-trip failed: registration school not readable from Postgres',
      });
    }

    const locIds = seed.locationsOnSchool.map((l) => l.id);
    for (const id of locIds) {
      const row = await storage.getLocationById(id);
      if (!row || row.schoolId !== seed.registrationSchool.id) {
        return res.status(500).json({
          error: 'Round-trip failed: location not on registration school',
          details: `locationId=${id}`,
        });
      }
    }

    const bcrypt = await import('bcryptjs');
    await storage.updateUser(seed.admin.id, {
      password: await bcrypt.hash(seed.adminPassword, 10),
    });

    const openSessionCount = Math.min(Math.max(Number(req.body?.openSessionCount ?? 0), 0), 5);
    const openSessions: { id: number; name: string; enrollmentOpen: boolean }[] = [];
    if (openSessionCount > 0) {
      await storage.updateSchool(seed.registrationSchool.id, { sessionModeEnabled: true });
      // Fixed window matches TEST_CHECKOUT_ANCHOR_ISO (2029-12-01) so biweekly yields 2+ installments.
      const start = '2030-01-01';
      const end = '2030-06-01';
      for (let i = 0; i < openSessionCount; i++) {
        const [row] = await db
          .insert(sessions)
          .values({
            schoolId: seed.registrationSchool.id,
            name: `E2E Reg Session ${i + 1} ${seed.registrationCode}`,
            description: 'Playwright parent journey',
            startDate: start,
            endDate: end,
            status: 'upcoming',
            enrollmentOpen: true,
            halfDayPrice: 15000,
            fullDayPrice: 25000,
            sortOrder: i,
          })
          .returning();
        openSessions.push({ id: row.id, name: row.name, enrollmentOpen: row.enrollmentOpen });
      }
    }

    res.json({
      success: true,
      data: {
        registrationCode: seed.registrationCode,
        openSessions,
        school: {
          id: seed.registrationSchool.id,
          name: seed.registrationSchool.name,
          registrationCode: seed.registrationSchool.registrationCode,
        },
        wrongSchool: { id: seed.wrongSchool.id, name: seed.wrongSchool.name },
        admin: {
          id: seed.admin.id,
          email: seed.admin.email,
          password: seed.adminPassword,
          usersSchoolId: seed.wrongSchool.id,
        },
        locationsOnSchool: seed.locationsOnSchool.map((l) => ({
          id: l.id,
          name: l.name,
          schoolId: l.schoolId,
        })),
        locationOnWrongSchool: {
          id: seed.locationOnWrongSchool.id,
          name: seed.locationOnWrongSchool.name,
          schoolId: seed.locationOnWrongSchool.schoolId,
        },
      },
    });
  } catch (error) {
    console.error('❌ setup-registration-scenario:', error);
    res.status(500).json({
      error: 'Failed to setup registration scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/setup-session-enrollment-scenario
 * Seeds school + parent + child + enrollment sessions for F001 / Playwright.
 */
router.post('/setup-session-enrollment-scenario', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    const db = await getDb();

    const openSessionCount = Math.min(Math.max(Number(req.body?.openSessionCount ?? 2), 1), 5);
    const includeClosedSession = req.body?.includeClosedSession === true;

    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `session_admin_${uniqueId}@test.com`,
      username: `sessionadmin_${uniqueId}`,
      name: 'Session Test Admin',
      role: 'schoolAdmin',
    });
    const bcrypt = await import('bcryptjs');
    await storage.updateUser(admin.id, { password: await bcrypt.hash(adminPassword, 10) });

    const school = await testDb.createTestSchool(admin.id, {
      name: `Session School ${uniqueId}`,
      registrationCode: `SES${uniqueId.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const parentEmail = `session_parent_${uniqueId}@test.com`;
    const parentPassword = 'TestPassword123!';
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `sessionparent_${uniqueId}`,
      name: 'Session Test Parent',
      role: 'parent',
      schoolId: school.id,
    });
    await storage.updateUser(parent.id, { password: await bcrypt.hash(parentPassword, 10) });

    const child = await storage.createChild({
      parentId: parent.id,
      parentEmail,
      firstName: 'Session',
      lastName: `Child${uniqueId}`,
      birthdate: '2015-06-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
    });

    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);
    const end = endDate.toISOString().slice(0, 10);

    const openSessions: { id: number; name: string; enrollmentOpen: boolean }[] = [];
    for (let i = 0; i < openSessionCount; i++) {
      const [row] = await db
        .insert(sessions)
        .values({
          schoolId: school.id,
          name: `E2E Open Session ${i + 1} ${uniqueId}`,
          description: 'Playwright seeded open session',
          startDate: start,
          endDate: end,
          status: 'upcoming',
          enrollmentOpen: true,
          halfDayPrice: 15000,
          fullDayPrice: 25000,
          sortOrder: i,
        })
        .returning();
      openSessions.push({ id: row.id, name: row.name, enrollmentOpen: row.enrollmentOpen });
    }

    let closedSession: { id: number; name: string; enrollmentOpen: boolean } | null = null;
    if (includeClosedSession) {
      const [row] = await db
        .insert(sessions)
        .values({
          schoolId: school.id,
          name: `E2E Closed Session ${uniqueId}`,
          description: 'Playwright seeded closed session',
          startDate: start,
          endDate: end,
          status: 'upcoming',
          enrollmentOpen: false,
          halfDayPrice: 10000,
          fullDayPrice: 20000,
          sortOrder: 99,
        })
        .returning();
      closedSession = { id: row.id, name: row.name, enrollmentOpen: row.enrollmentOpen };
    }

    let supabaseLinked = false;
    if (req.body?.linkSupabaseAuth === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuth requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      supabaseLinked = await linkSeedUserToSupabase({
        dbUserId: parent.id,
        email: parentEmail,
        password: parentPassword,
        role: 'parent',
        schoolId: school.id,
        displayName: parent.name || 'Session Test Parent',
      });
    }

    res.json({
      success: true,
      data: {
        supabaseLinked,
        school: { id: school.id, name: school.name, registrationCode: school.registrationCode },
        parent: { id: parent.id, email: parentEmail, password: parentPassword },
        child: { id: child.id, firstName: child.firstName, lastName: child.lastName },
        openSessions,
        closedSession,
      },
    });
  } catch (error) {
    console.error('❌ Error setting up session enrollment scenario:', error);
    res.status(500).json({
      error: 'Failed to setup session enrollment scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/seed-upcoming-scheduled-payment
 * Inserts a pending DB scheduled payment row for an enrollment (harness only).
 * Lets Playwright exercise /payments → Upcoming → Pay without waiting on Stripe webhooks.
 */
router.post('/seed-upcoming-scheduled-payment', async (req: Request, res: Response) => {
  try {
    const enrollmentId = Number(req.body?.enrollmentId);
    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ error: 'enrollmentId (number) is required' });
    }
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'enrollment not found' });
    }
    const rawAmount = req.body?.amountCents;
    const amount =
      typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0
        ? Math.floor(rawAmount)
        : Math.min(2500, Math.max(100, enrollment.remainingBalance || 2500));
    const paymentPlan =
      typeof req.body?.paymentPlan === 'string' && req.body.paymentPlan.trim()
        ? String(req.body.paymentPlan).trim()
        : 'biweekly';
    const installmentNumber =
      typeof req.body?.installmentNumber === 'number' && req.body.installmentNumber > 0
        ? Math.floor(req.body.installmentNumber)
        : 2;
    const totalInstallments =
      typeof req.body?.totalInstallments === 'number' && req.body.totalInstallments >= installmentNumber
        ? Math.floor(req.body.totalInstallments)
        : Math.max(installmentNumber + 1, 4);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const insert: InsertScheduledPayment = {
      schoolId: enrollment.schoolId,
      enrollmentId: enrollment.id,
      parentId: enrollment.parentId,
      parentEmail: enrollment.parentEmail,
      amount,
      currency: 'usd',
      scheduledDate: tomorrow,
      frequency: 'one_time',
      installmentNumber,
      totalInstallments,
      status: 'pending',
      stripePaymentIntentId: null,
      processedAt: null,
      failureReason: null,
      retryCount: 0,
      reminderCount: 0,
      lastReminderSentAt: null,
      metadata: {
        paymentPlan,
        description: `Installment ${installmentNumber} of ${totalInstallments} — ${enrollment.className || 'Class'}`,
      },
      completionSource: null,
      chargedBy: null,
    };

    const row = await storage.createScheduledPayment(insert);
    res.json({ success: true, scheduledPayment: row });
  } catch (error) {
    console.error('❌ seed-upcoming-scheduled-payment:', error);
    res.status(500).json({
      error: 'Failed to seed scheduled payment',
      details: error instanceof Error ? error.message : String(error),
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

/** POST /api/test/ensure-technical-support-schema — applies migration 250 if missing (E2E). */
router.post('/ensure-technical-support-schema', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS technical_support_issues (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_email TEXT NOT NULL,
        user_role TEXT NOT NULL DEFAULT 'parent',
        school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
        issue_category TEXT NOT NULL DEFAULT 'platform',
        issue_type TEXT NOT NULL DEFAULT 'other',
        severity TEXT NOT NULL DEFAULT 'medium',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        user_agent TEXT,
        url TEXT,
        browser_info JSONB NOT NULL DEFAULT '{}',
        reproduction_steps JSONB NOT NULL DEFAULT '[]',
        recommended_actions JSONB NOT NULL DEFAULT '[]',
        ai_diagnosis TEXT,
        ai_user_response TEXT,
        screenshot_object_path TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        assigned_to TEXT,
        resolution TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    return res.json({ success: true });
  } catch (error) {
    console.error('[Test] ensure-technical-support-schema error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/** GET /api/test/technical-support-issue/:id — read persisted issue (E2E verification). */
router.get('/technical-support-issue/:id', async (req: Request, res: Response) => {
  try {
    const issue = await storage.getTechnicalIssue(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }
    return res.json({ success: true, issue });
  } catch (error) {
    console.error('[Test] technical-support-issue lookup error:', error);
    return res.status(500).json({ success: false, error: String(error) });
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

/**
 * GET /api/test/effective-balance-drift
 * Runs the canonical drift query from ARCHITECTURAL_PATTERNS.md §17 against
 * program_enrollments and returns { total, drift }. Used by Task #224's
 * end-to-end balance-sync regression test to assert drift = 0 after each
 * payment-flow step (cart success, scheduled payment success, refund).
 *
 * Optional query params (?ids=1,2,3) narrow the check to a specific set of
 * enrollment IDs so tests don't fail because of unrelated drift left over
 * from other harness runs.
 */
router.get('/effective-balance-drift', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({
        error: 'effective-balance-drift requires Postgres; getDb() returned null.',
      });
    }
    const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = idsParam
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const result = ids.length > 0
      ? await db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE effective_balance IS DISTINCT FROM GREATEST(
                0,
                COALESCE(total_cost, 0) - COALESCE(total_paid, 0) - COALESCE(comp_amount_cents, 0)
              )
            )::int AS drift
          FROM program_enrollments
          WHERE id IN (${sql.raw(ids.map((n) => String(Math.trunc(n))).join(','))})
        `)
      : await db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE effective_balance IS DISTINCT FROM GREATEST(
                0,
                COALESCE(total_cost, 0) - COALESCE(total_paid, 0) - COALESCE(comp_amount_cents, 0)
              )
            )::int AS drift
          FROM program_enrollments
        `);
    type DriftRow = { total: number | string; drift: number | string };
    const resultObj = result as unknown as { rows?: DriftRow[] };
    const rows: DriftRow[] = Array.isArray(resultObj.rows)
      ? resultObj.rows
      : ((result as unknown) as DriftRow[]);
    const row: DriftRow = rows[0] ?? { total: 0, drift: 0 };
    return res.json({ total: Number(row.total) || 0, drift: Number(row.drift) || 0 });
  } catch (error) {
    console.error('[Test] effective-balance-drift error:', error);
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

/** GET /api/test/task-222-skips/:eventId — Task #222 runtime skip-WARN proof. */
router.get('/task-222-skips/:eventId', async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  if (!eventId) return res.status(400).json({ error: 'eventId required' });
  const { getTask222SkipsForEvent } = await import('../lib/task222SkipLog');
  return res.json({ entries: getTask222SkipsForEvent(eventId) });
});

/** GET /api/test/refund-event-by-event/:eventId — Task #222 idempotency proof. */
router.get('/refund-event-by-event/:eventId', async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId;
    if (!eventId) return res.status(400).json({ error: 'eventId required' });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'requires Postgres' });
    const rows = await db.select().from(refundEvents).where(eq(refundEvents.stripeEventId, eventId));
    return res.json({
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        stripeEventId: r.stripeEventId,
        stripeRefundId: r.stripeRefundId,
        stripePaymentIntentId: r.stripePaymentIntentId,
        eventType: r.eventType,
        amountCents: r.amountCents,
        refundStatus: r.refundStatus,
        processingStatus: r.processingStatus,
        originalPaymentId: r.originalPaymentId,
        originalPaymentHistoryId: r.originalPaymentHistoryId,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Test] refund-event-by-event error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/** GET /api/test/refund-event-count-by-refund-id/:refundId — Task #222 P5 dedup proof. */
router.get('/refund-event-count-by-refund-id/:refundId', async (req: Request, res: Response) => {
  try {
    const refundId = req.params.refundId;
    if (!refundId) return res.status(400).json({ error: 'refundId required' });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'requires Postgres' });
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(refundEvents)
      .where(eq(refundEvents.stripeRefundId, refundId));
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (error) {
    console.error('[Test] refund-event-count error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/test/seed-unified-payment
 * Pre-inserts a stripe_payment_history row WITHOUT a corresponding `payments`
 * row — simulating a unified-processor charge. Used by the Bug-A regression
 * test to prove the refund handler resolves payments via stripe_payment_history.
 * Body: { paymentIntentId, userId, amount }
 */
router.post('/seed-unified-payment', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, userId, amount, enrollmentId } = req.body ?? {};
    if (!paymentIntentId || !userId) {
      return res.status(400).json({ error: 'paymentIntentId and userId required' });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'Postgres required' });
    const seedRow: typeof stripePaymentHistory.$inferInsert = {
      userId,
      paymentIntentId,
      customerId: null,
      subscriptionId: null,
      amount: amount ?? 1000,
      currency: 'usd',
      status: 'succeeded',
      paymentMethod: null,
      description: `Task #222 unified-only seed for ${paymentIntentId}`,
      idempotencyKey: `task222-seed:${nanoid(8)}`,
      source: 'stripe',
      stripeCreatedAt: new Date(),
    };
    const inserted = await db.insert(stripePaymentHistory).values(seedRow).returning();
    const historyId = inserted[0]?.id;

    // Optionally seed a positive payment_allocation linking the unified
    // payment to a program_enrollment AND advance the enrollment's
    // totalPaid so the refund-rollback assertions have something to roll back.
    let allocationId: number | null = null;
    if (historyId && typeof enrollmentId === 'number') {
      await storage.createPaymentAllocation({
        paymentHistoryId: historyId,
        enrollmentId,
        membershipEnrollmentId: null,
        sourceAllocationId: null,
        allocatedAmountCents: amount ?? 1000,
        allocationType: 'payment',
        adminComment: 'Task #222 unified seed',
        metadata: { seededBy: 'task222-test' },
      });
      const existing = await storage.getProgramEnrollmentById(enrollmentId);
      if (existing) {
        const newPaid = (existing.totalPaid || 0) + (amount ?? 1000);
        const newRem = Math.max(0, (existing.totalCost || 0) - newPaid);
        await storage.updateProgramEnrollment(enrollmentId, {
          totalPaid: newPaid,
          remainingBalance: newRem,
          paymentStatus: newRem === 0 ? 'completed' : 'partial_payment',
        });
      }
    }

    return res.json({ id: historyId, paymentIntentId, allocationId });
  } catch (error) {
    console.error('[Test] seed-unified-payment error:', error);
    return res.status(500).json({ error: String(error) });
  }
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

/**
 * POST /api/test/task-239-install-checkout-list-stub
 * Task #239: install a one-shot in-process VCR-style stub on the cached
 * Stripe client's `checkout.sessions.list` method so the next call that
 * matches `paymentIntentId` returns a seeded Checkout Session with
 * cart-checkout metadata. Used by the cart-pi-persistence-regression
 * "P4 (real API)" scenario to drive the real branch in
 * `server/webhook-handler.ts:781-812` end-to-end without the
 * `x-task-219-fake-stripe-checkout-session-match` fault-injection header.
 *
 * After being consumed once (or after the optional `ttlMs` window
 * elapses), the stub forwards subsequent calls to the original SDK
 * implementation and is cleaned up.
 */
router.post('/task-239-install-checkout-list-stub', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, sessionId, paymentType, ttlMs } = req.body ?? {};
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return res.status(400).json({ error: 'paymentIntentId (string) required' });
    }
    const { getStripeClient } = await import('../config/stripe');
    const stripe = await getStripeClient();
    const target = stripe.checkout.sessions as any;
    const original = target.__task239_originalList ?? target.list.bind(stripe.checkout.sessions);
    target.__task239_originalList = original;

    const seededSession = {
      id: sessionId ?? `cs_test_task239_${nanoid(8)}`,
      object: 'checkout.session',
      payment_intent: paymentIntentId,
      metadata: { paymentType: paymentType ?? 'cart_checkout' },
      status: 'complete',
      mode: 'payment',
    };
    const installedAt = Date.now();
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : 30_000;
    let consumed = false;

    target.list = async (params: any) => {
      const expired = Date.now() - installedAt > ttl;
      const matches = params?.payment_intent === paymentIntentId;
      if (!consumed && !expired && matches) {
        consumed = true;
        try { delete target.__task239_originalList; } catch {}
        target.list = original;
        return { object: 'list', data: [seededSession], has_more: false, url: '/v1/checkout/sessions' };
      }
      return original(params);
    };

    return res.json({ installed: true, paymentIntentId, sessionId: seededSession.id, ttlMs: ttl });
  } catch (error) {
    console.error('[Test] task-239-install-checkout-list-stub error:', error);
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
      'credits-sub50-full-cover',
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
    const paymentAmount =
      scenario === 'amount-too-small' ? 30 : scenario === 'credits-sub50-full-cover' ? 30 : 5000;
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

    if (scenario === 'credits-sub50-full-cover') {
      const credit = await storage.createCredit({
        userId: parent.id,
        schoolId: school.id,
        creditType: 'manual',
        creditAmountCents: 30,
        status: 'approved',
        approvedBy: admin.id,
        title: `Test Sub50 Full Credit ${uid}`,
        description: 'Seeded for credits-sub50-full-cover integration test',
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
router.get('/latest-payment-intent-for-parent', async (req: Request, res: Response) => {
  try {
    const parentEmail = String(req.query.parentEmail ?? '').trim();
    if (!parentEmail) {
      return res.status(400).json({ error: 'parentEmail query param required' });
    }
    const payments = await storage.getPaymentsByParentEmail(parentEmail);
    const succeeded = payments
      .filter(
        (p) =>
          p.stripePaymentIntentId &&
          (p.status === 'completed' || p.status === 'succeeded'),
      )
      .sort(
        (a, b) =>
          new Date(b.paymentDate ?? 0).getTime() - new Date(a.paymentDate ?? 0).getTime(),
      );
    const paymentIntentId = succeeded[0]?.stripePaymentIntentId ?? null;
    return res.json({ success: true, paymentIntentId });
  } catch (error) {
    console.error('[Test] latest-payment-intent-for-parent:', error);
    return res.status(500).json({
      error: 'Failed to resolve payment intent',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/run-auto-pay-for/:scheduledPaymentId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.scheduledPaymentId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid scheduledPaymentId' });

    const sp = await storage.getScheduledPaymentById(id);
    if (!sp) return res.status(404).json({ error: `Scheduled payment ${id} not found` });

    const parent = sp.parentId ? await storage.getUser(sp.parentId) : null;
    const result = await processOneScheduledPayment(sp);
    return res.json({
      success: true,
      result,
      parentAutoPayEnabled: parent?.autoPayEnabled ?? false,
      hasSavedCard: Boolean(parent?.stripeDefaultPaymentMethodId),
    });
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
 * GET /api/test/pending-scheduled-payments?parentEmail=
 * Lists pending/overdue scheduled_payments for a parent (E2E assertions).
 */
router.get('/pending-scheduled-payments', async (req: Request, res: Response) => {
  try {
    const parentEmail = String(req.query.parentEmail ?? '').trim();
    if (!parentEmail) {
      return res.status(400).json({ error: 'parentEmail query param required' });
    }
    const rows = await storage.getScheduledPaymentsByParentEmail(parentEmail);
    const payments = rows
      .filter((p) => {
        const s = String(p.status);
        return s === 'pending' || s === 'overdue';
      })
      .map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount,
        installmentNumber: p.installmentNumber,
        totalInstallments: p.totalInstallments,
        enrollmentId: p.enrollmentId,
        scheduledDate: p.scheduledDate,
      }));
    return res.json({ success: true, payments });
  } catch (error) {
    console.error('[Test] Error listing pending scheduled payments:', error);
    return res.status(500).json({
      error: 'Failed to list pending scheduled payments',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/persist-checkout-schedule-from-pi
 * Creates installments 2..N in scheduled_payments when Stripe webhooks are not delivered (E2E).
 */
router.post('/persist-checkout-schedule-from-pi', async (req: Request, res: Response) => {
  try {
    const paymentIntentId = String(req.body?.paymentIntentId ?? '').trim();
    if (!paymentIntentId.startsWith('pi_')) {
      return res.status(400).json({ error: 'paymentIntentId (pi_...) required' });
    }
    const { getStripeClient } = await import('../config/stripe');
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: 'PaymentIntent not succeeded',
        status: paymentIntent.status,
      });
    }
    const { StripePaymentPlanService } = await import('../services/stripe-payment-plans.js');
    const planService = new StripePaymentPlanService(storage as any);
    const rows = await planService.persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(
      paymentIntent,
    );
    const meta = paymentIntent.metadata as Record<string, string | undefined>;
    return res.json({
      success: true,
      scheduledPaymentCount: rows.length,
      paymentIntentId,
      totalInstallments: meta.totalInstallments ?? null,
      installmentNumber: meta.installmentNumber ?? null,
      paymentPlan: meta.paymentPlan ?? null,
    });
  } catch (error) {
    console.error('[Test] persist-checkout-schedule-from-pi:', error);
    return res.status(500).json({
      error: 'Failed to persist checkout schedule',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/sync-parent-stripe-for-e2e
 * After checkout, attach the parent's latest Stripe card to users.stripe_* columns
 * so auto-pay E2E can charge installment 2 (checkout PI does not always persist PM).
 */
router.post('/sync-parent-stripe-for-e2e', async (req: Request, res: Response) => {
  try {
    const parentEmail = String(req.body?.email ?? '').trim();
    if (!parentEmail) {
      return res.status(400).json({ error: 'email required' });
    }
    const user = await storage.getUserByEmail(parentEmail);
    if (!user) {
      return res.status(404).json({ error: `User not found: ${parentEmail}` });
    }

    const { getStripeClient } = await import('../config/stripe');
    const stripe = await getStripeClient();

    let customerId = user.stripeCustomerId ?? null;
    if (!customerId) {
      const search = await stripe.customers.search({
        query: `email:'${parentEmail.replace(/'/g, "\\'")}'`,
      });
      customerId = search.data[0]?.id ?? null;
    }
    if (!customerId) {
      const created = await stripe.customers.create({ email: parentEmail });
      customerId = created.id;
    }

    let paymentMethodId: string | null = null;
    const attached = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    paymentMethodId = attached.data[0]?.id ?? null;

    if (!paymentMethodId) {
      const intents = await stripe.paymentIntents.list({ customer: customerId, limit: 10 });
      const succeeded = intents.data.find((pi) => pi.status === 'succeeded');
      const pm = succeeded?.payment_method;
      if (typeof pm === 'string') {
        paymentMethodId = pm;
      } else if (pm && typeof pm === 'object' && 'id' in pm) {
        paymentMethodId = String((pm as { id: string }).id);
      }
      if (paymentMethodId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        } catch {
          /* may already be attached */
        }
      }
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        error: 'No Stripe payment method found for parent after checkout',
        customerId,
      });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const enableAutoPay = req.body?.enableAutoPay !== false;
    await storage.updateUser(user.id, {
      stripeCustomerId: customerId,
      stripeDefaultPaymentMethodId: paymentMethodId,
      ...(enableAutoPay ? { autoPayEnabled: true } : {}),
    });

    return res.json({
      success: true,
      customerId,
      paymentMethodId,
      autoPayEnabled: enableAutoPay,
    });
  } catch (error) {
    console.error('[Test] sync-parent-stripe-for-e2e:', error);
    return res.status(500).json({
      error: 'Failed to sync parent Stripe card',
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
        endDate: expirationDate,
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
        endDate: expirationDate,
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

/**
 * POST /api/test/setup-reallocation-pair
 * Seeds two program_enrollment rows under the same parent so the
 * PaymentReallocationService can be exercised against the live dev Postgres
 * (Task #201). The endpoint creates only ordinary domain rows via the same
 * `storage` and `TestDatabase` helpers used by every other test endpoint —
 * no schema mutation, no replication-role manipulation, no audit-pair seeding.
 * Tests that need an audit anchor or FK backfill perform that setup directly
 * from the test file via the shared DB connection.
 *
 * Returns: { sourceEnrollmentId, targetEnrollmentId, parentId, schoolId,
 *            classId, childId }
 */
router.post('/setup-reallocation-pair', async (req: Request, res: Response) => {
  try {
    const sourcePaidCents = Number(req.body?.sourcePaidCents ?? 5000);
    const sourceTotalCostCents = Number(req.body?.sourceTotalCostCents ?? sourcePaidCents);
    const targetPaidCents = Number(req.body?.targetPaidCents ?? 0);
    const targetTotalCostCents = Number(req.body?.targetTotalCostCents ?? 10000);
    const uid = nanoid(8);
    const testDb = new TestDatabase();

    const admin = await testDb.createTestUser({
      email: `re_admin_${uid}@test.com`,
      name: 'Reallocation Test Admin',
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Reallocation School ${uid}`,
      registrationCode: `RE${uid.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const parent = await testDb.createTestUser({
      email: `re_parent_${uid}@test.com`,
      name: 'Reallocation Test Parent',
      role: 'parent',
      schoolId: school.id,
    });

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Reallocation',
      lastName: 'Child',
      birthdate: '2015-01-01',
      gradeLevel: '3rd Grade',
      schoolId: school.id,
      parentEmail: `re_parent_${uid}@test.com`,
    });

    const category = await testDb.createTestCategory(school.id, { name: `Reallocation Cat ${uid}` });
    const cls = await testDb.createTestClass(school.id, {
      title: `Reallocation Class ${uid}`,
      price: Math.max(sourceTotalCostCents, targetTotalCostCents),
      status: 'upcoming',
      categoryId: category.id,
      category: `Reallocation Cat ${uid}`,
    });

    const buildEnrollment = (
      totalCostCents: number,
      totalPaidCents: number,
    ): InsertProgramEnrollment => ({
      childId: child.id,
      classId: cls.id,
      parentId: parent.id,
      parentEmail: `re_parent_${uid}@test.com`,
      schoolId: school.id,
      status: 'enrolled',
      paymentPlan: 'biweekly',
      childName: 'Reallocation Child',
      className: cls.title,
      paymentType: 'v2_stripe',
      classType: 'school_class',
      price: totalCostCents,
      totalCost: totalCostCents,
      totalPaid: totalPaidCents,
      remainingBalance: Math.max(0, totalCostCents - totalPaidCents),
    });

    const source = await storage.createProgramEnrollment(
      buildEnrollment(sourceTotalCostCents, sourcePaidCents),
    );
    const target = await storage.createProgramEnrollment(
      buildEnrollment(targetTotalCostCents, targetPaidCents),
    );

    return res.json({
      success: true,
      sourceEnrollmentId: source.id,
      targetEnrollmentId: target.id,
      parentId: parent.id,
      schoolId: school.id,
      classId: cls.id,
      childId: child.id,
    });
  } catch (error) {
    console.error('[Test] Error seeding reallocation pair:', error);
    return res.status(500).json({
      error: 'Failed to seed reallocation pair',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/ensure-public-store-schema — applies migration 251 if missing (E2E).
 */
router.post('/ensure-public-store-schema', async (_req: Request, res: Response) => {
  try {
    const { ensurePublicStoreSchema } = await import('../lib/ensure-public-store-schema');
    await ensurePublicStoreSchema();
    return res.json({ success: true });
  } catch (error) {
    console.error('[Test] ensure-public-store-schema error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/test/setup-public-store-scenario
 * Seeds school admin + enabled public store + published merch product.
 */
router.post('/setup-public-store-scenario', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(400).json({ error: 'Postgres required (set DATABASE_URL)' });
    }

    const { seedPublicStoreScenario } = await import('../tests/helpers/seedPublicStoreScenario');
    const seed = await seedPublicStoreScenario(new TestDatabase(), {
      productImageUrl:
        typeof req.body?.productImageUrl === 'string' ? req.body.productImageUrl : null,
      productPriceCents:
        typeof req.body?.productPriceCents === 'number' ? req.body.productPriceCents : undefined,
      withPublishedProduct: req.body?.withPublishedProduct !== false,
      withClass: req.body?.withClass === true,
      classTitle: typeof req.body?.classTitle === 'string' ? req.body.classTitle : undefined,
      classPriceCents:
        typeof req.body?.classPriceCents === 'number' ? req.body.classPriceCents : undefined,
      classCoverImage:
        typeof req.body?.classCoverImage === 'string' ? req.body.classCoverImage : null,
      withPublishedClassListing: req.body?.withPublishedClassListing === true,
      withSession: req.body?.withSession === true,
      sessionName: typeof req.body?.sessionName === 'string' ? req.body.sessionName : undefined,
      sessionFullDayPriceCents:
        typeof req.body?.sessionFullDayPriceCents === 'number'
          ? req.body.sessionFullDayPriceCents
          : undefined,
      sessionCoverImage:
        typeof req.body?.sessionCoverImage === 'string' ? req.body.sessionCoverImage : null,
      withPublishedSessionListing: req.body?.withPublishedSessionListing === true,
      withParent: req.body?.withParent === true,
    });

    let adminSupabaseLinked = false;
    let parentSupabaseLinked = false;
    if (req.body?.linkSupabaseAuthAdmin === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuthAdmin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      try {
        adminSupabaseLinked = await linkSeedUserToSupabase({
          dbUserId: seed.admin.id,
          email: seed.admin.email,
          password: seed.admin.password,
          role: 'schoolAdmin',
          schoolId: seed.school.id,
          displayName: 'Store E2E Admin',
        });
      } catch (e) {
        console.error('linkSupabaseAuthAdmin failed:', e);
        adminSupabaseLinked = false;
      }
    }

    if (req.body?.linkSupabaseAuthParent === true) {
      if (!seed.parent) {
        return res.status(400).json({
          error: 'linkSupabaseAuthParent requires withParent: true in setup-public-store-scenario',
        });
      }
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuthParent requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      try {
        parentSupabaseLinked = await linkSeedUserToSupabase({
          dbUserId: seed.parent.id,
          email: seed.parent.email,
          password: seed.parent.password,
          role: 'parent',
          schoolId: seed.school.id,
          displayName: 'Store E2E Parent',
        });
      } catch (e) {
        console.error('linkSupabaseAuthParent failed:', e);
        parentSupabaseLinked = false;
      }
    }

    res.json({
      success: true,
      data: {
        ...seed,
        adminSupabaseLinked,
        parentSupabaseLinked,
      },
    });
  } catch (error) {
    console.error('❌ setup-public-store-scenario:', error);
    res.status(500).json({
      error: 'Failed to setup public store scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/fulfill-store-checkout
 * Simulates Stripe webhook fulfillment for a pending public-store checkout (E2E only).
 */
router.post('/fulfill-store-checkout', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(400).json({ error: 'Postgres required (set DATABASE_URL)' });
    }

    const snapshotId =
      typeof req.body?.snapshotId === 'string' ? req.body.snapshotId : undefined;
    const accessToken =
      typeof req.body?.accessToken === 'string' ? req.body.accessToken : undefined;

    if (!snapshotId && !accessToken) {
      return res.status(400).json({ error: 'snapshotId or accessToken required' });
    }

    const {
      getStoreCheckoutSnapshot,
      getStoreOrderByAccessToken,
    } = await import('../lib/store-storage');
    const { fulfillStoreCheckoutFromWebhook } = await import('../lib/store-fulfillment');

    let snapshot = snapshotId ? await getStoreCheckoutSnapshot(snapshotId) : null;
    let order =
      accessToken != null ? await getStoreOrderByAccessToken(accessToken) : null;

    if (!snapshot && order?.metadata && typeof order.metadata === 'object') {
      const metaSnapshotId = (order.metadata as { snapshotId?: string }).snapshotId;
      if (metaSnapshotId) {
        snapshot = await getStoreCheckoutSnapshot(metaSnapshotId);
      }
    }

    if (!order && snapshot?.storeOrderId) {
      const { getStoreOrderById } = await import('../lib/store-storage');
      order = await getStoreOrderById(snapshot.storeOrderId);
    }

    if (!snapshot) {
      return res.status(404).json({ error: 'Store checkout snapshot not found' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Store order not found' });
    }

    const resolvedSnapshotId = snapshot.id;
    const amount = snapshot.amountDueCents ?? order.totalCents ?? 0;
    const unique = nanoid(10);
    const paymentIntentId = `pi_test_store_${unique}`;
    const checkoutSessionId = order.stripeCheckoutSessionId ?? `cs_test_store_${unique}`;

    await fulfillStoreCheckoutFromWebhook({
      session: {
        id: checkoutSessionId,
        metadata: {
          type: 'store_checkout',
          snapshotId: resolvedSnapshotId,
          storeOrderId: String(order.id),
        },
      } as any,
      paymentIntent: {
        id: paymentIntentId,
        amount,
        currency: 'usd',
        metadata: {
          type: 'store_checkout',
          snapshotId: resolvedSnapshotId,
          storeOrderId: String(order.id),
          parentEmail: order.parentEmail,
        },
      } as any,
    });

    res.json({
      success: true,
      orderId: order.id,
      accessToken: order.accessToken,
      snapshotId: resolvedSnapshotId,
      paymentIntentId,
    });
  } catch (error) {
    console.error('❌ fulfill-store-checkout:', error);
    res.status(500).json({
      error: 'Failed to fulfill store checkout',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/setup-public-form-scenario
 * Seeds public + members-only custom forms for Playwright public-access tests.
 */
router.post('/setup-public-form-scenario', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(400).json({ error: 'Postgres required (set DATABASE_URL)' });
    }

    const { seedPublicFormScenario } = await import(
      '../tests/helpers/seedPublicFormScenario'
    );
    const seed = await seedPublicFormScenario(new TestDatabase());

    let adminSupabaseLinked = false;
    if (req.body?.linkSupabaseAuthAdmin === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuthAdmin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      try {
        adminSupabaseLinked = await linkSeedUserToSupabase({
          dbUserId: seed.admin.id,
          email: seed.admin.email,
          password: seed.admin.password,
          role: 'schoolAdmin',
          schoolId: seed.school.id,
          displayName: 'Form E2E Admin',
        });
      } catch (e) {
        console.error('linkSupabaseAuthAdmin failed (form scenario):', e);
        adminSupabaseLinked = false;
      }
    }

    res.json({
      success: true,
      data: {
        ...seed,
        adminSupabaseLinked,
      },
    });
  } catch (error) {
    console.error('❌ setup-public-form-scenario:', error);
    res.status(500).json({
      error: 'Failed to setup public form scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/test/email-log?recipient=&type=
 * Returns recent email_log rows for Playwright assertions (form notifications, etc.).
 */
router.get('/email-log', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(400).json({ error: 'Postgres required' });
    }
    const { emailLog } = await import('@shared/schema');
    const { eq, and, desc } = await import('drizzle-orm');

    const recipient = typeof req.query.recipient === 'string' ? req.query.recipient : null;
    const type = typeof req.query.type === 'string' ? req.query.type : null;

    const conditions = [];
    if (recipient) conditions.push(eq(emailLog.recipientEmail, recipient));
    if (type) conditions.push(eq(emailLog.type, type));

    const rows = await db
      .select()
      .from(emailLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(emailLog.id))
      .limit(20);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ email-log:', error);
    res.status(500).json({
      error: 'Failed to query email log',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/test/setup-progress-scenario
 * Seeds school + educator + parent + child for NY | Progress report Playwright.
 */
router.post('/setup-progress-scenario', async (req: Request, res: Response) => {
  try {
    const { ensureQuarterlyReportTables } = await import(
      '../tests/helpers/ensureQuarterlyReportTables'
    );
    const { buildFullSkillChecksForBand, currentSchoolYearLabel } = await import(
      '../tests/helpers/quarterlyReportTestHelpers'
    );
    const { resolveProgressReportBand } = await import('../lib/resolve-progress-report-band');

    await ensureQuarterlyReportTables();

    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    const bcrypt = await import('bcryptjs');
    const password = 'TestPassword123!';
    const schoolYear = currentSchoolYearLabel();
    const quarter = 'fall';

    const admin = await testDb.createTestUser({
      email: `progress_admin_${uniqueId}@test.com`,
      username: `progressadmin_${uniqueId}`,
      name: 'Progress Test Admin',
      role: 'schoolAdmin',
    });
    await storage.updateUser(admin.id, { password: await bcrypt.hash(password, 10) });

    const school = await testDb.createTestSchool(admin.id, {
      name: `Progress School ${uniqueId}`,
      registrationCode: `PRG${uniqueId.toUpperCase()}`,
    });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const educatorEmail = `progress_ed_${uniqueId}@test.com`;
    const educator = await testDb.createTestUser({
      email: educatorEmail,
      username: `progressed_${uniqueId}`,
      name: 'Progress Test Educator',
      role: 'educator',
      schoolId: school.id,
    });
    await storage.updateUser(educator.id, { password: await bcrypt.hash(password, 10) });

    const parentEmail = `progress_parent_${uniqueId}@test.com`;
    const parent = await testDb.createTestUser({
      email: parentEmail,
      username: `progressparent_${uniqueId}`,
      name: 'Progress Test Parent',
      role: 'parent',
      schoolId: school.id,
    });
    await storage.updateUser(parent.id, { password: await bcrypt.hash(password, 10) });

    const db = await getDb();
    await db.insert(userRoles).values([
      {
        userId: educator.id,
        role: 'educator',
        schoolId: school.id,
        isPrimary: true,
      },
      {
        userId: parent.id,
        role: 'parent',
        schoolId: school.id,
        isPrimary: true,
      },
    ]);

    const child = await storage.createChild({
      parentId: parent.id,
      parentEmail,
      firstName: 'Progress',
      lastName: `E2E${uniqueId}`,
      birthdate: '2018-09-01',
      gradeLevel: 'Kindergarten',
      schoolId: school.id,
    });

    let educatorSupabaseLinked = false;
    let parentSupabaseLinked = false;
    if (req.body?.linkSupabaseAuth === true) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return res.status(400).json({
          error: 'linkSupabaseAuth requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        });
      }
      educatorSupabaseLinked = await linkSeedUserToSupabase({
        dbUserId: educator.id,
        email: educatorEmail,
        password,
        role: 'educator',
        schoolId: school.id,
        displayName: educator.name || 'Progress Test Educator',
      });
      parentSupabaseLinked = await linkSeedUserToSupabase({
        dbUserId: parent.id,
        email: parentEmail,
        password,
        role: 'parent',
        schoolId: school.id,
        displayName: parent.name || 'Progress Test Parent',
      });
    }

    if (req.body?.withCompleteRubric === true) {
      const band = resolveProgressReportBand(child.gradeLevel);
      await storage.upsertQuarterlyProgressMeta(child.id, school.id, {
        schoolYear,
        quarter,
        quarterLabel: `Fall ${schoolYear}`,
        asaCoopHours: 48,
        homeInstructionHours: 180,
        phonogramCount: 14,
        approvedNarrative: 'E2E seed: phonics, counting, and handwriting covered this quarter.',
        notesObservations: 'Strong co-op participation.',
      });
      const skillChecks = buildFullSkillChecksForBand(band);
      await storage.saveQuarterlySkillChecks(child.id, school.id, schoolYear, quarter, skillChecks);
    }

    res.json({
      success: true,
      data: {
        supabaseLinked: educatorSupabaseLinked && parentSupabaseLinked,
        educatorSupabaseLinked,
        parentSupabaseLinked,
        school: { id: school.id, name: school.name, registrationCode: school.registrationCode },
        educator: { id: educator.id, email: educatorEmail, password },
        parent: { id: parent.id, email: parentEmail, password },
        child: {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
        },
        schoolYear,
        quarter,
      },
    });
  } catch (error) {
    console.error('❌ setup-progress-scenario:', error);
    res.status(500).json({
      error: 'Failed to setup progress scenario',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
