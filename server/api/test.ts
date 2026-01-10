import { Router, Request, Response } from 'express';
import { TestDatabase } from '../tests/helpers/testDatabase';
import { storage } from '../storage';
import { nanoid } from 'nanoid';

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
 * Creates a complete test scenario for cart persistence testing
 * 
 * Returns:
 * - parent: { email, password, id }
 * - child: { id, firstName, lastName }
 * - class: { id, title }
 * - enrollment: { id, status }
 * - school: { id, name, registrationCode }
 */
router.post('/setup-cart-scenario', async (req: Request, res: Response) => {
  try {
    const testDb = new TestDatabase();
    const uniqueId = nanoid(8);
    
    // 1. Create school admin
    // Note: Don't pass password in overrides - let createTestUser hash it properly
    const adminPassword = 'TestPassword123!';
    const admin = await testDb.createTestUser({
      email: `admin_${uniqueId}@test.com`,
      username: `testadmin_${uniqueId}`,
      name: 'Test Admin',
      role: 'schoolAdmin'
      // password will be hashed inside createTestUser
    });
    // Manually hash and set the password to ensure it's stored correctly
    const bcrypt = await import('bcryptjs');
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    await storage.updateUser(admin.id, { password: hashedAdminPassword });
    
    // 2. Create school
    const school = await testDb.createTestSchool(admin.id, {
      name: `Test School Cart ${uniqueId}`,
      registrationCode: `CART${uniqueId.toUpperCase()}`
    });
    
    // Update admin's schoolId
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
      // password will be hashed inside createTestUser
    });
    // Manually hash and set the password to ensure it's stored correctly
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
    
    // 5. Create category
    const category = await testDb.createTestCategory(school.id, {
      name: 'Test Category'
    });
    
    // 6. Create class
    const classItem = await testDb.createTestClass(school.id, {
      title: `Math Fundamentals Cart Test ${uniqueId}`,
      description: 'Test class for cart persistence',
      price: 10000, // $100.00
      status: 'active',
      categoryId: category.id
    });
    
    // 7. Create pending enrollment
    const enrollment = await storage.createProgramEnrollment({
      childId: child.id,
      classId: classItem.id,
      parentId: parent.id,
      parentEmail: parentEmail,
      schoolId: school.id,
      status: 'pending_payment',
      paymentPlan: 'full',
      price: 10000
    });
    
    console.log(`✅ Created cart test scenario:
      - Parent: ${parentEmail}
      - Child: ${child.firstName} ${child.lastName} (ID: ${child.id})
      - Class: ${classItem.title} (ID: ${classItem.id})
      - Enrollment: ID ${enrollment.id} (status: ${enrollment.status})
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
          status: enrollment.status
        },
        school: {
          id: school.id,
          name: school.name,
          registrationCode: school.registrationCode
        }
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

export default router;
