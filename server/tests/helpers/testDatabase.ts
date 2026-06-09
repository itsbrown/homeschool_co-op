import { storage } from '../../storage';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcryptjs';
import type {
  InsertUser,
  InsertSchool,
  InsertLocation,
  InsertCategory,
  User,
  School,
  Location,
  Category,
  Child,
  Class,
  ProgramEnrollment,
  InsertPayment,
  Payment,
  InsertMembershipEnrollment,
  MembershipEnrollment,
} from '../../../shared/schema';

/**
 * Internal handle to the in-memory store the harness uses for program
 * enrollments. Typed narrowly so the helper does not have to reach for
 * `(storage as any)` when bridging the test-only methods that need to read
 * MemStorage data directly.
 */
interface InMemoryStorageHandle {
  programEnrollmentsStore?: Map<number, ProgramEnrollment>;
}

interface CombinedStorageInternals {
  memStorage?: InMemoryStorageHandle;
  getStripeLinkedEnrollmentsByParentEmail?: (email: string) => Promise<unknown[]>;
  getStripeCustomerIdsByParentEmail?: (email: string) => Promise<unknown[]>;
}

/**
 * Install jest.spyOn stubs so the in-memory test harness can drive every
 * cart / payment / billing flow that would otherwise route through the real
 * database.
 *
 * Several CombinedStorage methods always defer to dbStorage (they have no
 * MemStorage mirror or are explicitly DB-only), so without these stubs the
 * cart pricing path explodes with "Database connection not available" and
 * every dependent test returns HTTP 500.
 *
 * Behaviors:
 *   - Read-only catalog/credit lookups → harmless empty defaults.
 *   - Membership + payment writes → in-memory Maps, scoped to a single test
 *     so writes are observable by reads inside that test but never leak.
 *   - All spies are torn down via jest.restoreAllMocks() in afterEach.
 *
 * Call once at the top of a `describe` block; the helper installs the
 * lifecycle hooks (beforeEach / afterEach) on its own.
 */
