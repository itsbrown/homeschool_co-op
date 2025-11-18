import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks, mockBrevoService } from '../../helpers/mockServices';
import type { User } from '../../../../shared/schema';

// Mock the email service module
jest.mock('../../../lib/email-service');

// Import the mocked function
import { sendWelcomeEmail } from '../../../lib/email-service';
const mockSendWelcomeEmail = sendWelcomeEmail as jest.MockedFunction<typeof sendWelcomeEmail>;

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for School Admin Email Management
 * 
 * Test Coverage:
 * - Resend welcome email endpoint
 * - Authentication and authorization
 * - Input validation (mutual exclusivity)
 * - User lookup (email and userId)
 * - Email service integration
 * - Error handling
 */

describe('Integration: School Admin Email Management', () => {
  let schoolAdmin: User;
  let school: any;
  let parentUser: User;

  beforeAll(async () => {
    // Initial setup
    await api.init();
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    // Reset mocks and clean database before each test
    resetAllMocks();
    await testDb.cleanup();

    // Create test school admin
    schoolAdmin = await testDb.createTestUser({
      email: 'schooladmin@test.com',
      firstName: 'Test',
      lastName: 'Admin',
      role: 'schoolAdmin',
    });

    // Create test school
    school = await testDb.createTestSchool(schoolAdmin.id, {
      name: 'Test School',
      registrationCode: 'TESTSCHOOL',
    });

    // Update school admin with school ID
    await testDb.updateUserSchoolId(schoolAdmin.id, school.id);

    // Create test parent user
    parentUser = await testDb.createTestUser({
      email: 'parent@test.com',
      firstName: 'Test',
      lastName: 'Parent',
      role: 'parent',
      schoolId: school.id,
    });

    // Authenticate as school admin
    await api.loginAsUser(schoolAdmin.email);

    // Reset and configure email service mock
    mockSendWelcomeEmail.mockClear();
    mockSendWelcomeEmail.mockResolvedValue(true);
  });

  describe('POST /api/school-admin/resend-welcome-email', () => {
    describe('Authentication & Authorization', () => {
      it('should return 401 when no auth token provided', async () => {
        api.clearAuth();
        
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: 'parent@test.com'
        });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });

      it('should allow authenticated school admin to access endpoint', async () => {
        // This test verifies that properly authenticated users can access the endpoint
        // The actual functionality is tested in later test cases
        
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: parentUser.email
        });

        // Should not return 401 (may return other errors like 500 if email service fails)
        expect(response.status).not.toBe(401);
      });
    });

    describe('Input Validation', () => {
      it('should return 400 when neither email nor userId provided', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {});

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('Either email or userId is required')
        });
      });

      it('should return 400 when both email and userId provided (mutual exclusivity)', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: 'parent@test.com',
          userId: parentUser.id
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('either email or userId, not both')
        });
      });
    });

    describe('User Lookup', () => {
      it('should return 404 when user not found by email', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: 'nonexistent@test.com'
        });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          success: false,
          message: 'User not found'
        });
      });

      it('should return 404 when user not found by userId', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          userId: 99999
        });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          success: false,
          message: 'User not found'
        });
      });

      it('should return 400 when user has no email (data integrity check)', async () => {
        // Create a user without email (edge case)
        const userNoEmail = await testDb.createTestUser({
          firstName: 'NoEmail',
          lastName: 'User',
          role: 'parent',
        });

        // Manually corrupt the user record (remove email)
        await testDb.updateUser(userNoEmail.id, { email: null as any });

        const response = await api.post('/api/school-admin/resend-welcome-email', {
          userId: userNoEmail.id
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('missing required data')
        });
      });

      it('should return 400 when user has no firstName (data integrity check)', async () => {
        // Create a user without firstName (edge case)
        const userNoName = await testDb.createTestUser({
          email: 'noname@test.com',
          role: 'parent',
        });

        // Manually corrupt the user record (remove firstName)
        await testDb.updateUser(userNoName.id, { firstName: null as any });

        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: 'noname@test.com'
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('missing required data')
        });
      });
    });

    describe('Email Sending', () => {
      it('should successfully resend welcome email using email parameter', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: parentUser.email
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          message: expect.stringContaining(`Welcome email sent to ${parentUser.email}`),
          user: {
            email: parentUser.email,
            firstName: parentUser.firstName,
            lastName: parentUser.lastName
          }
        });

        // Verify sendWelcomeEmail was called
        expect(mockSendWelcomeEmail).toHaveBeenCalled();
      });

      it('should successfully resend welcome email using userId parameter', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          userId: parentUser.id
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          message: expect.stringContaining(`Welcome email sent to ${parentUser.email}`),
          user: {
            email: parentUser.email,
            firstName: parentUser.firstName,
            lastName: parentUser.lastName
          }
        });

        // Verify sendWelcomeEmail was called
        expect(mockSendWelcomeEmail).toHaveBeenCalled();
      });

      it('should handle email service failure gracefully', async () => {
        // Mock sendWelcomeEmail to fail
        mockSendWelcomeEmail.mockRejectedValueOnce(
          new Error('Email service unavailable')
        );

        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: parentUser.email
        });

        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('Failed to send welcome email')
        });
      });

      it('should handle sendWelcomeEmail returning false', async () => {
        // Mock sendWelcomeEmail to return false (email not sent)
        mockSendWelcomeEmail.mockResolvedValueOnce(false);

        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: parentUser.email
        });

        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('Failed to send welcome email')
        });
      });

      it('should work for all user roles', async () => {
        const roles = ['parent', 'teacher', 'schoolAdmin', 'admin', 'superAdmin'] as const;

        for (const role of roles) {
          const user = await testDb.createTestUser({
            email: `${role}@test.com`,
            firstName: 'Test',
            lastName: role,
            role: role,
            schoolId: school.id,
          });

          const response = await api.post('/api/school-admin/resend-welcome-email', {
            email: user.email
          });

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(mockSendWelcomeEmail).toHaveBeenCalled();

          // Reset mock for next iteration
          mockSendWelcomeEmail.mockClear();
        }
      });

      it('should include correct user data in email payload', async () => {
        await api.post('/api/school-admin/resend-welcome-email', {
          email: parentUser.email
        });

        // Verify sendWelcomeEmail was called with correct parameters
        expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: parentUser.email,
            firstName: parentUser.firstName,
            lastName: parentUser.lastName,
            role: parentUser.role
          })
        );
      });
    });

    describe('Edge Cases', () => {
      it('should handle userId as 0 (edge case for truthy check)', async () => {
        // This test ensures userId: 0 doesn't bypass validation
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          userId: 0
        });

        // Should attempt lookup and return 404 (no user with id 0)
        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should handle empty string email (edge case)', async () => {
        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: ''
        });

        // Empty string is falsy, should trigger "either email or userId required"
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          message: expect.stringContaining('Either email or userId is required')
        });
      });

      it('should handle user with no lastName (optional field)', async () => {
        const userNoLastName = await testDb.createTestUser({
          email: 'nolastname@test.com',
          firstName: 'NoLastName',
          lastName: '', // Empty string
          role: 'parent',
          schoolId: school.id,
        });

        const response = await api.post('/api/school-admin/resend-welcome-email', {
          email: userNoLastName.email
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.user.lastName).toBe('');
      });
    });
  });
});
