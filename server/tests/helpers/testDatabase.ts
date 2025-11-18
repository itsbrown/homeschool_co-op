import { storage } from '../../storage';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcryptjs';
import type { InsertUser, InsertSchool, InsertLocation, InsertCategory, User, School, Location, Category, Child, Class } from '../../../shared/schema';

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

    const user = await storage.createUser(userData);
    this.createdRecords.users.push(user.id);
    return user;
  }

  async updateUser(userId: number, updates: Partial<User>): Promise<User> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    const updatedUser = { ...user, ...updates };
    await storage.updateUser(userId, updatedUser);
    return updatedUser;
  }

  async updateUserSchoolId(userId: number, schoolId: number): Promise<User> {
    return this.updateUser(userId, { schoolId });
  }

  async createTestSchool(adminId: number, overrides: Partial<InsertSchool> = {}): Promise<School> {
    const uniqueId = nanoid(8);
    const schoolData: InsertSchool = {
      name: overrides.name || `Test School ${uniqueId}`,
      type: overrides.type || 'school',
      adminId,
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
      email: overrides.email || `school_${uniqueId}@example.com`,
      status: overrides.status || 'active',
      address: null,
      phoneNumber: null,
      website: null,
      logo: null,
      registrationCode: `TEST${uniqueId.toUpperCase()}`,
      description: null,
      ...overrides
    };

    const school = await storage.createSchool(schoolData);
    this.createdRecords.schools.push(school.id);
    return school;
  }

  async createTestLocation(schoolId: number, overrides: Partial<InsertLocation> = {}): Promise<Location> {
    const uniqueId = nanoid(8);
    const locationData = {
      name: overrides.name || `Test Location ${uniqueId}`,
      schoolId,
      address: overrides.address || '123 Test St',
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
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
    
    const childData = {
      firstName: overrides.firstName || `Child${uniqueId}`,
      lastName: overrides.lastName || 'Test',
      birthdate: overrides.birthdate || '2010-01-01',
      gradeLevel: overrides.gradeLevel || '5th',
      parentId,
      parentEmail,
      schoolId: overrides.schoolId || null,
      ...overrides
    };

    const child = await storage.createChild(childData);
    this.createdRecords.children.push(child.id);
    return child;
  }

  async createTestClass(schoolId: number, overrides: any = {}): Promise<Class> {
    const uniqueId = nanoid(8);
    const classData = {
      title: overrides.title || `Test Class ${uniqueId}`,
      description: overrides.description || 'Test class description',
      schoolId,
      status: overrides.status || 'active',
      type: overrides.type || 'marketplace',
      price: overrides.price || 100,
      capacity: overrides.capacity || 20,
      locationId: overrides.locationId || null,
      categoryId: overrides.categoryId || null,
      ...overrides
    };

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

  async createTestMembershipEnrollment(parentId: number, schoolId: number, overrides: any = {}) {
    const membershipData = {
      parentId,
      schoolId,
      membershipYear: overrides.membershipYear || new Date().getFullYear(),
      amount: overrides.amount || 15000,
      totalCost: overrides.totalCost || 15000,
      remainingBalance: overrides.remainingBalance || 15000,
      status: overrides.status || 'pending',
      dueDate: overrides.dueDate || new Date().toISOString(),
      expirationDate: overrides.expirationDate || new Date(new Date().getFullYear(), 11, 31).toISOString(),
      gracePeriodEnd: overrides.gracePeriodEnd || new Date(new Date().getFullYear() + 1, 0, 31).toISOString(),
      ...overrides
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

// Export singleton instance
export const testDb = new TestDatabase();