export function installFinancialIntegrationStubs(): void {
  let memberships: Map<number, MembershipEnrollment>;
  let membershipIdCounter: number;
  let payments: Map<number, Payment>;
  let paymentIdCounter: number;

  beforeEach(() => {
    memberships = new Map();
    membershipIdCounter = 1;
    payments = new Map();
    paymentIdCounter = 1;

    // Read-only DB-only lookups → deterministic empty defaults.
    jest.spyOn(storage, 'getDiscountsBySchoolId').mockResolvedValue([]);
    jest.spyOn(storage, 'getDiscountUsageCountByUser').mockResolvedValue(0);
    jest.spyOn(storage, 'getAvailableCredits').mockResolvedValue([]);

    // Membership enrollments — in-memory CRUD so writes & reads stay consistent.
    jest
      .spyOn(storage, 'getMembershipEnrollmentsByParentId')
      .mockImplementation(async (parentUserId: number) => {
        return Array.from(memberships.values()).filter(
          (m) => m.parentUserId === parentUserId
        );
      });

    jest
      .spyOn(storage, 'createMembershipEnrollment')
      .mockImplementation(async (data: InsertMembershipEnrollment) => {
        const id = membershipIdCounter++;
        const now = new Date();
        const newMembership: MembershipEnrollment = {
          ...(data as MembershipEnrollment),
          id,
          createdAt: now,
          updatedAt: now,
        };
        memberships.set(id, newMembership);
        return newMembership;
      });

    jest
      .spyOn(storage, 'updateMembershipEnrollment')
      .mockImplementation(
        async (id: number, updates: Partial<InsertMembershipEnrollment>) => {
          const existing = memberships.get(id);
          if (!existing) return undefined;
          const updated: MembershipEnrollment = {
            ...existing,
            ...(updates as Partial<MembershipEnrollment>),
            updatedAt: new Date(),
          };
          memberships.set(id, updated);
          return updated;
        }
      );

    // Payments — in-memory implementations so we never touch payment-history.json
    // (MemStorage.createPayment writes to disk on the file-fallback path).
    jest
      .spyOn(storage, 'createPayment')
      .mockImplementation(async (data: InsertPayment) => {
        const id = paymentIdCounter++;
        const now = new Date();
        const baseData = data as Partial<Payment>;
        const newPayment: Payment = {
          ...(data as Payment),
          id,
          createdAt: now,
          updatedAt: now,
          currency: baseData.currency ?? 'usd',
          status: baseData.status ?? 'pending',
          metadata: baseData.metadata ?? {},
        };
        payments.set(id, newPayment);
        return newPayment;
      });

    jest
      .spyOn(storage, 'getPaymentsByParentEmail')
      .mockImplementation(async (parentEmail: string) => {
        return Array.from(payments.values()).filter(
          (p) => p.parentEmail === parentEmail
        );
      });

    // DB-only enrichment lookups used by /api/payment-history/history.
    const storageInternals = storage as unknown as CombinedStorageInternals;
    if (typeof storageInternals.getStripeLinkedEnrollmentsByParentEmail === 'function') {
      jest
        .spyOn(storageInternals, 'getStripeLinkedEnrollmentsByParentEmail')
        .mockResolvedValue([]);
    }
    if (typeof storageInternals.getStripeCustomerIdsByParentEmail === 'function') {
      jest
        .spyOn(storageInternals, 'getStripeCustomerIdsByParentEmail')
        .mockResolvedValue([]);
    }

    // CombinedStorage.getAllEnrollments only reads from dbStorage and silently
    // returns [] when the DB is unavailable. The test harness routes
    // createProgramEnrollment to the in-memory programEnrollmentsStore, so we
    // need getAllEnrollments to surface those records too — otherwise security
    // checks (e.g. UNAUTHORIZED_ENROLLMENT) cannot find existing enrollments.
    const memStorageInstance = storageInternals.memStorage;
    const programEnrollmentsStore = memStorageInstance?.programEnrollmentsStore;
    if (programEnrollmentsStore instanceof Map) {
      jest
        .spyOn(storage, 'getAllEnrollments')
        .mockImplementation(async () => {
          return Array.from(programEnrollmentsStore.values());
        });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
}

/**
 * Wipe application data from PostgreSQL while leaving the schema intact.
 * CombinedStorage persists users/enrollments to Postgres; clearing MemStorage
 * alone is not enough — without this, `createUser` fails with "already exists"
 * across tests and suites.
 */
function isSafeDatabaseUrlForTestTruncate(url: string): boolean {
  if (process.env.ALLOW_TEST_TRUNCATE === '1') {
    return true;
  }
  // CI / local integration runs set TEST_DATABASE_URL explicitly (see jest-setup-env.cjs).
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.TEST_DATABASE_URL &&
    (url === process.env.TEST_DATABASE_URL || process.env.DATABASE_URL === process.env.TEST_DATABASE_URL)
  ) {
    return true;
  }
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, 'postgresql://'));
    const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0] || '';
    const host = (parsed.hostname || '').toLowerCase();
    if (dbName.includes('test') || dbName.endsWith('_test')) {
      return true;
    }
    if (host.includes('test') || host.includes('localhost') || host === '127.0.0.1') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Remove prior fixture rows tied to a stable test email when TRUNCATE did not run. */
async function purgeTestFixtureUserByEmail(email: string): Promise<void> {
  try {
    const existing = await storage.getUserByEmail(email);
    if (!existing) {
      return;
    }
    try {
      const { getDb } = await import('../../db');
      const { sql } = await import('drizzle-orm');
      const db = await getDb();
      if (db) {
        await db.execute(sql`DELETE FROM scheduled_payments WHERE parent_email = ${email}`);
        await db.execute(sql`DELETE FROM payments WHERE parent_email = ${email}`);
        await db.execute(sql`DELETE FROM program_enrollments WHERE parent_email = ${email}`);
        await db.execute(sql`DELETE FROM children WHERE parent_id = ${existing.id}`);
      }
    } catch {
      /* DB unavailable — mem-only fixtures */
    }
    try {
      await storage.deleteUser(existing.id);
    } catch {
      /* FK or read-only — createUser may still fail */
    }
  } catch {
    /* best-effort */
  }
}

async function truncatePostgresPublicTablesForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  const url =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://test:test@localhost:5432/asa_test';

  if (!isSafeDatabaseUrlForTestTruncate(url)) {
    console.warn(
      '[TestDatabase] Skipping TRUNCATE — DATABASE_URL does not look like a dedicated test database. ' +
        'Use TEST_DATABASE_URL=.../asa_test or set ALLOW_TEST_TRUNCATE=1 to override.',
    );
    return;
  }

  // Use a short-lived client so TRUNCATE does not disturb the shared getDb() pool.
  let client: import('postgres').Sql | undefined;
  try {
    const postgres = (await import('postgres')).default;
    client = postgres(url, { prepare: false, max: 1, connect_timeout: 5 });
    const rows = await client<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT ILIKE '%drizzle%'
      ORDER BY tablename
    `;
    const names = rows.map((r) => r.tablename).filter(Boolean);
    if (names.length === 0) {
      return;
    }
    const quoted = names.map((n) => `"${n.replace(/"/g, '""')}"`).join(', ');
    await client.unsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[TestDatabase] Postgres truncation skipped:', msg);
  } finally {
    await client?.end({ timeout: 2 });
  }
}

/**
 * Test Database Helper
 * Uses the in-memory storage system for testing
 */
export class TestDatabase {
  private createdRecords: {
    users: number[];
    schools: number[];
    children: number[];
    locations: number[];
    categories: number[];
    classes: number[];
    enrollments: number[];
  } = {
    users: [],
    schools: [],
    children: [],
    locations: [],
    categories: [],
    classes: [],
    enrollments: []
  };

  async cleanup() {
    // Clear all data from in-memory storage
    storage.clearAll();
    try {
      const { resetDbConnectionStateForTests } = await import('../../db');
      await resetDbConnectionStateForTests();
    } catch {
      /* ignore */
    }
    await truncatePostgresPublicTablesForTests();

    // Reset tracking arrays
    this.createdRecords = {
      users: [],
      schools: [],
      children: [],
      locations: [],
      categories: [],
      classes: [],
      enrollments: []
    };
  }

  async createTestUser(overrides: Partial<InsertUser> = {}): Promise<User> {
    const uniqueId = nanoid(8);
    
    // Hash the password if provided, otherwise use default hashed 'password'
    const plainPassword = overrides.password || 'password';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    
    const userData: InsertUser = {
      username: overrides.username || `testuser_${uniqueId}`,
      email: overrides.email || `test_${uniqueId}@example.com`,
      password: hashedPassword,
      name: overrides.name || `Test User ${uniqueId}`,
      role: overrides.role || 'parent',
      isActive: overrides.isActive !== undefined ? overrides.isActive : true,
      ...overrides
    };

    // When TRUNCATE is skipped (e.g. Replit dev DB), fixed fixture emails must not block re-seed.
    if (process.env.NODE_ENV === 'test') {
      await purgeTestFixtureUserByEmail(userData.email);
    }

    const user = await storage.createUser(userData);
    this.createdRecords.users.push(user.id);
    return user;
  }

