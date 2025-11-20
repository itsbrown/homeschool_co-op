/**
 * Integration Tests: Phase 2 - Multi-Role Management APIs
 * Tests user role management, role switching, and admin role assignment
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { getDb } from '../../../db.js';
import { users, userRoles } from '../../../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

let app: any;
let db: any;

// Test user credentials
const testUsers = {
  globalAdmin: {
    email: 'global-admin@test.com',
    password: 'testpass123',
    name: 'Global Admin',
    role: 'admin' as const,
    schoolId: 1
  },
  schoolAdmin: {
    email: 'school-admin@test.com',
    password: 'testpass123',
    name: 'School Admin',
    role: 'schoolAdmin' as const,
    schoolId: 1
  },
  multiRoleUser: {
    email: 'multi-role@test.com',
    password: 'testpass123',
    name: 'Multi Role User',
    role: 'parent' as const,
    schoolId: 1
  },
  singleRoleUser: {
    email: 'single-role@test.com',
    password: 'testpass123',
    name: 'Single Role User',
    role: 'parent' as const,
    schoolId: 1
  }
};

let userIds: Record<string, number> = {};
let authTokens: Record<string, string> = {};

beforeAll(async () => {
  // Lazy-load app to avoid initialization issues
  const appModule = await import('../../../index.js');
  app = appModule.default || appModule.app;
  db = await getDb();

  // Create test users
  for (const [key, userData] of Object.entries(testUsers)) {
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);

    if (existingUsers.length > 0) {
      userIds[key] = existingUsers[0].id;
    } else {
      const newUser = await db
        .insert(users)
        .values({
          username: userData.email.split('@')[0],
          email: userData.email,
          password: 'hashed_' + userData.password,
          name: userData.name,
          role: userData.role,
          schoolId: userData.schoolId
        })
        .returning();
      userIds[key] = newUser[0].id;

      // Create user_roles entry
      await db
        .insert(userRoles)
        .values({
          userId: newUser[0].id,
          role: userData.role,
          schoolId: userData.schoolId,
          isPrimary: true
        })
        .onConflictDoNothing();
    }
  }

  // Add additional roles for multi-role user
  await db
    .insert(userRoles)
    .values([
      {
        userId: userIds.multiRoleUser,
        role: 'educator',
        schoolId: 1,
        isPrimary: false
      },
      {
        userId: userIds.multiRoleUser,
        role: 'educator',
        schoolId: 2,
        isPrimary: false
      }
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  // Cleanup test data
  for (const userId of Object.values(userIds)) {
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe('Phase 2: Multi-Role Management APIs', () => {
  
  describe('GET /api/user/roles - View User Roles', () => {
    it('should return all roles for a multi-role user', async () => {
      const response = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.roles).toBeDefined();
      expect(response.body.roles.length).toBeGreaterThanOrEqual(3);
      
      // Verify roles structure
      const roles = response.body.roles;
      expect(roles.some((r: any) => r.role === 'parent' && r.schoolId === 1)).toBe(true);
      expect(roles.some((r: any) => r.role === 'educator' && r.schoolId === 1)).toBe(true);
      expect(roles.some((r: any) => r.role === 'educator' && r.schoolId === 2)).toBe(true);
    });

    it('should return single role for a single-role user', async () => {
      const response = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.singleRoleUser.email)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.roles).toBeDefined();
      expect(response.body.roles.length).toBe(1);
      expect(response.body.roles[0].role).toBe('parent');
      expect(response.body.roles[0].schoolId).toBe(1);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .get('/api/user/roles')
        .expect(401);
    });
  });

  describe('POST /api/user/switch-role - Switch Active Role', () => {
    it('should switch to a valid role', async () => {
      // First get the user's roles to find a valid roleId
      const rolesResponse = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      const educatorRole = rolesResponse.body.roles.find(
        (r: any) => r.role === 'educator' && r.schoolId === 1
      );
      expect(educatorRole).toBeDefined();

      // Switch to educator role
      const response = await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: educatorRole.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.activeRole).toBe('educator');
      expect(response.body.schoolId).toBe(1);

      // Verify database was updated
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userIds.multiRoleUser))
        .limit(1);
      
      expect(updatedUser[0].activeRole).toBe('educator');
      expect(updatedUser[0].schoolId).toBe(1);
    });

    it('should switch school context when switching to cross-school role', async () => {
      const rolesResponse = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      const school2Role = rolesResponse.body.roles.find(
        (r: any) => r.role === 'educator' && r.schoolId === 2
      );
      expect(school2Role).toBeDefined();

      const response = await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: school2Role.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.activeRole).toBe('educator');
      expect(response.body.schoolId).toBe(2);

      // Verify school context changed
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userIds.multiRoleUser))
        .limit(1);
      
      expect(updatedUser[0].schoolId).toBe(2);
    });

    it('should reject switching to non-existent role', async () => {
      await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: 999999 })
        .expect(404);
    });

    it('should reject switching to another user\'s role', async () => {
      const otherUserRoles = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.singleRoleUser.email)
        .expect(200);

      const otherRoleId = otherUserRoles.body.roles[0].id;

      await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: otherRoleId })
        .expect(404);
    });
  });

  describe('POST /api/user/reset-role - Reset to Primary Role', () => {
    it('should reset active role to primary role', async () => {
      // First switch to a non-primary role
      const rolesResponse = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      const educatorRole = rolesResponse.body.roles.find(
        (r: any) => r.role === 'educator'
      );

      await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: educatorRole.id })
        .expect(200);

      // Now reset to primary
      const response = await request(app)
        .post('/api/user/reset-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('primary role');

      // Verify active role is cleared
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userIds.multiRoleUser))
        .limit(1);
      
      expect(updatedUser[0].activeRole).toBeNull();
    });
  });

  describe('Admin APIs - Role Management', () => {
    
    describe('GET /api/user/admin/users/:userId/roles', () => {
      it('should allow global admin to view any user roles', async () => {
        const response = await request(app)
          .get(`/api/user/admin/users/${userIds.multiRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.user).toBeDefined();
        expect(response.body.roles).toBeDefined();
        expect(response.body.roles.length).toBeGreaterThan(0);
      });

      it('should allow schoolAdmin to view their school users only', async () => {
        const response = await request(app)
          .get(`/api/user/admin/users/${userIds.multiRoleUser}/roles`)
          .set('x-test-user-email', testUsers.schoolAdmin.email)
          .expect(200);

        expect(response.body.success).toBe(true);
        // Should only see roles from school 1
        const school1Roles = response.body.roles.filter((r: any) => r.schoolId === 1);
        expect(school1Roles.length).toBeGreaterThan(0);
      });

      it('should block unauthorized users from viewing roles', async () => {
        await request(app)
          .get(`/api/user/admin/users/${userIds.globalAdmin}/roles`)
          .set('x-test-user-email', testUsers.singleRoleUser.email)
          .expect(403);
      });
    });

    describe('POST /api/user/admin/users/:userId/roles', () => {
      it('should allow global admin to add role at any school', async () => {
        const response = await request(app)
          .post(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .send({
            role: 'educator',
            schoolId: 2,
            isPrimary: false
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.role.role).toBe('educator');
        expect(response.body.role.schoolId).toBe(2);

        // Cleanup
        await db
          .delete(userRoles)
          .where(and(
            eq(userRoles.userId, userIds.singleRoleUser),
            eq(userRoles.role, 'educator'),
            eq(userRoles.schoolId, 2)
          ));
      });

      it('should prevent duplicate role at same school', async () => {
        await request(app)
          .post(`/api/user/admin/users/${userIds.multiRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .send({
            role: 'parent',
            schoolId: 1,
            isPrimary: false
          })
          .expect(409);
      });

      it('should allow same role at different schools', async () => {
        const response = await request(app)
          .post(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .send({
            role: 'parent',
            schoolId: 2,
            isPrimary: false
          })
          .expect(200);

        expect(response.body.success).toBe(true);

        // Cleanup
        await db
          .delete(userRoles)
          .where(and(
            eq(userRoles.userId, userIds.singleRoleUser),
            eq(userRoles.role, 'parent'),
            eq(userRoles.schoolId, 2)
          ));
      });

      it('should block schoolAdmin from adding roles to other schools', async () => {
        await request(app)
          .post(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.schoolAdmin.email)
          .send({
            role: 'educator',
            schoolId: 2,
            isPrimary: false
          })
          .expect(403);
      });

      it('should block unauthorized users from adding roles', async () => {
        await request(app)
          .post(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.singleRoleUser.email)
          .send({
            role: 'educator',
            schoolId: 1,
            isPrimary: false
          })
          .expect(403);
      });
    });

    describe('DELETE /api/user/admin/users/:userId/roles/:roleId', () => {
      let tempRoleId: number;

      beforeEach(async () => {
        // Add a temporary role for deletion tests
        const newRole = await db
          .insert(userRoles)
          .values({
            userId: userIds.multiRoleUser,
            role: 'learner',
            schoolId: 1,
            isPrimary: false
          })
          .returning();
        tempRoleId = newRole[0].id;
      });

      it('should allow global admin to delete roles', async () => {
        const response = await request(app)
          .delete(`/api/user/admin/users/${userIds.multiRoleUser}/roles/${tempRoleId}`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        expect(response.body.success).toBe(true);

        // Verify deletion
        const deletedRole = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.id, tempRoleId))
          .limit(1);
        
        expect(deletedRole.length).toBe(0);
      });

      it('should prevent deleting last role', async () => {
        const rolesResponse = await request(app)
          .get(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        const onlyRoleId = rolesResponse.body.roles[0].id;

        await request(app)
          .delete(`/api/user/admin/users/${userIds.singleRoleUser}/roles/${onlyRoleId}`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(400);
      });

      it('should clear activeRole if deleted role matches activeRole', async () => {
        // Set active role to the temp role
        await db
          .update(users)
          .set({ activeRole: 'learner' })
          .where(eq(users.id, userIds.multiRoleUser));

        await request(app)
          .delete(`/api/user/admin/users/${userIds.multiRoleUser}/roles/${tempRoleId}`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        // Verify activeRole cleared
        const updatedUser = await db
          .select()
          .from(users)
          .where(eq(users.id, userIds.multiRoleUser))
          .limit(1);
        
        expect(updatedUser[0].activeRole).toBeNull();
      });

      it('should reassign primary role when deleting primary role', async () => {
        // Add another role
        const additionalRole = await db
          .insert(userRoles)
          .values({
            userId: userIds.singleRoleUser,
            role: 'educator',
            schoolId: 1,
            isPrimary: false
          })
          .returning();

        // Get the primary role
        const rolesResponse = await request(app)
          .get(`/api/user/admin/users/${userIds.singleRoleUser}/roles`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        const primaryRole = rolesResponse.body.roles.find((r: any) => r.isPrimary);

        // Delete primary role
        await request(app)
          .delete(`/api/user/admin/users/${userIds.singleRoleUser}/roles/${primaryRole.id}`)
          .set('x-test-user-email', testUsers.globalAdmin.email)
          .expect(200);

        // Verify new primary role assigned
        const updatedUser = await db
          .select()
          .from(users)
          .where(eq(users.id, userIds.singleRoleUser))
          .limit(1);
        
        expect(updatedUser[0].role).toBe('educator');

        // Cleanup
        await db
          .delete(userRoles)
          .where(eq(userRoles.id, additionalRole[0].id));
      });

      it('should block schoolAdmin from deleting roles at other schools', async () => {
        // Add a role at school 2
        const school2Role = await db
          .insert(userRoles)
          .values({
            userId: userIds.multiRoleUser,
            role: 'educator',
            schoolId: 2,
            isPrimary: false
          })
          .returning();

        await request(app)
          .delete(`/api/user/admin/users/${userIds.multiRoleUser}/roles/${school2Role[0].id}`)
          .set('x-test-user-email', testUsers.schoolAdmin.email)
          .expect(403);

        // Cleanup
        await db.delete(userRoles).where(eq(userRoles.id, school2Role[0].id));
      });
    });
  });

  describe('School Context Isolation', () => {
    it('should maintain school context across role switches', async () => {
      // Get roles
      const rolesResponse = await request(app)
        .get('/api/user/roles')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .expect(200);

      const school1Role = rolesResponse.body.roles.find(
        (r: any) => r.schoolId === 1
      );
      const school2Role = rolesResponse.body.roles.find(
        (r: any) => r.schoolId === 2
      );

      // Switch to school 1 role
      await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: school1Role.id })
        .expect(200);

      let user = await db
        .select()
        .from(users)
        .where(eq(users.id, userIds.multiRoleUser))
        .limit(1);
      expect(user[0].schoolId).toBe(1);

      // Switch to school 2 role
      await request(app)
        .post('/api/user/switch-role')
        .set('x-test-user-email', testUsers.multiRoleUser.email)
        .send({ roleId: school2Role.id })
        .expect(200);

      user = await db
        .select()
        .from(users)
        .where(eq(users.id, userIds.multiRoleUser))
        .limit(1);
      expect(user[0].schoolId).toBe(2);
    });
  });
});
