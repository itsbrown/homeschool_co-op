import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks, mockBrevoService } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for Staff Management
 * 
 * Test Coverage:
 * - Staff profile CRUD operations
 * - Email invitations
 * - Class assignments
 * - Multi-location staff assignments
 * - Staff permission management
 * - Position customization
 */

describe('Integration: Staff Management', () => {
  let testSchool: any;
  let testAdmin: any;
  let testLocation1: any;
  let testLocation2: any;

  beforeAll(async () => {
    await testDb.cleanup();
    
    const env = await testDb.setupTestEnvironment();
    testSchool = env.school;
    testAdmin = env.admin;
    testLocation1 = env.locations[0];
    testLocation2 = env.locations[1];
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Staff Profile Management', () => {
    it('should create staff member profile', async () => {
      const staffData = {
        userId: testAdmin.id,
        schoolId: testSchool.id,
        position: 'Teacher',
        department: 'Mathematics',
        bio: 'Experienced math teacher with 10 years of experience',
        startDate: new Date('2025-01-01')
      };

      await api.loginAsUser(testAdmin.email);
      const response = await api.post('/api/staff', staffData);

      expect(response.status).toBe(200);
      expect(response.body.staff.position).toBe('Teacher');
      expect(response.body.staff.department).toBe('Mathematics');
    });

    it('should retrieve staff member profile', async () => {
      const educator = await testDb.createTestUser({ 
        role: 'teacher',
        name: 'Test Educator'
      });

      const staffData = {
        userId: educator.id,
        schoolId: testSchool.id,
        position: 'Lead Teacher'
      };

      await api.loginAsUser(testAdmin.email);
      const createResponse = await api.post('/api/staff', staffData);
      const staffId = createResponse.body.staff.id;

      const getResponse = await api.get(`/api/staff/${staffId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.staff.userId).toBe(educator.id);
      expect(getResponse.body.staff.position).toBe('Lead Teacher');
    });

    it('should update staff profile information', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      const staffData = {
        userId: educator.id,
        schoolId: testSchool.id,
        position: 'Teacher'
      };

      await api.loginAsUser(testAdmin.email);
      const createResponse = await api.post('/api/staff', staffData);
      const staffId = createResponse.body.staff.id;

      const updateData = {
        position: 'Senior Teacher',
        department: 'Science',
        bio: 'Updated bio information'
      };

      const updateResponse = await api.patch(`/api/staff/${staffId}`, updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.staff.position).toBe('Senior Teacher');
      expect(updateResponse.body.staff.department).toBe('Science');
    });

    it('should deactivate staff member', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      const staffData = {
        userId: educator.id,
        schoolId: testSchool.id,
        position: 'Teacher'
      };

      await api.loginAsUser(testAdmin.email);
      const createResponse = await api.post('/api/staff', staffData);
      const staffId = createResponse.body.staff.id;

      const deactivateResponse = await api.patch(`/api/staff/${staffId}`, {
        isActive: false,
        endDate: new Date()
      });

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.staff.isActive).toBe(false);
      expect(deactivateResponse.body.staff.endDate).toBeDefined();
    });
  });

  describe('Staff Invitations', () => {
    it('should send email invitation to new staff member', async () => {
      await api.loginAsUser(testAdmin.email);

      const invitationData = {
        email: 'newteacher@example.com',
        firstName: 'New',
        lastName: 'Teacher',
        position: 'Math Teacher',
        role: 'teacher'
      };

      const response = await api.post('/api/staff/invite', invitationData);

      expect(response.status).toBe(200);
      expect(response.body.invitation).toBeDefined();
      expect(response.body.invitation.email).toBe('newteacher@example.com');
      
      // Verify email was sent
      expect(mockBrevoService.sendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'newteacher@example.com' }]
        })
      );
    });

    it('should generate unique invitation token', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/staff/invite', {
        email: 'teacher2@example.com',
        position: 'Science Teacher',
        role: 'teacher'
      });

      expect(response.status).toBe(200);
      expect(response.body.invitation.token).toBeDefined();
      expect(response.body.invitation.token.length).toBeGreaterThan(20);
    });

    it('should allow staff to accept invitation and create account', async () => {
      await api.loginAsUser(testAdmin.email);

      const inviteResponse = await api.post('/api/staff/invite', {
        email: 'acceptedteacher@example.com',
        position: 'Art Teacher',
        role: 'teacher'
      });

      const token = inviteResponse.body.invitation.token;

      // Accept invitation
      const acceptResponse = await api.post('/api/staff/accept-invitation', {
        token,
        password: 'securePassword123',
        firstName: 'Accepted',
        lastName: 'Teacher'
      });

      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.body.user).toBeDefined();
      expect(acceptResponse.body.user.email).toBe('acceptedteacher@example.com');
      expect(acceptResponse.body.user.role).toBe('teacher');
    });

    it('should expire invitation after 7 days', async () => {
      await api.loginAsUser(testAdmin.email);

      const inviteResponse = await api.post('/api/staff/invite', {
        email: 'expiredteacher@example.com',
        position: 'PE Teacher',
        role: 'teacher'
      });

      const token = inviteResponse.body.invitation.token;

      // Simulate 8 days passing
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() + 8);

      // Mock the current date
      jest.useFakeTimers();
      jest.setSystemTime(expiredDate);

      const acceptResponse = await api.post('/api/staff/accept-invitation', {
        token,
        password: 'password123'
      });

      expect(acceptResponse.status).toBe(400);
      expect(acceptResponse.body.error).toContain('expired');

      jest.useRealTimers();
    });

    it('should resend invitation if not accepted', async () => {
      await api.loginAsUser(testAdmin.email);

      const inviteResponse = await api.post('/api/staff/invite', {
        email: 'resendteacher@example.com',
        position: 'Music Teacher',
        role: 'teacher'
      });

      const invitationId = inviteResponse.body.invitation.id;

      mockBrevoService.sendTransacEmail.mockClear();

      const resendResponse = await api.post(`/api/staff/invitations/${invitationId}/resend`);

      expect(resendResponse.status).toBe(200);
      expect(mockBrevoService.sendTransacEmail).toHaveBeenCalled();
    });

    it('should prevent duplicate invitations to same email', async () => {
      await api.loginAsUser(testAdmin.email);

      await api.post('/api/staff/invite', {
        email: 'duplicate@example.com',
        position: 'Teacher',
        role: 'teacher'
      });

      const duplicateResponse = await api.post('/api/staff/invite', {
        email: 'duplicate@example.com',
        position: 'Another Teacher',
        role: 'teacher'
      });

      expect(duplicateResponse.status).toBe(400);
      expect(duplicateResponse.body.error).toContain('already invited');
    });
  });

  describe('Class Assignments', () => {
    it('should assign staff member to class', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Math 101'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post(`/api/classes/${classRecord.id}/assign-staff`, {
        staffId: educator.id,
        role: 'instructor'
      });

      expect(response.status).toBe(200);
      expect(response.body.assignment).toBeDefined();
      expect(response.body.assignment.classId).toBe(classRecord.id);
      expect(response.body.assignment.staffId).toBe(educator.id);
    });

    it('should retrieve all classes assigned to staff member', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });
      
      const class1 = await testDb.createTestClass(testSchool.id, {
        title: 'Math 101',
        instructorId: educator.id
      });

      const class2 = await testDb.createTestClass(testSchool.id, {
        title: 'Math 201',
        instructorId: educator.id
      });

      await api.loginAsUser(educator.email);

      const response = await api.get(`/api/staff/${educator.id}/classes`);

      expect(response.status).toBe(200);
      expect(response.body.classes.length).toBe(2);
      expect(response.body.classes.map((c: any) => c.title)).toContain('Math 101');
      expect(response.body.classes.map((c: any) => c.title)).toContain('Math 201');
    });

    it('should allow multiple staff assignments to single class', async () => {
      const instructor = await testDb.createTestUser({ role: 'teacher', name: 'Main Instructor' });
      const assistant = await testDb.createTestUser({ role: 'teacher', name: 'Teaching Assistant' });
      
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Science Lab'
      });

      await api.loginAsUser(testAdmin.email);

      await api.post(`/api/classes/${classRecord.id}/assign-staff`, {
        staffId: instructor.id,
        role: 'instructor'
      });

      await api.post(`/api/classes/${classRecord.id}/assign-staff`, {
        staffId: assistant.id,
        role: 'assistant'
      });

      const response = await api.get(`/api/classes/${classRecord.id}/staff`);

      expect(response.status).toBe(200);
      expect(response.body.staff.length).toBe(2);
    });

    it('should remove staff assignment from class', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'History 101',
        instructorId: educator.id
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.delete(`/api/classes/${classRecord.id}/staff/${educator.id}`);

      expect(response.status).toBe(200);

      const getResponse = await api.get(`/api/classes/${classRecord.id}/staff`);
      expect(getResponse.body.staff.length).toBe(0);
    });
  });

  describe('Multi-Location Staff Assignments', () => {
    it('should assign staff to multiple locations', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post(`/api/staff/${educator.id}/locations`, {
        locationIds: [testLocation1.id, testLocation2.id]
      });

      expect(response.status).toBe(200);
      expect(response.body.assignments.length).toBe(2);
    });

    it('should filter staff by location', async () => {
      const educator1 = await testDb.createTestUser({ role: 'teacher', name: 'Teacher 1' });
      const educator2 = await testDb.createTestUser({ role: 'teacher', name: 'Teacher 2' });

      await api.loginAsUser(testAdmin.email);

      await api.post(`/api/staff/${educator1.id}/locations`, {
        locationIds: [testLocation1.id]
      });

      await api.post(`/api/staff/${educator2.id}/locations`, {
        locationIds: [testLocation2.id]
      });

      const response = await api.get('/api/staff', {
        locationId: testLocation1.id
      });

      expect(response.status).toBe(200);
      expect(response.body.staff.some((s: any) => s.userId === educator1.id)).toBe(true);
      expect(response.body.staff.some((s: any) => s.userId === educator2.id)).toBe(false);
    });

    it('should show all locations for staff with multiple assignments', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      await api.loginAsUser(testAdmin.email);

      await api.post(`/api/staff/${educator.id}/locations`, {
        locationIds: [testLocation1.id, testLocation2.id]
      });

      const response = await api.get(`/api/staff/${educator.id}`);

      expect(response.status).toBe(200);
      expect(response.body.staff.locations.length).toBe(2);
      expect(response.body.staff.locations.map((l: any) => l.id)).toContain(testLocation1.id);
      expect(response.body.staff.locations.map((l: any) => l.id)).toContain(testLocation2.id);
    });
  });

  describe('Staff Permission Management', () => {
    it('should set granular permissions for staff member', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      await api.loginAsUser(testAdmin.email);

      const permissions = {
        canCreateClasses: true,
        canManageEnrollments: true,
        canViewReports: true,
        canManageStudents: false,
        canEditSchoolSettings: false
      };

      const response = await api.patch(`/api/staff/${educator.id}/permissions`, {
        permissions
      });

      expect(response.status).toBe(200);
      expect(response.body.staff.permissions.canCreateClasses).toBe(true);
      expect(response.body.staff.permissions.canManageStudents).toBe(false);
    });

    it('should enforce permissions when staff attempts actions', async () => {
      const educator = await testDb.createTestUser({ role: 'teacher' });

      await api.loginAsUser(testAdmin.email);

      await api.patch(`/api/staff/${educator.id}/permissions`, {
        permissions: { canCreateClasses: false }
      });

      await api.loginAsUser(educator.email);

      const response = await api.post('/api/classes', {
        schoolId: testSchool.id,
        title: 'New Class',
        price: 5000
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('permission');
    });
  });

  describe('Staff Position Customization', () => {
    it('should create custom staff positions for school', async () => {
      await api.loginAsUser(testAdmin.email);

      const positions = [
        'Lead Teacher',
        'Teaching Assistant',
        'Curriculum Coordinator',
        'Program Director'
      ];

      const response = await api.post(`/api/schools/${testSchool.id}/positions`, {
        positions
      });

      expect(response.status).toBe(200);
      expect(response.body.positions.length).toBe(4);
    });

    it('should use custom positions when creating staff', async () => {
      await api.loginAsUser(testAdmin.email);

      await api.post(`/api/schools/${testSchool.id}/positions`, {
        positions: ['Curriculum Coordinator']
      });

      const educator = await testDb.createTestUser({ role: 'teacher' });

      const staffData = {
        userId: educator.id,
        schoolId: testSchool.id,
        position: 'Curriculum Coordinator'
      };

      const response = await api.post('/api/staff', staffData);

      expect(response.status).toBe(200);
      expect(response.body.staff.position).toBe('Curriculum Coordinator');
    });
  });

  describe('Staff Directory and Listing', () => {
    it('should list all staff members for school', async () => {
      const educator1 = await testDb.createTestUser({ role: 'teacher', name: 'Teacher A' });
      const educator2 = await testDb.createTestUser({ role: 'teacher', name: 'Teacher B' });

      await api.loginAsUser(testAdmin.email);

      await api.post('/api/staff', {
        userId: educator1.id,
        schoolId: testSchool.id,
        position: 'Math Teacher'
      });

      await api.post('/api/staff', {
        userId: educator2.id,
        schoolId: testSchool.id,
        position: 'Science Teacher'
      });

      const response = await api.get(`/api/schools/${testSchool.id}/staff`);

      expect(response.status).toBe(200);
      expect(response.body.staff.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter staff by position', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/staff`, {
        position: 'Math Teacher'
      });

      expect(response.status).toBe(200);
      expect(response.body.staff.every((s: any) => s.position === 'Math Teacher')).toBe(true);
    });

    it('should search staff by name', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.get(`/api/schools/${testSchool.id}/staff`, {
        search: 'Teacher A'
      });

      expect(response.status).toBe(200);
      expect(response.body.staff.some((s: any) => s.user.name.includes('Teacher A'))).toBe(true);
    });
  });
});
