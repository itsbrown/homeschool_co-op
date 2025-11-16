import { db } from '../../db';
import { eq, inArray } from 'drizzle-orm';
import { 
  users, schools, children, schoolStudents, schoolStaff, 
  locations, categories, classes, schoolClassEnrollments, programEnrollments,
  notifications, customForms, dailyFlowTemplates, knowledgeBases
} from '../../../shared/schema';
import { nanoid } from 'nanoid';
import type { InsertUser, InsertSchool, InsertLocation, InsertCategory } from '../../../shared/schema';

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
    // Get the actual db instance
    const database = await db();
    if (!database) return;

    // Clean up in reverse order of dependencies
    if (this.createdRecords.enrollments.length > 0) {
      await database.delete(schoolClassEnrollments).where(
        inArray(schoolClassEnrollments.id, this.createdRecords.enrollments)
      );
    }
    
    if (this.createdRecords.classes.length > 0) {
      await database.delete(classes).where(
        inArray(classes.id, this.createdRecords.classes)
      );
    }

    if (this.createdRecords.categories.length > 0) {
      await database.delete(categories).where(
        inArray(categories.id, this.createdRecords.categories)
      );
    }

    if (this.createdRecords.locations.length > 0) {
      await database.delete(locations).where(
        inArray(locations.id, this.createdRecords.locations)
      );
    }

    if (this.createdRecords.children.length > 0) {
      await database.delete(children).where(
        inArray(children.id, this.createdRecords.children)
      );
    }

    if (this.createdRecords.schools.length > 0) {
      await database.delete(schools).where(
        inArray(schools.id, this.createdRecords.schools)
      );
    }

    if (this.createdRecords.users.length > 0) {
      await database.delete(users).where(
        inArray(users.id, this.createdRecords.users)
      );
    }

    // Reset tracking
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

  async createTestUser(overrides: Partial<InsertUser> = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const userData: InsertUser = {
      username: overrides.username || `testuser_${uniqueId}`,
      email: overrides.email || `test_${uniqueId}@example.com`,
      password: overrides.password || 'hashedpassword123',
      name: overrides.name || `Test User ${uniqueId}`,
      ...overrides
    };

    const [user] = await database.insert(users).values(userData).returning();
    this.createdRecords.users.push(user.id);
    return user;
  }

  async createTestSchool(adminId: number, overrides: Partial<InsertSchool> = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const schoolData = {
      name: overrides.name || `Test School ${uniqueId}`,
      type: overrides.type || ('school' as const),
      adminId,
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
      email: overrides.email || `school_${uniqueId}@example.com`,
      status: overrides.status || ('active' as const),
      address: null,
      phoneNumber: null,
      website: null,
      logo: null,
      description: null,
      foundedYear: null,
      accreditation: null,
      enrollmentSize: null,
      registrationCode: null,
      ...overrides
    };

    const [school] = await database.insert(schools).values(schoolData).returning();
    this.createdRecords.schools.push(school.id);
    return school;
  }

  async createTestLocation(schoolId: number, overrides: Partial<InsertLocation> = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const locationData = {
      schoolId,
      name: overrides.name || `Test Location ${uniqueId}`,
      address: overrides.address || '123 Test St',
      city: overrides.city || 'Test City',
      state: overrides.state || 'CA',
      zipCode: overrides.zipCode || '12345',
      code: `LOC${uniqueId}`,
      email: null,
      phoneNumber: null,
      managerName: null,
      capacity: null,
      ...overrides
    };

    const [location] = await database.insert(locations).values(locationData).returning();
    this.createdRecords.locations.push(location.id);
    return location;
  }

  async createTestCategory(schoolId: number, overrides: Partial<InsertCategory> = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const categoryData = {
      schoolId,
      name: overrides.name || `Test Category ${uniqueId}`,
      description: null,
      ...overrides
    };

    const [category] = await database.insert(categories).values(categoryData).returning();
    this.createdRecords.categories.push(category.id);
    return category;
  }

  async createTestChild(parentId: number, overrides: any = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const childData = {
      parentId,
      firstName: `TestChild${uniqueId}`,
      lastName: 'Tester',
      dateOfBirth: new Date('2015-01-01'),
      ...overrides
    };

    const [child] = await database.insert(children).values(childData).returning();
    this.createdRecords.children.push(child.id);
    return child;
  }

  async createTestClass(schoolId: number, overrides: any = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const uniqueId = nanoid(8);
    const classData = {
      schoolId,
      title: overrides.title || `Test Class ${uniqueId}`,
      description: overrides.description || 'Test class description',
      price: overrides.price || 5000,
      maxStudents: overrides.maxStudents || 20,
      status: overrides.status || ('active' as const),
      ...overrides
    };

    const [classRecord] = await database.insert(classes).values(classData).returning();
    this.createdRecords.classes.push(classRecord.id);
    return classRecord;
  }

  async createTestEnrollment(childId: number, classId: number, overrides: any = {}) {
    const database = await db();
    if (!database) throw new Error('Database not available');

    const enrollmentData = {
      childId,
      classId,
      status: overrides.status || ('pending' as const),
      ...overrides
    };

    const [enrollment] = await database.insert(schoolClassEnrollments).values(enrollmentData).returning();
    this.createdRecords.enrollments.push(enrollment.id);
    return enrollment;
  }

  // Helper to create a complete test environment
  async setupTestEnvironment() {
    // Create admin user
    const admin = await this.createTestUser({
      role: 'schoolAdmin',
      name: 'Test Admin'
    });

    // Create school
    const school = await this.createTestSchool(admin.id, {
      name: 'Test Academy'
    });

    // Create locations
    const mainLocation = await this.createTestLocation(school.id, {
      name: 'Main Campus'
    });

    const secondLocation = await this.createTestLocation(school.id, {
      name: 'East Campus'
    });

    // Create categories
    const mathCategory = await this.createTestCategory(school.id, {
      name: 'Mathematics'
    });

    const scienceCategory = await this.createTestCategory(school.id, {
      name: 'Science'
    });

    // Create parent user
    const parent = await this.createTestUser({
      role: 'parent',
      name: 'Test Parent'
    });

    // Create children
    const child1 = await this.createTestChild(parent.id, {
      firstName: 'Alice'
    });

    const child2 = await this.createTestChild(parent.id, {
      firstName: 'Bob'
    });

    // Create educator
    const educator = await this.createTestUser({
      role: 'teacher',
      name: 'Test Educator'
    });

    return {
      admin,
      school,
      locations: [mainLocation, secondLocation],
      categories: [mathCategory, scienceCategory],
      parent,
      children: [child1, child2],
      educator
    };
  }
}

// Singleton instance for tests
export const testDb = new TestDatabase();
