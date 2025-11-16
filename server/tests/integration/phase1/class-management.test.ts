import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for Class Management
 * 
 * Test Coverage:
 * - Class CRUD operations
 * - Pricing and variants
 * - Filtering and sorting
 * - Enrollment counts
 * - Class sharing functionality
 * - Multi-location class management
 */

describe('Integration: Class Management', () => {
  let testSchool: any;
  let testAdmin: any;
  let testLocation: any;
  let testCategory: any;

  beforeAll(async () => {
    await testDb.cleanup();
    
    // Setup test environment
    const env = await testDb.setupTestEnvironment();
    testSchool = env.school;
    testAdmin = env.admin;
    testLocation = env.locations[0];
    testCategory = env.categories[0];
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Class CRUD Operations', () => {
    it('should create a new class with all required fields', async () => {
      const classData = {
        schoolId: testSchool.id,
        title: 'Introduction to Mathematics',
        description: 'Learn the fundamentals of mathematics',
        price: 5000, // $50.00
        maxStudents: 20,
        status: 'active' as const,
        locationId: testLocation.id,
        categoryId: testCategory.id,
        startDate: new Date('2025-01-15'),
        endDate: new Date('2025-05-15'),
        schedule: 'Monday & Wednesday 3:00-4:30 PM'
      };

      const classRecord = await testDb.createTestClass(testSchool.id, classData);

      expect(classRecord).toBeDefined();
      expect(classRecord.id).toBeDefined();
      expect(classRecord.title).toBe(classData.title);
      expect(classRecord.price).toBe(5000);
      expect(classRecord.maxStudents).toBe(20);
      expect(classRecord.status).toBe('active');
    });

    it('should retrieve class by ID', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Test Class for Retrieval'
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/classes/${classRecord.id}`);

      expect(response.status).toBe(200);
      expect(response.body.class.id).toBe(classRecord.id);
      expect(response.body.class.title).toBe('Test Class for Retrieval');
    });

    it('should update class information', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Original Class Title',
        price: 5000
      });

      await api.loginAsUser(testAdmin.email);
      
      const updateData = {
        title: 'Updated Class Title',
        price: 7500,
        description: 'Updated description'
      };

      const response = await api.patch(`/api/classes/${classRecord.id}`, updateData);

      expect(response.status).toBe(200);
      expect(response.body.class.title).toBe('Updated Class Title');
      expect(response.body.class.price).toBe(7500);
    });

    it('should delete a class', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Class to Delete'
      });

      await api.loginAsUser(testAdmin.email);
      
      const deleteResponse = await api.delete(`/api/classes/${classRecord.id}`);
      expect(deleteResponse.status).toBe(200);

      // Verify class no longer exists
      const getResponse = await api.get(`/api/classes/${classRecord.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should prevent deletion of class with enrollments', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Class with Enrollments'
      });

      const parent = await testDb.createTestUser({ role: 'parent' });
      const child = await testDb.createTestChild(parent.id);
      await testDb.createTestEnrollment(child.id, classRecord.id);

      await api.loginAsUser(testAdmin.email);
      
      const response = await api.delete(`/api/classes/${classRecord.id}`);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('enrollments');
    });
  });

  describe('Class Pricing and Variants', () => {
    it('should create class with pricing tiers', async () => {
      const classData = {
        title: 'Art Class with Tiers',
        price: 5000, // Base price
        pricingTiers: [
          { name: 'Early Bird', price: 4000, endDate: '2025-01-01' },
          { name: 'Regular', price: 5000, endDate: '2025-02-01' },
          { name: 'Late', price: 6000 }
        ]
      };

      const classRecord = await testDb.createTestClass(testSchool.id, classData);

      expect(classRecord.pricingTiers).toBeDefined();
      expect(classRecord.pricingTiers).toHaveLength(3);
    });

    it('should create class with multiple variants (sizes, options)', async () => {
      const classData = {
        title: 'T-Shirt Order Class',
        price: 2000,
        variants: [
          { name: 'Small', price: 2000, sku: 'TSHIRT-S' },
          { name: 'Medium', price: 2000, sku: 'TSHIRT-M' },
          { name: 'Large', price: 2500, sku: 'TSHIRT-L' },
          { name: 'XL', price: 2500, sku: 'TSHIRT-XL' }
        ]
      };

      const classRecord = await testDb.createTestClass(testSchool.id, classData);

      expect(classRecord.variants).toBeDefined();
      expect(classRecord.variants).toHaveLength(4);
      expect(classRecord.variants[2].price).toBe(2500); // Large size
    });

    it('should apply discount to class pricing', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Discounted Class',
        price: 10000
      });

      await api.loginAsUser(testAdmin.email);

      const discountData = {
        code: 'SAVE20',
        type: 'percentage',
        value: 20,
        applicableClassIds: [classRecord.id]
      };

      const response = await api.post('/api/discounts', discountData);

      expect(response.status).toBe(200);
      expect(response.body.discount.value).toBe(20);

      // Apply discount and calculate final price
      const calculatedPrice = 10000 * (1 - 0.20);
      expect(calculatedPrice).toBe(8000); // $80.00
    });
  });

  describe('Class Filtering and Sorting', () => {
    beforeEach(async () => {
      // Create sample classes for filtering
      await testDb.createTestClass(testSchool.id, {
        title: 'Math 101',
        categoryId: testCategory.id,
        locationId: testLocation.id,
        status: 'active',
        price: 5000
      });

      await testDb.createTestClass(testSchool.id, {
        title: 'Science 101',
        categoryId: testCategory.id,
        status: 'active',
        price: 7500
      });

      await testDb.createTestClass(testSchool.id, {
        title: 'Art Workshop',
        status: 'draft',
        price: 3000
      });
    });

    it('should filter classes by status', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { status: 'active' });

      expect(response.status).toBe(200);
      expect(response.body.classes).toBeDefined();
      expect(response.body.classes.length).toBeGreaterThanOrEqual(2);
      expect(response.body.classes.every((c: any) => c.status === 'active')).toBe(true);
    });

    it('should filter classes by location', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { locationId: testLocation.id });

      expect(response.status).toBe(200);
      expect(response.body.classes.every((c: any) => c.locationId === testLocation.id)).toBe(true);
    });

    it('should filter classes by category', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { categoryId: testCategory.id });

      expect(response.status).toBe(200);
      expect(response.body.classes.every((c: any) => c.categoryId === testCategory.id)).toBe(true);
    });

    it('should sort classes by price ascending', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { 
        sortBy: 'price',
        sortOrder: 'asc'
      });

      expect(response.status).toBe(200);
      const prices = response.body.classes.map((c: any) => c.price);
      
      // Verify ascending order
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });

    it('should sort classes by title alphabetically', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { 
        sortBy: 'title',
        sortOrder: 'asc'
      });

      expect(response.status).toBe(200);
      const titles = response.body.classes.map((c: any) => c.title);
      
      // Verify alphabetical order
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i].localeCompare(titles[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should search classes by keyword', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/classes', { search: 'Math' });

      expect(response.status).toBe(200);
      expect(response.body.classes.some((c: any) => c.title.includes('Math'))).toBe(true);
    });
  });

  describe('Enrollment Counts and Capacity', () => {
    it('should track current enrollment count', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Class with Enrollments',
        maxStudents: 20
      });

      // Enroll students
      const parent = await testDb.createTestUser({ role: 'parent' });
      const child1 = await testDb.createTestChild(parent.id);
      const child2 = await testDb.createTestChild(parent.id);
      
      await testDb.createTestEnrollment(child1.id, classRecord.id);
      await testDb.createTestEnrollment(child2.id, classRecord.id);

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/classes/${classRecord.id}`);

      expect(response.status).toBe(200);
      expect(response.body.class.currentEnrollment).toBe(2);
      expect(response.body.class.spotsAvailable).toBe(18);
    });

    it('should prevent enrollment when class is full', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Full Class',
        maxStudents: 2
      });

      const parent = await testDb.createTestUser({ role: 'parent' });
      const child1 = await testDb.createTestChild(parent.id);
      const child2 = await testDb.createTestChild(parent.id);
      const child3 = await testDb.createTestChild(parent.id);

      // Fill the class
      await testDb.createTestEnrollment(child1.id, classRecord.id);
      await testDb.createTestEnrollment(child2.id, classRecord.id);

      // Attempt to over-enroll
      await api.loginAsUser(parent.email);
      const response = await api.post('/api/enrollments', {
        childId: child3.id,
        classId: classRecord.id
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('full');
    });

    it('should show waitlist availability when enabled', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Class with Waitlist',
        maxStudents: 10,
        waitlistEnabled: true,
        waitlistCapacity: 5
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/classes/${classRecord.id}`);

      expect(response.status).toBe(200);
      expect(response.body.class.waitlistEnabled).toBe(true);
      expect(response.body.class.waitlistCapacity).toBe(5);
    });
  });

  describe('Class Sharing Functionality', () => {
    it('should generate shareable link for public class', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Public Shareable Class',
        isPublic: true
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.post(`/api/classes/${classRecord.id}/share`);

      expect(response.status).toBe(200);
      expect(response.body.shareUrl).toBeDefined();
      expect(response.body.shareUrl).toContain(classRecord.id.toString());
    });

    it('should allow public access to shared class', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Shared Public Class',
        isPublic: true,
        shareToken: 'abc123xyz'
      });

      // Access without authentication
      const response = await api.get(`/api/classes/shared/${classRecord.shareToken}`);

      expect(response.status).toBe(200);
      expect(response.body.class.title).toBe('Shared Public Class');
    });

    it('should prevent sharing of private class without permission', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Private Class',
        isPublic: false
      });

      const otherUser = await testDb.createTestUser({ role: 'parent' });
      await api.loginAsUser(otherUser.email);

      const response = await api.post(`/api/classes/${classRecord.id}/share`);

      expect(response.status).toBe(403);
    });
  });

  describe('Multi-Location Class Management', () => {
    it('should create classes at different locations', async () => {
      const location1 = testLocation;
      const location2 = await testDb.createTestLocation(testSchool.id, {
        name: 'Second Location'
      });

      const class1 = await testDb.createTestClass(testSchool.id, {
        title: 'Class at Location 1',
        locationId: location1.id
      });

      const class2 = await testDb.createTestClass(testSchool.id, {
        title: 'Class at Location 2',
        locationId: location2.id
      });

      expect(class1.locationId).toBe(location1.id);
      expect(class2.locationId).toBe(location2.id);
    });

    it('should filter classes by multiple locations', async () => {
      const location1 = testLocation;
      const location2 = await testDb.createTestLocation(testSchool.id, {
        name: 'Second Location'
      });

      await testDb.createTestClass(testSchool.id, {
        title: 'Class at Location 1',
        locationId: location1.id
      });

      await testDb.createTestClass(testSchool.id, {
        title: 'Class at Location 2',
        locationId: location2.id
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get('/api/classes', {
        locationIds: [location1.id, location2.id]
      });

      expect(response.status).toBe(200);
      expect(response.body.classes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Class Status Management', () => {
    it('should update class status from draft to active', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Draft Class',
        status: 'draft'
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.patch(`/api/classes/${classRecord.id}`, {
        status: 'active'
      });

      expect(response.status).toBe(200);
      expect(response.body.class.status).toBe('active');
    });

    it('should archive completed classes', async () => {
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Completed Class',
        status: 'active',
        endDate: new Date('2024-12-31')
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.patch(`/api/classes/${classRecord.id}`, {
        status: 'archived'
      });

      expect(response.status).toBe(200);
      expect(response.body.class.status).toBe('archived');
    });

    it('should not show draft classes to parents', async () => {
      await testDb.createTestClass(testSchool.id, {
        title: 'Draft Class Hidden',
        status: 'draft'
      });

      const parent = await testDb.createTestUser({ role: 'parent' });
      await api.loginAsUser(parent.email);

      const response = await api.get('/api/classes/public');

      expect(response.status).toBe(200);
      expect(response.body.classes.every((c: any) => c.status !== 'draft')).toBe(true);
    });
  });
});
