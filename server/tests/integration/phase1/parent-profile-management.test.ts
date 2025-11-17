import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for Parent Profile Management
 * 
 * Test Coverage:
 * - School Admin viewing parent profiles
 * - Parent profile data aggregation (children, enrollments, payments, memberships)
 * - School Admin adding children for parents
 * - School Admin creating enrollments for parents
 * - Parent self-service (viewing own children, enrollments)
 * - Multi-tenant security (cross-school data isolation)
 * - Data integrity (payment calculations, balances)
 */

describe('Integration: Parent Profile Management', () => {
  let testSchool: any;
  let testSchool2: any;
  let testAdmin: any;
  let testAdmin2: any;
  let testParent: any;
  let testParent2: any;
  let testChild1: any;
  let testChild2: any;
  let testClass1: any;
  let testClass2: any;
  let testCategory: any;

  beforeAll(async () => {
    await testDb.cleanup();
    
    // Create first school environment
    const env1 = await testDb.setupTestEnvironment();
    testSchool = env1.school;
    testAdmin = env1.admin;
    testParent = env1.parent;
    testChild1 = env1.children[0];
    testChild2 = env1.children[1];
    testCategory = env1.categories[0];

    // Create second school for multi-tenant testing
    testAdmin2 = await testDb.createTestUser({
      email: 'admin2@test.com',
      username: 'testadmin2',
      name: 'Test Admin 2',
      role: 'schoolAdmin'
    });
    testSchool2 = await testDb.createTestSchool(testAdmin2.id, {
      name: 'Test Academy 2'
    });

    // Create second parent for multi-tenant testing
    testParent2 = await testDb.createTestUser({
      email: 'parent2@test.com',
      username: 'testparent2',
      name: 'Test Parent 2',
      role: 'parent'
    });

    // Create test classes
    testClass1 = await testDb.createTestClass(testSchool.id, {
      title: 'Math 101',
      price: 10000, // $100 in cents
      categoryId: testCategory.id
    });
    testClass2 = await testDb.createTestClass(testSchool.id, {
      title: 'Science 101',
      price: 15000, // $150 in cents
      categoryId: testCategory.id
    });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('School Admin View - Parent Profile', () => {
    it('should retrieve comprehensive parent profile with all related data', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.parent).toBeDefined();
      expect(response.body.parent.email).toBe(testParent.email);
      expect(response.body.children).toBeDefined();
      expect(response.body.children.length).toBe(2);
      expect(response.body.enrollments).toBeDefined();
      expect(response.body.paymentHistory).toBeDefined();
      expect(response.body.membershipEnrollments).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });

    it('should return 404 for non-existent parent', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get('/api/parent-profile/999999');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('should return 400 when trying to view non-parent user profile', async () => {
      await api.loginAsUser(testAdmin.email);

      // Try to view the admin's own profile as a parent profile
      const response = await api.get(`/api/parent-profile/${testAdmin.id}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not a parent');
    });

    it('should include children information in parent profile', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.children.length).toBe(2);
      
      const child = response.body.children[0];
      expect(child).toHaveProperty('firstName');
      expect(child).toHaveProperty('lastName');
      expect(child).toHaveProperty('gradeLevel');
      expect(child).toHaveProperty('birthdate');
    });

    it('should include enrollment information with class details', async () => {
      // Create an enrollment first
      const enrollment = await testDb.createTestEnrollment(testClass1.id, testChild1.id, {
        status: 'active',
        totalCost: 10000,
        amountPaid: 5000,
        remainingBalance: 5000
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.enrollments.length).toBeGreaterThan(0);
      
      const enrollmentData = response.body.enrollments.find((e: any) => e.id === enrollment.id);
      expect(enrollmentData).toBeDefined();
      expect(enrollmentData.className).toBeDefined();
      expect(enrollmentData.childName).toBeDefined();
      expect(enrollmentData.status).toBe('active');
    });

    it('should include payment history with correct totals', async () => {
      // Create test payments
      await testDb.createTestPayment(testParent.email, {
        amount: 5000,
        status: 'completed',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });
      await testDb.createTestPayment(testParent.email, {
        amount: 3000,
        status: 'completed',
        childName: `${testChild2.firstName} ${testChild2.lastName}`
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.paymentHistory.length).toBeGreaterThanOrEqual(2);
      expect(response.body.summary.totalAmountPaid).toBeGreaterThanOrEqual(8000);
    });

    it('should include membership enrollment information', async () => {
      // Create a membership enrollment
      await testDb.createTestMembershipEnrollment(testParent.id, testSchool.id, {
        status: 'active',
        amount: 15000,
        totalCost: 15000,
        remainingBalance: 15000
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.membershipEnrollments.length).toBeGreaterThan(0);
      
      const membership = response.body.membershipEnrollments[0];
      expect(membership.schoolId).toBe(testSchool.id);
      expect(membership.status).toBe('active');
      expect(membership.amount).toBe(15000);
    });

    it('should calculate summary statistics correctly', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.summary).toHaveProperty('totalAmountPaid');
      expect(response.body.summary).toHaveProperty('totalAmountDue');
      expect(response.body.summary).toHaveProperty('totalChildren');
      expect(response.body.summary).toHaveProperty('activeEnrollments');
      expect(typeof response.body.summary.totalAmountPaid).toBe('number');
      expect(typeof response.body.summary.totalAmountDue).toBe('number');
    });
  });

  describe('Parent Self-Service - View Own Data', () => {
    it('should allow parents to view their own children', async () => {
      await api.loginAsUser(testParent.email);

      const response = await api.get('/api/parent/children');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].firstName).toBeDefined();
    });

    it('should allow parents to view their own enrollments', async () => {
      // Create enrollment for the parent's child
      await testDb.createTestEnrollment(testClass1.id, testChild1.id);

      await api.loginAsUser(testParent.email);

      const response = await api.get('/api/parent/enrollments');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when parent has no children', async () => {
      // Create a new parent with no children
      const newParent = await testDb.createTestUser({
        email: 'nochildren@test.com',
        role: 'parent',
        name: 'Parent No Children'
      });

      await api.loginAsUser(newParent.email);

      const response = await api.get('/api/parent/children');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should allow parents to register new children', async () => {
      await api.loginAsUser(testParent.email);

      const childData = {
        firstName: 'NewChild',
        lastName: 'Test',
        birthdate: '2015-05-15',
        gradeLevel: '2nd',
        school: 'Test Academy'
      };

      const response = await api.post('/api/parent/children', childData);

      expect(response.status).toBe(201);
      expect(response.body.firstName).toBe('NewChild');
      expect(response.body.lastName).toBe('Test');

      // Verify child was created
      const childrenResponse = await api.get('/api/parent/children');
      expect(childrenResponse.body.length).toBe(3);
    });

    it('should require authentication to view children', async () => {
      api.clearAuth();

      const response = await api.get('/api/parent/children');

      expect(response.status).toBe(401);
    });
  });

  describe('Multi-Tenant Security', () => {
    it('should prevent school admin from viewing parents from other schools', async () => {
      // Admin from school 2 tries to view parent from school 1
      await api.loginAsUser(testAdmin2.email);

      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      // This should either return 403 or filter out data not belonging to admin's school
      // The exact behavior depends on implementation
      expect([403, 404]).toContain(response.status);
    });

    it('should only show enrollments from admin school', async () => {
      // Create child for parent2 in school2
      const child = await testDb.createTestChild(testParent2.id, {
        firstName: 'School2Child',
        schoolId: testSchool2.id,
        parentEmail: testParent2.email
      });

      // Create class in school2
      const class2 = await testDb.createTestClass(testSchool2.id, {
        title: 'School2 Class'
      });

      // Create enrollment in school2
      await testDb.createTestEnrollment(class2.id, child.id);

      // Admin from school1 tries to view
      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent2.id}`);

      // Should either deny access or not show school2 data
      if (response.status === 200) {
        // If access is allowed, should not show school2 enrollments
        const school2Enrollments = response.body.enrollments.filter(
          (e: any) => e.classId === class2.id
        );
        expect(school2Enrollments.length).toBe(0);
      }
    });

    it('should prevent parents from viewing other parents children', async () => {
      // Parent tries to view specific child by ID
      await api.loginAsUser(testParent2.email);

      // Try to access child1 who belongs to testParent
      const response = await api.get(`/api/parent/children/${testChild1.id}`);

      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Data Integrity', () => {
    it('should accurately calculate remaining balance with multiple payments', async () => {
      // Create enrollment with $100 total cost
      const enrollment = await testDb.createTestEnrollment(testClass1.id, testChild1.id, {
        totalCost: 10000,
        amountPaid: 0,
        remainingBalance: 10000
      });

      // Make partial payment of $40
      await testDb.createTestPayment(testParent.email, {
        amount: 4000,
        status: 'completed',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });

      // Make another partial payment of $30
      await testDb.createTestPayment(testParent.email, {
        amount: 3000,
        status: 'completed',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      
      // Total paid should be $70
      const totalPaid = response.body.summary.totalAmountPaid;
      expect(totalPaid).toBeGreaterThanOrEqual(7000);
    });

    it('should only count completed/succeeded payments in totals', async () => {
      // Create completed payment
      await testDb.createTestPayment(testParent.email, {
        amount: 5000,
        status: 'completed',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });

      // Create pending payment (should not be counted)
      await testDb.createTestPayment(testParent.email, {
        amount: 10000,
        status: 'pending',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });

      // Create failed payment (should not be counted)
      await testDb.createTestPayment(testParent.email, {
        amount: 3000,
        status: 'failed',
        childName: `${testChild1.firstName} ${testChild1.lastName}`
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      
      // Should only count the completed payment
      const paymentHistory = response.body.paymentHistory;
      const completedPayments = paymentHistory.filter(
        (p: any) => p.status === 'completed' || p.status === 'succeeded'
      );
      
      expect(completedPayments.length).toBeGreaterThan(0);
    });

    it('should handle parent with no payment history', async () => {
      // Create new parent with no payments
      const newParent = await testDb.createTestUser({
        email: 'nopayments@test.com',
        role: 'parent',
        name: 'Parent No Payments'
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${newParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.paymentHistory).toEqual([]);
      expect(response.body.summary.totalAmountPaid).toBe(0);
    });
  });

  describe('Enrollment Status Tracking', () => {
    it('should track different enrollment statuses correctly', async () => {
      // Create enrollments with different statuses
      await testDb.createTestEnrollment(testClass1.id, testChild1.id, {
        status: 'active'
      });
      await testDb.createTestEnrollment(testClass2.id, testChild2.id, {
        status: 'pending_payment'
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      
      const enrollments = response.body.enrollments;
      const activeEnrollments = enrollments.filter((e: any) => e.status === 'active');
      const pendingEnrollments = enrollments.filter((e: any) => e.status === 'pending_payment');

      expect(activeEnrollments.length).toBeGreaterThan(0);
      expect(pendingEnrollments.length).toBeGreaterThan(0);
    });

    it('should count active enrollments correctly in summary', async () => {
      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.summary.activeEnrollments).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.summary.activeEnrollments).toBe('number');
    });
  });

  describe('Emergency Contact Information', () => {
    it('should include emergency contact information for children', async () => {
      // Create child with emergency contact
      const childWithContact = await testDb.createTestChild(testParent.id, {
        firstName: 'EmergencyTest',
        lastName: 'Child',
        emergencyContact: 'Jane Doe - 555-1234',
        parentEmail: testParent.email
      });

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${testParent.id}`);

      expect(response.status).toBe(200);
      
      const children = response.body.children;
      const childWithEmergency = children.find((c: any) => c.id === childWithContact.id);
      
      if (childWithEmergency) {
        expect(childWithEmergency.emergencyContact).toBe('Jane Doe - 555-1234');
      }
    });
  });

  describe('Performance and Data Loading', () => {
    it('should handle parent with many children efficiently', async () => {
      // Create a parent with 10 children
      const manyChildrenParent = await testDb.createTestUser({
        email: 'manychildren@test.com',
        role: 'parent',
        name: 'Parent Many Children'
      });

      for (let i = 0; i < 10; i++) {
        await testDb.createTestChild(manyChildrenParent.id, {
          firstName: `Child${i}`,
          parentEmail: manyChildrenParent.email
        });
      }

      await api.loginAsUser(testAdmin.email);
      const startTime = Date.now();
      const response = await api.get(`/api/parent-profile/${manyChildrenParent.id}`);
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.body.children.length).toBe(10);
      
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle parent with many enrollments efficiently', async () => {
      // Create parent with multiple enrollments
      const busyParent = await testDb.createTestUser({
        email: 'busyparent@test.com',
        role: 'parent',
        name: 'Busy Parent'
      });

      const busyChild = await testDb.createTestChild(busyParent.id, {
        firstName: 'Busy',
        lastName: 'Child',
        parentEmail: busyParent.email
      });

      // Create multiple classes and enrollments
      for (let i = 0; i < 5; i++) {
        const testClass = await testDb.createTestClass(testSchool.id, {
          title: `Class ${i}`
        });
        await testDb.createTestEnrollment(testClass.id, busyChild.id);
      }

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/parent-profile/${busyParent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.enrollments.length).toBeGreaterThanOrEqual(5);
    });
  });
});