  async getUserById(userId: number): Promise<User> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    return user;
  }

  async updateUser(userId: number, updates: Partial<InsertUser>): Promise<User> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    await storage.updateUser(userId, updates);
    const updatedUser = await storage.getUser(userId);
    if (!updatedUser) {
      throw new Error(`User with id ${userId} not found after update`);
    }
    return updatedUser;
  }

  async updateUserSchoolId(userId: number, schoolId: number | null): Promise<User> {
    return this.updateUser(userId, { schoolId });
  }

  async getMembershipEnrollmentsByParentId(parentUserId: number) {
    return storage.getMembershipEnrollmentsByParentId(parentUserId);
  }

  async createTestSchool(adminId: number, overrides: Partial<InsertSchool> = {}): Promise<School> {
    const uniqueId = nanoid(8);
    const schoolData = {
      name: overrides.name || `Test School ${uniqueId}`,
      type: overrides.type || 'school',
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
      email: overrides.email || `school_${uniqueId}@example.com`,
      status: overrides.status || 'active',
      address: overrides.address !== undefined ? overrides.address : null,
      phoneNumber: overrides.phoneNumber !== undefined ? overrides.phoneNumber : null,
      website: overrides.website !== undefined ? overrides.website : null,
      logo: overrides.logo !== undefined ? overrides.logo : null,
      registrationCode: overrides.registrationCode || `TEST${uniqueId.toUpperCase()}`,
      description: overrides.description !== undefined ? overrides.description : null,
      adminId,
      ...overrides
    } as InsertSchool & { adminId: number };

    const school = await storage.createSchool(schoolData);
    this.createdRecords.schools.push(school.id);
    return school;
  }

  async createTestLocation(schoolId: number, overrides: Partial<InsertLocation> = {}): Promise<Location> {
    const uniqueId = nanoid(8);
    const locationData: InsertLocation = {
      name: overrides.name || `Test Location ${uniqueId}`,
      schoolId,
      code: overrides.code || `LOC${uniqueId.toUpperCase().substring(0, 4)}`,
      address: overrides.address || '123 Test St',
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
      phoneNumber: null,
      email: null,
      managerName: null,
      capacity: null,
      ...overrides
    };

    const location = await storage.createLocation(locationData);
    this.createdRecords.locations.push(location.id);
    return location;
  }

  async createTestCategory(schoolId: number, overrides: Partial<InsertCategory> = {}): Promise<Category> {
    const uniqueId = nanoid(8);
    const categoryData = {
      name: overrides.name || `Test Category ${uniqueId}`,
      description: overrides.description || null,
      schoolId,
      ...overrides
    };

    const category = await storage.createCategory(categoryData);
    this.createdRecords.categories.push(category.id);
    return category;
  }

  async createTestChild(parentId: number, overrides: any = {}): Promise<Child> {
    const uniqueId = nanoid(8);
    
    // Look up parent's email from parentId if not provided in overrides
    let parentEmail = overrides.parentEmail;
    if (!parentEmail) {
      const parent = await storage.getUser(parentId);
      parentEmail = parent?.email || `parent_${uniqueId}@example.com`;
    }
    
    const rawBirthdate = overrides.birthdate ?? '2010-01-01';
    const birthdate =
      rawBirthdate instanceof Date
        ? rawBirthdate.toISOString().slice(0, 10)
        : String(rawBirthdate);

    const childData = {
      firstName: overrides.firstName || `Child${uniqueId}`,
      lastName: overrides.lastName || 'Test',
      birthdate,
      gradeLevel: overrides.gradeLevel || '5th',
      parentId,
      parentEmail,
      schoolId: overrides.schoolId || null,
      ...overrides,
      birthdate,
    };

    const child = await storage.createChild(childData);
    this.createdRecords.children.push(child.id);
    return child;
  }

  async createTestClass(schoolId: number, instructorIdOrOverrides?: number | any, maybeOverrides?: any): Promise<Class> {
    let instructorId: number | undefined;
    let overrides: any = {};

    if (typeof instructorIdOrOverrides === 'number') {
      instructorId = instructorIdOrOverrides;
      overrides = maybeOverrides || {};
    } else if (instructorIdOrOverrides && typeof instructorIdOrOverrides === 'object') {
      overrides = instructorIdOrOverrides;
    }

    const uniqueId = nanoid(8);
    const classData: any = {
      title: overrides.title || overrides.name || `Test Class ${uniqueId}`,
      description: overrides.description || 'Test class description',
      schoolId,
      status: overrides.status || 'active',
      type: overrides.type || 'marketplace',
      price: overrides.price ?? 100,
      capacity: overrides.capacity || 20,
      locationId: overrides.locationId || null,
      categoryId: overrides.categoryId || null,
      /** Postgres `classes.category` is NOT NULL; mem-only tests omitted this and broke DB integration. */
      category: overrides.category || overrides.title || `Test Category ${uniqueId}`,
      ...overrides
    };

    if (instructorId !== undefined && classData.instructorId === undefined) {
      classData.instructorId = instructorId;
    }

    const classItem = await storage.createClass(classData);
    this.createdRecords.classes.push(classItem.id);
    return classItem;
  }

  async createTestEnrollment(classId: number, childId: number, overrides: any = {}) {
    const enrollmentData = {
      classId,
      marketplaceClassId: classId,
      childId,
      status: overrides.status || 'pending_payment',
      amount: overrides.amount || 10000,
      totalCost: overrides.totalCost || 10000,
      amountPaid: overrides.amountPaid || 0,
      remainingBalance: overrides.remainingBalance || 10000,
      depositRequired: overrides.depositRequired || 1000,
      enrollmentDate: overrides.enrollmentDate || new Date().toISOString(),
      ...overrides
    };

    const enrollment = await storage.createEnrollment(enrollmentData);
    this.createdRecords.enrollments.push(enrollment.id);
    return enrollment;
  }

  async createTestPayment(parentEmail: string, overrides: any = {}) {
    const paymentData = {
      parentEmail,
      amount: overrides.amount || 5000,
      status: overrides.status || 'completed',
      paymentDate: overrides.paymentDate || new Date().toISOString(),
      description: overrides.description || 'Test payment',
      childName: overrides.childName || 'Test Child',
      ...overrides
    };

    const payment = await storage.createPayment(paymentData);
    return payment;
  }

  async createTestMembershipEnrollment(parentId: number, schoolId: number, overrides: Partial<InsertMembershipEnrollment> = {}) {
    const membershipYear = overrides.membershipYear ?? new Date().getFullYear();
    const amount = overrides.amount ?? 15000;
    const dueDate = overrides.dueDate ?? new Date();
    const expirationDate = overrides.expirationDate ?? new Date(membershipYear, 11, 31);
    const remaining = overrides.remainingBalance ?? amount;
    const paid = overrides.amountPaid ?? 0;

    const membershipData: InsertMembershipEnrollment = {
      parentUserId: parentId,
      schoolId,
      membershipYear,
      amount,
      amountPaid: paid,
      remainingBalance: remaining,
      totalAmount: overrides.totalAmount ?? amount,
      balanceDue: overrides.balanceDue ?? remaining,
      status: overrides.status ?? 'pending_payment',
      dueDate,
      expirationDate,
      endDate: overrides.endDate ?? expirationDate,
      gracePeriodEnd: overrides.gracePeriodEnd ?? null,
      paymentMethod: overrides.paymentMethod ?? null,
      notes: overrides.notes ?? null,
      membershipTier: overrides.membershipTier ?? 'basic',
      stripeSubscriptionId: overrides.stripeSubscriptionId ?? null,
      stripeCustomerId: overrides.stripeCustomerId ?? null,
      startDate: overrides.startDate ?? null,
      renewalDate: overrides.renewalDate ?? null,
    };

    const membership = await storage.createMembershipEnrollment(membershipData);
    return membership;
  }

  /**
   * Set up a complete test environment with all necessary entities
   */
  async setupTestEnvironment() {
    // Create admin user
    const admin = await this.createTestUser({
      email: 'admin@test.com',
      username: 'testadmin',
      name: 'Test Admin',
      role: 'schoolAdmin'
    });

    // Create school
    const school = await this.createTestSchool(admin.id, {
      name: 'Test Academy'
    });

    // Create locations
    const location1 = await this.createTestLocation(school.id, {
      name: 'Main Campus'
    });
    const location2 = await this.createTestLocation(school.id, {
      name: 'East Campus'
    });
    const locations = [location1, location2];

    // Create categories
    const category1 = await this.createTestCategory(school.id, {
      name: 'Mathematics'
    });
    const category2 = await this.createTestCategory(school.id, {
      name: 'Science'
    });
    const categories = [category1, category2];

    // Create parent user
    const parent = await this.createTestUser({
      email: 'parent@test.com',
      username: 'testparent',
      name: 'Test Parent',
      role: 'parent'
    });

    // Create children
    const child1 = await this.createTestChild(parent.id, {
      firstName: 'Alice',
      lastName: 'Test',
      gradeLevel: '5th',
      schoolId: school.id
    });
    const child2 = await this.createTestChild(parent.id, {
      firstName: 'Bob',
      lastName: 'Test',
      gradeLevel: '3rd',
      schoolId: school.id
    });
    const children = [child1, child2];

    // Create educator user
    const educator = await this.createTestUser({
      email: 'educator@test.com',
      username: 'testeducator',
      name: 'Test Educator',
      role: 'teacher'
    });

    return {
      admin,
      school,
      locations,
      categories,
      parent,
      children,
      educator
    };
  }
}

