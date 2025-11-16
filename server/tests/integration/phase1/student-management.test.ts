import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for Student Management
 * 
 * Test Coverage:
 * - Student profile CRUD operations
 * - Enrollment management
 * - Student rosters
 * - Filtering by class/status/location
 * - Emergency contacts
 * - Medical information
 */

describe('Integration: Student Management', () => {
  let testSchool: any;
  let testAdmin: any;
  let testParent: any;
  let testLocation: any;
  let testClass: any;

  beforeAll(async () => {
    await testDb.cleanup();
    
    const env = await testDb.setupTestEnvironment();
    testSchool = env.school;
    testAdmin = env.admin;
    testParent = env.parent;
    testLocation = env.locations[0];

    testClass = await testDb.createTestClass(testSchool.id, {
      title: 'Test Class for Roster',
      locationId: testLocation.id
    });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Student Profile CRUD', () => {
    it('should create student profile with all required fields', async () => {
      const childData = {
        parentId: testParent.id,
        firstName: 'Emma',
        lastName: 'Johnson',
        dateOfBirth: new Date('2015-06-15'),
        grade: '4th Grade',
        gender: 'female'
      };

      const child = await testDb.createTestChild(testParent.id, childData);

      expect(child).toBeDefined();
      expect(child.firstName).toBe('Emma');
      expect(child.lastName).toBe('Johnson');
      expect(child.parentId).toBe(testParent.id);
    });

    it('should retrieve student profile by ID', async () => {
      const child = await testDb.createTestChild(testParent.id, {
        firstName: 'Oliver',
        lastName: 'Smith'
      });

      await api.loginAsUser(testParent.email);
      const response = await api.get(`/api/children/${child.id}`);

      expect(response.status).toBe(200);
      expect(response.body.child.firstName).toBe('Oliver');
      expect(response.body.child.lastName).toBe('Smith');
    });

    it('should update student profile information', async () => {
      const child = await testDb.createTestChild(testParent.id, {
        firstName: 'Sophia',
        grade: '3rd Grade'
      });

      await api.loginAsUser(testParent.email);

      const updateData = {
        grade: '4th Grade',
        allergies: ['Peanuts', 'Shellfish'],
        medicalNotes: 'Carries EpiPen'
      };

      const response = await api.patch(`/api/children/${child.id}`, updateData);

      expect(response.status).toBe(200);
      expect(response.body.child.grade).toBe('4th Grade');
      expect(response.body.child.allergies).toContain('Peanuts');
    });

    it('should delete student profile', async () => {
      const child = await testDb.createTestChild(testParent.id, {
        firstName: 'ToDelete'
      });

      await api.loginAsUser(testParent.email);
      
      const deleteResponse = await api.delete(`/api/children/${child.id}`);
      expect(deleteResponse.status).toBe(200);

      const getResponse = await api.get(`/api/children/${child.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should prevent deletion of student with active enrollments', async () => {
      const child = await testDb.createTestChild(testParent.id, {
        firstName: 'WithEnrollment'
      });

      await testDb.createTestEnrollment(child.id, testClass.id, {
        status: 'active'
      });

      await api.loginAsUser(testParent.email);
      
      const response = await api.delete(`/api/children/${child.id}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('active enrollments');
    });
  });

  describe('Emergency Contacts', () => {
    it('should add emergency contact to student profile', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      const emergencyContact = {
        firstName: 'Jane',
        lastName: 'Doe',
        relationship: 'Grandmother',
        phoneNumber: '555-1234',
        email: 'jane.doe@example.com',
        canPickup: true
      };

      const response = await api.post(`/api/children/${child.id}/emergency-contacts`, emergencyContact);

      expect(response.status).toBe(200);
      expect(response.body.contact.firstName).toBe('Jane');
      expect(response.body.contact.relationship).toBe('Grandmother');
      expect(response.body.contact.canPickup).toBe(true);
    });

    it('should retrieve all emergency contacts for student', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      await api.post(`/api/children/${child.id}/emergency-contacts`, {
        firstName: 'Contact1',
        phoneNumber: '555-0001',
        relationship: 'Uncle'
      });

      await api.post(`/api/children/${child.id}/emergency-contacts`, {
        firstName: 'Contact2',
        phoneNumber: '555-0002',
        relationship: 'Aunt'
      });

      const response = await api.get(`/api/children/${child.id}/emergency-contacts`);

      expect(response.status).toBe(200);
      expect(response.body.contacts.length).toBe(2);
    });

    it('should update emergency contact information', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      const createResponse = await api.post(`/api/children/${child.id}/emergency-contacts`, {
        firstName: 'John',
        phoneNumber: '555-1111',
        relationship: 'Uncle'
      });

      const contactId = createResponse.body.contact.id;

      const updateResponse = await api.patch(`/api/emergency-contacts/${contactId}`, {
        phoneNumber: '555-9999',
        canPickup: true
      });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.contact.phoneNumber).toBe('555-9999');
      expect(updateResponse.body.contact.canPickup).toBe(true);
    });

    it('should delete emergency contact', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      const createResponse = await api.post(`/api/children/${child.id}/emergency-contacts`, {
        firstName: 'ToDelete',
        phoneNumber: '555-0000',
        relationship: 'Friend'
      });

      const contactId = createResponse.body.contact.id;

      const deleteResponse = await api.delete(`/api/emergency-contacts/${contactId}`);
      expect(deleteResponse.status).toBe(200);
    });

    it('should validate emergency contact phone number format', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      const response = await api.post(`/api/children/${child.id}/emergency-contacts`, {
        firstName: 'Invalid',
        phoneNumber: 'not-a-phone',
        relationship: 'Friend'
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('phone');
    });
  });

  describe('Medical Information', () => {
    it('should store student allergies and medical conditions', async () => {
      const child = await testDb.createTestChild(testParent.id);

      await api.loginAsUser(testParent.email);

      const medicalData = {
        allergies: ['Peanuts', 'Bee stings'],
        medicalConditions: ['Asthma'],
        medications: ['Albuterol inhaler'],
        medicalNotes: 'Inhaler kept in nurse office'
      };

      const response = await api.patch(`/api/children/${child.id}`, medicalData);

      expect(response.status).toBe(200);
      expect(response.body.child.allergies).toEqual(['Peanuts', 'Bee stings']);
      expect(response.body.child.medicalConditions).toContain('Asthma');
    });

    it('should flag students with severe allergies on roster', async () => {
      const child = await testDb.createTestChild(testParent.id, {
        allergies: ['Peanuts - Severe'],
        hasSevereAllergies: true
      });

      await testDb.createTestEnrollment(child.id, testClass.id);

      await api.loginAsUser(testAdmin.email);
      const response = await api.get(`/api/classes/${testClass.id}/roster`);

      expect(response.status).toBe(200);
      const student = response.body.roster.find((s: any) => s.id === child.id);
      expect(student.hasSevereAllergies).toBe(true);
    });
  });

  describe('Enrollment Management', () => {
    it('should enroll student in class', async () => {
      const child = await testDb.createTestChild(testParent.id);

      const enrollment = await testDb.createTestEnrollment(child.id, testClass.id, {
        status: 'active'
      });

      expect(enrollment).toBeDefined();
      expect(enrollment.childId).toBe(child.id);
      expect(enrollment.classId).toBe(testClass.id);
      expect(enrollment.status).toBe('active');
    });

    it('should retrieve all enrollments for student', async () => {
      const child = await testDb.createTestChild(testParent.id);

      const class1 = await testDb.createTestClass(testSchool.id, { title: 'Class 1' });
      const class2 = await testDb.createTestClass(testSchool.id, { title: 'Class 2' });

      await testDb.createTestEnrollment(child.id, class1.id);
      await testDb.createTestEnrollment(child.id, class2.id);

      await api.loginAsUser(testParent.email);
      const response = await api.get(`/api/children/${child.id}/enrollments`);

      expect(response.status).toBe(200);
      expect(response.body.enrollments.length).toBe(2);
    });

    it('should update enrollment status', async () => {
      const child = await testDb.createTestChild(testParent.id);
      const enrollment = await testDb.createTestEnrollment(child.id, testClass.id, {
        status: 'pending'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.patch(`/api/enrollments/${enrollment.id}`, {
        status: 'active'
      });

      expect(response.status).toBe(200);
      expect(response.body.enrollment.status).toBe('active');
    });

    it('should withdraw student from class', async () => {
      const child = await testDb.createTestChild(testParent.id);
      const enrollment = await testDb.createTestEnrollment(child.id, testClass.id, {
        status: 'active'
      });

      await api.loginAsUser(testParent.email);

      const response = await api.patch(`/api/enrollments/${enrollment.id}`, {
        status: 'withdrawn',
        withdrawalDate: new Date(),
        withdrawalReason: 'Family relocation'
      });

      expect(response.status).toBe(200);
      expect(response.body.enrollment.status).toBe('withdrawn');
      expect(response.body.enrollment.withdrawalReason).toBe('Family relocation');
    });

    it('should prevent duplicate enrollment in same class', async () => {
      const child = await testDb.createTestChild(testParent.id);
      
      await testDb.createTestEnrollment(child.id, testClass.id);

      await expect(async () => {
        await testDb.createTestEnrollment(child.id, testClass.id);
      }).rejects.toThrow();
    });
  });

  describe('Student Rosters', () => {
    beforeEach(async () => {
      // Create multiple students in the test class
      const child1 = await testDb.createTestChild(testParent.id, {
        firstName: 'Alice',
        lastName: 'Anderson'
      });
      const child2 = await testDb.createTestChild(testParent.id, {
        firstName: 'Bob',
        lastName: 'Brown'
      });
      const child3 = await testDb.createTestChild(testParent.id, {
        firstName: 'Charlie',
        lastName: 'Clark'
      });

      await testDb.createTestEnrollment(child1.id, testClass.id, { status: 'active' });
      await testDb.createTestEnrollment(child2.id, testClass.id, { status: 'active' });
      await testDb.createTestEnrollment(child3.id, testClass.id, { status: 'pending' });
    });

    it('should display class roster with all enrolled students', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/classes/${testClass.id}/roster`);

      expect(response.status).toBe(200);
      expect(response.body.roster.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter roster by enrollment status', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/classes/${testClass.id}/roster`, {
        status: 'active'
      });

      expect(response.status).toBe(200);
      expect(response.body.roster.every((s: any) => s.enrollmentStatus === 'active')).toBe(true);
    });

    it('should sort roster alphabetically by last name', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/classes/${testClass.id}/roster`, {
        sortBy: 'lastName'
      });

      expect(response.status).toBe(200);
      const lastNames = response.body.roster.map((s: any) => s.lastName);
      
      for (let i = 1; i < lastNames.length; i++) {
        expect(lastNames[i].localeCompare(lastNames[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should export roster to CSV', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/classes/${testClass.id}/roster/export`, {
        format: 'csv'
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.body).toContain('First Name,Last Name');
    });

    it('should show parent contact information on roster', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/classes/${testClass.id}/roster`, {
        includeParentInfo: true
      });

      expect(response.status).toBe(200);
      expect(response.body.roster[0]).toHaveProperty('parentName');
      expect(response.body.roster[0]).toHaveProperty('parentEmail');
    });
  });

  describe('Filtering Students', () => {
    beforeEach(async () => {
      const location2 = await testDb.createTestLocation(testSchool.id, {
        name: 'Location 2'
      });

      const class1 = await testDb.createTestClass(testSchool.id, {
        title: 'Math Class',
        locationId: testLocation.id
      });

      const class2 = await testDb.createTestClass(testSchool.id, {
        title: 'Science Class',
        locationId: location2.id
      });

      const child1 = await testDb.createTestChild(testParent.id, { firstName: 'Student1' });
      const child2 = await testDb.createTestChild(testParent.id, { firstName: 'Student2' });

      await testDb.createTestEnrollment(child1.id, class1.id, { status: 'active' });
      await testDb.createTestEnrollment(child2.id, class2.id, { status: 'active' });
    });

    it('should filter students by location', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/students`, {
        locationId: testLocation.id
      });

      expect(response.status).toBe(200);
      expect(response.body.students.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter students by enrollment status', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/students`, {
        enrollmentStatus: 'active'
      });

      expect(response.status).toBe(200);
      expect(response.body.students.every((s: any) => 
        s.enrollments.some((e: any) => e.status === 'active')
      )).toBe(true);
    });

    it('should search students by name', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/students`, {
        search: 'Student1'
      });

      expect(response.status).toBe(200);
      expect(response.body.students.some((s: any) => s.firstName === 'Student1')).toBe(true);
    });

    it('should filter students by age range', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/students`, {
        minAge: 8,
        maxAge: 12
      });

      expect(response.status).toBe(200);
      // Verify ages fall within range
      response.body.students.forEach((student: any) => {
        const age = new Date().getFullYear() - new Date(student.dateOfBirth).getFullYear();
        expect(age).toBeGreaterThanOrEqual(8);
        expect(age).toBeLessThanOrEqual(12);
      });
    });
  });

  describe('Parent Access Control', () => {
    it('should allow parent to view only their own children', async () => {
      const otherParent = await testDb.createTestUser({ role: 'parent', email: 'other@test.com' });
      const otherChild = await testDb.createTestChild(otherParent.id);

      await api.loginAsUser(testParent.email);

      const myChildrenResponse = await api.get('/api/children');
      expect(myChildrenResponse.status).toBe(200);
      
      const childIds = myChildrenResponse.body.children.map((c: any) => c.id);
      expect(childIds).not.toContain(otherChild.id);
    });

    it('should prevent parent from editing other parents children', async () => {
      const otherParent = await testDb.createTestUser({ role: 'parent', email: 'other@test.com' });
      const otherChild = await testDb.createTestChild(otherParent.id);

      await api.loginAsUser(testParent.email);

      const response = await api.patch(`/api/children/${otherChild.id}`, {
        firstName: 'Hacked'
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Multi-Child Family Management', () => {
    it('should handle family with multiple children efficiently', async () => {
      const children = [];
      
      for (let i = 0; i < 5; i++) {
        const child = await testDb.createTestChild(testParent.id, {
          firstName: `Child${i + 1}`
        });
        children.push(child);
      }

      await api.loginAsUser(testParent.email);
      const response = await api.get('/api/children');

      expect(response.status).toBe(200);
      expect(response.body.children.length).toBeGreaterThanOrEqual(5);
    });

    it('should show family summary with all children and enrollments', async () => {
      const child1 = await testDb.createTestChild(testParent.id, { firstName: 'Child1' });
      const child2 = await testDb.createTestChild(testParent.id, { firstName: 'Child2' });

      const class1 = await testDb.createTestClass(testSchool.id, { title: 'Class1' });
      const class2 = await testDb.createTestClass(testSchool.id, { title: 'Class2' });

      await testDb.createTestEnrollment(child1.id, class1.id);
      await testDb.createTestEnrollment(child2.id, class2.id);

      await api.loginAsUser(testParent.email);
      const response = await api.get('/api/family/summary');

      expect(response.status).toBe(200);
      expect(response.body.children.length).toBe(2);
      expect(response.body.totalEnrollments).toBe(2);
    });
  });
});
