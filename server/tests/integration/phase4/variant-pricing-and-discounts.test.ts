import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

/**
 * PHASE 4: Enhanced Features
 * Integration Tests for Variant Pricing and Discount Configuration
 * 
 * Test Coverage:
 * - Marketplace class variant pricing
 * - Variant selection during enrollment
 * - Cart hydration with correct variant prices
 * - Free After Threshold discount configuration
 * - Discount settings persistence
 */

describe('Integration: Variant Pricing and Discounts', () => {
  let testSchool: any;
  let testAdmin: any;
  let testParent: any;
  let testChild1: any;
  let testChild2: any;
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

    // Create test parent and children
    testParent = await testDb.createTestUser({ 
      role: 'parent',
      schoolId: testSchool.id 
    });
    
    testChild1 = await testDb.createTestChild(testParent.id, {
      schoolId: testSchool.id,
      firstName: 'Alice',
      lastName: 'Test'
    });

    testChild2 = await testDb.createTestChild(testParent.id, {
      schoolId: testSchool.id,
      firstName: 'Bob',
      lastName: 'Test'
    });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Variant Pricing for Marketplace Classes', () => {
    it('should create enrollment with correct variant price when variant is selected', async () => {
      // Create a marketplace class with multiple variants
      const classWithVariants = await testDb.createTestClass(testSchool.id, {
        title: 'Test Class with Variants',
        description: 'Class with half day and full day options',
        price: 90000, // Default $900 (half day)
        schedule: JSON.stringify({
          variants: [
            {
              id: 'default-variant',
              name: 'Half Day',
              price: 90000, // $900
              startTime: '9:00 AM',
              endTime: '12:00 PM',
              days: ['Monday', 'Wednesday', 'Friday']
            },
            {
              id: 'variant-full-day',
              name: 'Full Day',
              price: 130000, // $1,300
              startTime: '9:00 AM',
              endTime: '3:00 PM',
              days: ['Monday', 'Wednesday', 'Friday']
            }
          ]
        }),
        status: 'active',
        maxStudents: 20,
        locationId: testLocation.id,
        categoryId: testCategory.id
      });

      // Enroll child with Full Day variant selected
      await api.loginAsUser(testParent.email);
      
      const enrollmentResponse = await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild1.id,
        variantId: 'variant-full-day'
      });

      expect(enrollmentResponse.status).toBe(200);
      expect(enrollmentResponse.body.message).toContain('Added to cart');

      // Verify the enrollment was created with correct variant price
      const enrollment = enrollmentResponse.body.enrollment;
      expect(enrollment).toBeDefined();
      expect(enrollment.variantId).toBe('variant-full-day');
      expect(enrollment.totalCost).toBe(130000); // Should be $1,300, not $900
      expect(enrollment.remainingBalance).toBe(130000);
      expect(enrollment.depositRequired).toBe(13000); // 10% of $1,300
    });

    it('should use default variant price when no variant is selected', async () => {
      const classWithVariants = await testDb.createTestClass(testSchool.id, {
        title: 'Test Class Default Variant',
        price: 90000,
        schedule: JSON.stringify({
          variants: [
            {
              id: 'default-variant',
              name: 'Standard Time',
              price: 90000,
              startTime: '9:00 AM',
              endTime: '12:00 PM',
              days: ['Monday', 'Wednesday']
            }
          ]
        }),
        status: 'active',
        maxStudents: 20
      });

      await api.loginAsUser(testParent.email);
      
      const enrollmentResponse = await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild2.id
        // No variantId specified
      });

      expect(enrollmentResponse.status).toBe(200);
      
      const enrollment = enrollmentResponse.body.enrollment;
      expect(enrollment.totalCost).toBe(90000); // Should use default $900
    });

    it('should retrieve enrollment with variant information in cart', async () => {
      // Create class and enrollment with variant
      const classWithVariants = await testDb.createTestClass(testSchool.id, {
        title: 'Cart Test Class',
        price: 90000,
        schedule: JSON.stringify({
          variants: [
            {
              id: 'default-variant',
              name: 'Morning Session',
              price: 90000,
              startTime: '9:00 AM',
              endTime: '12:00 PM'
            },
            {
              id: 'variant-afternoon',
              name: 'Afternoon Session',
              price: 110000, // $1,100
              startTime: '1:00 PM',
              endTime: '4:00 PM'
            }
          ]
        }),
        status: 'active',
        maxStudents: 20
      });

      // Enroll with afternoon variant
      await api.loginAsUser(testParent.email);
      await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild1.id,
        variantId: 'variant-afternoon'
      });

      // Fetch parent enrollments (cart data)
      const enrollmentsResponse = await api.get('/api/parent/enrollments');
      
      expect(enrollmentsResponse.status).toBe(200);
      const enrollments = enrollmentsResponse.body;
      
      // Find our enrollment
      const enrollment = enrollments.find((e: any) => 
        e.marketplaceClassId === classWithVariants.id && 
        e.childId === testChild1.id
      );

      expect(enrollment).toBeDefined();
      expect(enrollment.variantId).toBe('variant-afternoon');
      expect(enrollment.totalCost).toBe(110000);
      expect(enrollment.remainingBalance).toBe(110000);
    });

    it('should handle classes without variants', async () => {
      const simpleClass = await testDb.createTestClass(testSchool.id, {
        title: 'Simple Class No Variants',
        price: 75000, // $750
        status: 'active',
        maxStudents: 15
      });

      await api.loginAsUser(testParent.email);
      
      const enrollmentResponse = await api.post(`/api/classes/${simpleClass.id}/enroll`, {
        childId: testChild2.id
      });

      expect(enrollmentResponse.status).toBe(200);
      
      const enrollment = enrollmentResponse.body.enrollment;
      expect(enrollment.totalCost).toBe(75000);
      expect(enrollment.variantId).toBeNull();
    });
  });

  describe('Free After Threshold Discount Configuration', () => {
    it('should allow school admin to enable free-after-threshold discount', async () => {
      await api.loginAsUser(testAdmin.email);

      const updateResponse = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 3
      });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.message).toContain('successfully');
      expect(updateResponse.body.school).toBeDefined();
      expect(updateResponse.body.school.freeAfterThresholdEnabled).toBe(true);
      expect(updateResponse.body.school.freeAfterThreshold).toBe(3);
    });

    it('should allow school admin to disable free-after-threshold discount', async () => {
      await api.loginAsUser(testAdmin.email);

      // First enable it
      await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 3
      });

      // Then disable it
      const disableResponse = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: false
      });

      expect(disableResponse.status).toBe(200);
      expect(disableResponse.body.school.freeAfterThresholdEnabled).toBe(false);
    });

    it('should allow school admin to update threshold number', async () => {
      await api.loginAsUser(testAdmin.email);

      // Enable with threshold 3
      await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 3
      });

      // Update threshold to 4
      const updateResponse = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThreshold: 4
      });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.school.freeAfterThresholdEnabled).toBe(true);
      expect(updateResponse.body.school.freeAfterThreshold).toBe(4);
    });

    it('should reject invalid threshold values', async () => {
      await api.loginAsUser(testAdmin.email);

      // Try to set threshold to 0
      const response1 = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 0
      });

      expect(response1.status).toBe(400);
      expect(response1.body.message).toContain('Invalid threshold');

      // Try to set negative threshold
      const response2 = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThreshold: -1
      });

      expect(response2.status).toBe(400);
    });

    it('should prevent non-admin users from updating discount settings', async () => {
      await api.loginAsUser(testParent.email);

      const response = await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 3
      });

      // Should be forbidden or unauthorized
      expect([401, 403]).toContain(response.status);
    });

    it('should persist discount settings across requests', async () => {
      await api.loginAsUser(testAdmin.email);

      // Set discount configuration
      await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 5
      });

      // Fetch school data to verify persistence
      const schoolResponse = await api.get('/api/school-admin/my-school');

      expect(schoolResponse.status).toBe(200);
      expect(schoolResponse.body.freeAfterThresholdEnabled).toBe(true);
      expect(schoolResponse.body.freeAfterThreshold).toBe(5);
    });
  });

  describe('Integration: Variant Pricing with Discounts', () => {
    it('should apply free-after-threshold discount correctly with variant pricing', async () => {
      // Enable free after 3 children
      await api.loginAsUser(testAdmin.email);
      await api.patch('/api/school-admin/my-school/free-after-threshold', {
        freeAfterThresholdEnabled: true,
        freeAfterThreshold: 3
      });

      // Create class with variants
      const classWithVariants = await testDb.createTestClass(testSchool.id, {
        title: 'Discount Test Class',
        price: 100000,
        schedule: JSON.stringify({
          variants: [
            {
              id: 'default-variant',
              name: 'Standard',
              price: 100000,
              startTime: '9:00 AM',
              endTime: '12:00 PM'
            },
            {
              id: 'variant-premium',
              name: 'Premium',
              price: 150000, // $1,500
              startTime: '9:00 AM',
              endTime: '3:00 PM'
            }
          ]
        }),
        status: 'active',
        maxStudents: 30
      });

      // Create a third child
      const testChild3 = await testDb.createTestChild(testParent.id, {
        schoolId: testSchool.id,
        firstName: 'Charlie',
        lastName: 'Test'
      });

      const testChild4 = await testDb.createTestChild(testParent.id, {
        schoolId: testSchool.id,
        firstName: 'Diana',
        lastName: 'Test'
      });

      // Enroll 4 children with different variants
      await api.loginAsUser(testParent.email);
      
      await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild1.id,
        variantId: 'variant-premium' // $1,500
      });

      await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild2.id,
        variantId: 'default-variant' // $1,000
      });

      await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild3.id,
        variantId: 'variant-premium' // $1,500
      });

      await api.post(`/api/classes/${classWithVariants.id}/enroll`, {
        childId: testChild4.id,
        variantId: 'default-variant' // $1,000 - Should be free (4th child)
      });

      // Fetch enrollments to verify pricing
      const enrollmentsResponse = await api.get('/api/parent/enrollments');
      const enrollments = enrollmentsResponse.body;

      // Verify all enrollments are created with correct prices
      const child1Enrollment = enrollments.find((e: any) => e.childId === testChild1.id);
      const child2Enrollment = enrollments.find((e: any) => e.childId === testChild2.id);
      const child3Enrollment = enrollments.find((e: any) => e.childId === testChild3.id);
      const child4Enrollment = enrollments.find((e: any) => e.childId === testChild4.id);

      expect(child1Enrollment.totalCost).toBe(150000);
      expect(child2Enrollment.totalCost).toBe(100000);
      expect(child3Enrollment.totalCost).toBe(150000);
      expect(child4Enrollment.totalCost).toBe(100000); // Original price stored

      // Note: The actual discount application happens during cart checkout calculation
      // These tests verify the variant prices are correctly stored in enrollments
    });
  });
});