// Lazy initialization singleton
let testDbInstance: TestDatabase | null = null;

export function getTestDb(): TestDatabase {
  if (!testDbInstance) {
    testDbInstance = new TestDatabase();
  }
  return testDbInstance;
}

// Reset the singleton for test isolation
export function resetTestDb(): void {
  testDbInstance = null;
}

// Export testDb object with getter for backward compatibility
export const testDb = {
  get instance(): TestDatabase {
    return getTestDb();
  },
  // Proxy all methods to the singleton instance
  async cleanup() { return getTestDb().cleanup(); },
  async createTestUser(overrides?: Partial<any>) { return getTestDb().createTestUser(overrides); },
  async getUserById(userId: number) { return getTestDb().getUserById(userId); },
  async updateUser(userId: number, updates: Partial<any>) { return getTestDb().updateUser(userId, updates); },
  async updateUserSchoolId(userId: number, schoolId: number | null) { return getTestDb().updateUserSchoolId(userId, schoolId); },
  async getMembershipEnrollmentsByParentId(parentUserId: number) { return getTestDb().getMembershipEnrollmentsByParentId(parentUserId); },
  async createTestSchool(adminId: number, overrides?: Partial<any>) { return getTestDb().createTestSchool(adminId, overrides); },
  async createTestLocation(schoolId: number, overrides?: Partial<any>) { return getTestDb().createTestLocation(schoolId, overrides); },
  async createTestCategory(schoolId: number, overrides?: Partial<any>) { return getTestDb().createTestCategory(schoolId, overrides); },
  async createTestChild(parentId: number, overrides?: Partial<any>) { return getTestDb().createTestChild(parentId, overrides); },
  async createTestClass(schoolId: number, instructorIdOrOverrides?: number | Partial<any>, maybeOverrides?: Partial<any>) { return getTestDb().createTestClass(schoolId, instructorIdOrOverrides, maybeOverrides); },
  async createTestEnrollment(classId: number, childId: number, overrides?: any) { return getTestDb().createTestEnrollment(classId, childId, overrides); },
  async createTestPayment(parentEmail: string, overrides?: any) { return getTestDb().createTestPayment(parentEmail, overrides); },
  async createTestMembershipEnrollment(parentId: number, schoolId: number, overrides?: any) { return getTestDb().createTestMembershipEnrollment(parentId, schoolId, overrides); },
  async setupTestEnvironment() { return getTestDb().setupTestEnvironment(); },
};
