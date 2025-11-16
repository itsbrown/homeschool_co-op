import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for User Management
 * 
 * Test Coverage:
 * - User account creation (all roles)
 * - Multi-role user handling
 * - Role selection interface
 * - Role switching mechanics
 * - Dashboard routing per role
 * - Profile editing
 * - Authentication flows (Auth0 + Supabase)
 */

describe('Integration: User Management', () => {
  beforeAll(async () => {
    // Initial cleanup
    await testDb.cleanup();
  });

  afterAll(async () => {
    // Final cleanup
    await testDb.cleanup();
  });

  beforeEach(async () => {
    // Reset all mock services before each test
    resetAllMocks();
    // Clear storage to ensure test isolation
    await testDb.cleanup();
  });

  describe('User Account Creation', () => {
    it('should create parent user account with all required fields', async () => {
      const userData = {
        username: 'parent_test',
        email: 'parent@test.com',
        password: 'hashedPassword123',
        name: 'Test Parent',
        role: 'parent' as const
      };

      const user = await testDb.createTestUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe('parent');
      expect(user.isActive).toBe(true);
    });

    it('should create educator user account', async () => {
      const user = await testDb.createTestUser({
        username: 'educator_test',
        email: 'educator@test.com',
        role: 'teacher',
        name: 'Test Educator'
      });

      expect(user.role).toBe('teacher');
      expect(user.id).toBeDefined();
    });

    it('should create school admin account', async () => {
      const user = await testDb.createTestUser({
        username: 'schooladmin_test',
        email: 'schooladmin@test.com',
        role: 'schoolAdmin',
        name: 'Test School Admin'
      });

      expect(user.role).toBe('schoolAdmin');
      expect(user.id).toBeDefined();
    });

    it('should create super admin account', async () => {
      const user = await testDb.createTestUser({
        username: 'superadmin_test',
        email: 'superadmin@test.com',
        role: 'superAdmin',
        name: 'Test Super Admin'
      });

      expect(user.role).toBe('superAdmin');
      expect(user.id).toBeDefined();
    });

    it('should enforce unique email constraint', async () => {
      const email = 'duplicate@test.com';
      
      await testDb.createTestUser({
        email,
        username: 'user1',
        name: 'User 1'
      });

      // Attempting to create another user with same email should fail
      await expect(async () => {
        await testDb.createTestUser({
          email,
          username: 'user2',
          name: 'User 2'
        });
      }).rejects.toThrow();
    });
  });

  describe('Multi-Role User Management', () => {
    it('should handle user with multiple roles', async () => {
      const user = await testDb.createTestUser({
        email: 'multirole@test.com',
        role: 'parent',
        permissions: {
          additionalRoles: ['educator', 'admin']
        }
      });

      expect(user.permissions).toHaveProperty('additionalRoles');
      expect(user.permissions.additionalRoles).toContain('educator');
      expect(user.permissions.additionalRoles).toContain('admin');
    });

    it('should display role selection for multi-role users on dashboard access', async () => {
      const user = await testDb.createTestUser({
        email: 'multirole@test.com',
        role: 'parent',
        permissions: {
          additionalRoles: ['educator']
        }
      });

      await api.loginAsUser(user.email);
      const response = await api.get('/dashboard');

      // Should indicate role selection is needed
      expect(response.body).toHaveProperty('showRoleSelection', true);
      expect(response.body.availableRoles).toContain('parent');
      expect(response.body.availableRoles).toContain('educator');
    });

    it('should allow role switching for multi-role users', async () => {
      const user = await testDb.createTestUser({
        email: 'multirole@test.com',
        role: 'parent',
        permissions: {
          additionalRoles: ['educator']
        }
      });

      await api.loginAsUser(user.email);

      // Initially select parent role
      await api.post('/api/user/select-role', { role: 'parent' });
      let response = await api.get('/api/user/current-role');
      expect(response.body.activeRole).toBe('parent');

      // Switch to educator role
      await api.post('/api/user/select-role', { role: 'educator' });
      response = await api.get('/api/user/current-role');
      expect(response.body.activeRole).toBe('educator');
    });
  });

  describe('Dashboard Routing by Role', () => {
    it('should route parent users to ParentDashboard', async () => {
      const user = await testDb.createTestUser({
        email: 'parent@test.com',
        role: 'parent'
      });

      await api.loginAsUser(user.email);
      await api.post('/api/user/select-role', { role: 'parent' });

      const response = await api.get('/dashboard');

      expect(response.body.dashboardType).toBe('parent');
      expect(response.body).toHaveProperty('children');
      expect(response.body).toHaveProperty('enrollments');
    });

    it('should route educators to EducatorDashboard with AI tools', async () => {
      const user = await testDb.createTestUser({
        email: 'educator@test.com',
        role: 'teacher'
      });

      await api.loginAsUser(user.email);
      await api.post('/api/user/select-role', { role: 'teacher' });

      const response = await api.get('/dashboard');

      expect(response.body.dashboardType).toBe('educator');
      expect(response.body).toHaveProperty('classes');
      expect(response.body).toHaveProperty('students');
      expect(response.body).toHaveProperty('aiToolsAvailable', true);
    });

    it('should route school admins to MySchoolPage', async () => {
      const admin = await testDb.createTestUser({
        email: 'schooladmin@test.com',
        role: 'schoolAdmin'
      });

      const school = await testDb.createTestSchool(admin.id);

      await api.loginAsUser(admin.email);
      await api.post('/api/user/select-role', { role: 'schoolAdmin' });

      const response = await api.get('/dashboard');

      expect(response.body.dashboardType).toBe('schoolAdmin');
      expect(response.body).toHaveProperty('school');
      expect(response.body.school.id).toBe(school.id);
    });

    it('should route super admins to platform management dashboard', async () => {
      const superAdmin = await testDb.createTestUser({
        email: 'superadmin@test.com',
        role: 'superAdmin'
      });

      await api.loginAsUser(superAdmin.email);

      const response = await api.get('/dashboard');

      expect(response.body.dashboardType).toBe('superAdmin');
      expect(response.body).toHaveProperty('allSchools');
      expect(response.body).toHaveProperty('platformMetrics');
    });
  });

  describe('User Profile Management', () => {
    it('should allow user to update profile information', async () => {
      const user = await testDb.createTestUser({
        email: 'user@test.com',
        name: 'Original Name'
      });

      await api.loginAsUser(user.email);

      const updateData = {
        name: 'Updated Name',
        phone: '555-1234',
        firstName: 'John',
        lastName: 'Doe'
      };

      const response = await api.patch(`/api/users/${user.id}/profile`, updateData);

      expect(response.status).toBe(200);
      expect(response.body.user.name).toBe('Updated Name');
      expect(response.body.user.phone).toBe('555-1234');
    });

    it('should update emergency contact information', async () => {
      const user = await testDb.createTestUser({
        email: 'user@test.com'
      });

      await api.loginAsUser(user.email);

      const emergencyContact = {
        emergencyContactFirstName: 'Jane',
        emergencyContactLastName: 'Smith',
        emergencyContactPhone: '555-9999',
        emergencyContactRelationship: 'Spouse'
      };

      const response = await api.patch(`/api/users/${user.id}/profile`, emergencyContact);

      expect(response.status).toBe(200);
      expect(response.body.user.emergencyContactFirstName).toBe('Jane');
      expect(response.body.user.emergencyContactPhone).toBe('555-9999');
    });
  });

  describe('Authentication Flows', () => {
    it('should handle Auth0 user login', async () => {
      const user = await testDb.createTestUser({
        email: 'auth0user@test.com',
        auth0Id: 'auth0|123456'
      });

      const response = await api.loginAsUser(user.email);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.auth0Id).toBe('auth0|123456');
      expect(response.body.user.email).toBe('auth0user@test.com');
    });

    it('should handle Supabase user login', async () => {
      const user = await testDb.createTestUser({
        email: 'supabaseuser@test.com',
        supabaseId: 'supabase-uuid-123'
      });

      const response = await api.loginAsUser(user.email);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.supabaseId).toBe('supabase-uuid-123');
      expect(response.body.user.email).toBe('supabaseuser@test.com');
    });

    it('should prevent login for inactive users', async () => {
      const user = await testDb.createTestUser({
        email: 'inactive@test.com',
        isActive: false
      });

      const response = await api.loginAsUser(user.email);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('inactive');
    });
  });

  describe('Complete User Environment Setup', () => {
    it('should setup complete test environment with all user types', async () => {
      const environment = await testDb.setupTestEnvironment();

      // Verify admin
      expect(environment.admin).toBeDefined();
      expect(environment.admin.role).toBe('schoolAdmin');

      // Verify school
      expect(environment.school).toBeDefined();
      expect(environment.school.adminId).toBe(environment.admin.id);

      // Verify locations
      expect(environment.locations).toHaveLength(2);
      expect(environment.locations[0].name).toBe('Main Campus');
      expect(environment.locations[1].name).toBe('East Campus');

      // Verify categories
      expect(environment.categories).toHaveLength(2);
      expect(environment.categories[0].name).toBe('Mathematics');
      expect(environment.categories[1].name).toBe('Science');

      // Verify parent
      expect(environment.parent).toBeDefined();
      expect(environment.parent.role).toBe('parent');

      // Verify children
      expect(environment.children).toHaveLength(2);
      expect(environment.children[0].firstName).toBe('Alice');
      expect(environment.children[1].firstName).toBe('Bob');

      // Verify educator
      expect(environment.educator).toBeDefined();
      expect(environment.educator.role).toBe('teacher');
    });
  });
});
