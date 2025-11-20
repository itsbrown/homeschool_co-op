import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { sql, eq, and, ne } from 'drizzle-orm';
import { users, userRoles, insertUserRoleSchema } from '@shared/schema';
import { supabaseAuth } from '../middleware/supabase-auth';

export const userRolesRouter = Router();

// Helper function to check if user is admin or schoolAdmin
async function isAdminOrSchoolAdmin(userId: number): Promise<{ isAdmin: boolean; schoolId: number | null }> {
  const db = await getDb();
  
  const user = await db
    .select({ role: users.role, activeRole: users.activeRole, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.length === 0) {
    return { isAdmin: false, schoolId: null };
  }

  const effectiveRole = user[0].activeRole || user[0].role;
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'superAdmin' || effectiveRole === 'schoolAdmin';
  
  return { 
    isAdmin, 
    schoolId: effectiveRole === 'schoolAdmin' ? user[0].schoolId : null 
  };
}

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

/**
 * GET /api/user/roles
 * Get all roles for the currently authenticated user
 */
userRolesRouter.get('/roles', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const db = await getDb();
    
    // Get all roles for this user
    const roles = await db
      .select({
        id: userRoles.id,
        role: userRoles.role,
        schoolId: userRoles.schoolId,
        isPrimary: userRoles.isPrimary,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .orderBy(sql`${userRoles.isPrimary} DESC, ${userRoles.createdAt} ASC`);

    // Get user's active role
    const user = await db
      .select({ activeRole: users.activeRole, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const currentUser = user[0];
    
    // Determine the effective active role
    const effectiveActiveRole = currentUser?.activeRole || currentUser?.role;

    return res.json({
      roles: roles.map((r: any) => ({
        id: r.id,
        role: r.role,
        schoolId: r.schoolId,
        isPrimary: r.isPrimary,
        createdAt: r.createdAt,
      })),
      activeRole: effectiveActiveRole,
      canSwitchRoles: roles.length > 1,
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    next(error);
  }
});

/**
 * GET /api/user/current-role
 * Get the current active role for the authenticated user
 * IMPORTANT: Returns school context from user_roles table to ensure correct tenant scope after role switching
 */
userRolesRouter.get('/current-role', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const db = await getDb();
    
    // Get user's active role and primary role
    const user = await db
      .select({ 
        activeRole: users.activeRole, 
        role: users.role,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = user[0];
    
    // Active role takes precedence, fall back to primary role
    const effectiveRole = currentUser.activeRole || currentUser.role;

    // CRITICAL: Get school context from user_roles table for the active role
    // This ensures correct tenant scope when switching between roles with different schools
    const roleMapping = await db
      .select({ schoolId: userRoles.schoolId })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, effectiveRole)
      ))
      .limit(1);

    // Priority: role mapping school ID > users.schoolId (fallback for backward compatibility)
    const effectiveSchoolId = roleMapping.length > 0 
      ? roleMapping[0].schoolId 
      : currentUser.schoolId;

    return res.json({
      activeRole: effectiveRole,
      schoolId: effectiveSchoolId,
    });
  } catch (error) {
    console.error('Error fetching current role:', error);
    next(error);
  }
});

/**
 * POST /api/user/switch-role
 * Switch the active role for the authenticated user
 * 
 * Body: { roleId: number }
 */
userRolesRouter.post('/switch-role', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'Role ID is required' });
    }

    const db = await getDb();
    
    // Verify the user has this role and get the role details and school
    const userRole = await db
      .select({ 
        id: userRoles.id,
        role: userRoles.role,
        schoolId: userRoles.schoolId 
      })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.id, roleId)
      ))
      .limit(1);

    if (!userRole || userRole.length === 0) {
      return res.status(403).json({ 
        error: 'You do not have this role',
        message: `Role ID ${roleId} is not assigned to your account`,
      });
    }

    const role = userRole[0].role;
    const newSchoolId = userRole[0].schoolId;

    // Update the user's active role
    await db
      .update(users)
      .set({ activeRole: role })
      .where(eq(users.id, userId));

    return res.json({
      success: true,
      activeRole: role,
      activeRoleId: roleId,
      schoolId: newSchoolId,
      message: `Successfully switched to ${role} role`,
    });
  } catch (error) {
    console.error('Error switching role:', error);
    next(error);
  }
});

/**
 * POST /api/user/reset-role
 * Reset active role to primary role (the role in users.role column)
 */
userRolesRouter.post('/reset-role', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const db = await getDb();
    
    // Get user's primary role and school
    const user = await db
      .select({ role: users.role, schoolId: users.schoolId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const primaryRole = user[0].role;
    const usersSchoolId = user[0].schoolId;

    // Reset active_role to NULL (will use primary role)
    await db
      .update(users)
      .set({ activeRole: null })
      .where(eq(users.id, userId));

    // Get the school context for the primary role from user_roles
    const primaryRoleMapping = await db
      .select({ schoolId: userRoles.schoolId })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, primaryRole)
      ))
      .limit(1);

    // Priority: role mapping school ID > users.schoolId (backward compatibility)
    const primarySchoolId = primaryRoleMapping.length > 0 
      ? primaryRoleMapping[0].schoolId 
      : usersSchoolId;

    return res.json({
      success: true,
      activeRole: primaryRole,
      schoolId: primarySchoolId,
      message: `Reset to primary role: ${primaryRole}`,
    });
  } catch (error) {
    console.error('Error resetting role:', error);
    next(error);
  }
});

/**
 * ADMIN ENDPOINTS - Role Management for Other Users
 */

/**
 * GET /api/user/admin/users/:userId/roles
 * Get all roles for a specific user (admin only)
 */
userRolesRouter.get('/admin/users/:userId/roles', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;
    
    if (!adminId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if requester is admin
    const { isAdmin, schoolId: adminSchoolId } = await isAdminOrSchoolAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or SchoolAdmin role required.' });
    }

    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const db = await getDb();
    
    // Get target user's basic info
    const targetUser = await db
      .select({ 
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        activeRole: users.activeRole,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For schoolAdmins, enforce school isolation
    if (adminSchoolId !== null && targetUser[0].schoolId !== adminSchoolId) {
      return res.status(403).json({ 
        error: 'Access denied. You can only manage users from your school.' 
      });
    }

    // Get all roles for this user
    // For schoolAdmins, only show roles from their school (strict isolation)
    // CRITICAL: Must combine predicates in a single where() to avoid overwriting
    let rolesQuery;
    
    if (adminSchoolId !== null) {
      // SchoolAdmin: filter by BOTH userId AND schoolId
      rolesQuery = db
        .select({
          id: userRoles.id,
          role: userRoles.role,
          schoolId: userRoles.schoolId,
          isPrimary: userRoles.isPrimary,
          createdAt: userRoles.createdAt,
        })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, targetUserId),
          eq(userRoles.schoolId, adminSchoolId)
        ));
    } else {
      // Global admin: filter by userId only
      rolesQuery = db
        .select({
          id: userRoles.id,
          role: userRoles.role,
          schoolId: userRoles.schoolId,
          isPrimary: userRoles.isPrimary,
          createdAt: userRoles.createdAt,
        })
        .from(userRoles)
        .where(eq(userRoles.userId, targetUserId));
    }

    const roles = await rolesQuery.orderBy(sql`${userRoles.isPrimary} DESC, ${userRoles.createdAt} ASC`);

    return res.json({
      user: {
        id: targetUser[0].id,
        email: targetUser[0].email,
        name: targetUser[0].name,
        primaryRole: targetUser[0].role,
        activeRole: targetUser[0].activeRole || targetUser[0].role,
        schoolId: targetUser[0].schoolId,
      },
      roles: roles.map((r: any) => ({
        id: r.id,
        role: r.role,
        schoolId: r.schoolId,
        isPrimary: r.isPrimary,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching user roles (admin):', error);
    next(error);
  }
});

/**
 * POST /api/user/admin/users/:userId/roles
 * Add a role to a user (admin only)
 * 
 * Body: { role: string, schoolId?: number, isPrimary?: boolean }
 */
userRolesRouter.post('/admin/users/:userId/roles', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;
    
    if (!adminId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if requester is admin
    const { isAdmin, schoolId: adminSchoolId } = await isAdminOrSchoolAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or SchoolAdmin role required.' });
    }

    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { role, schoolId, isPrimary } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Validate role using Zod schema
    const validRoles = ['student', 'parent', 'learner', 'educator', 'teacher', 'schoolAdmin', 'admin', 'superAdmin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role value' });
    }

    const db = await getDb();
    
    // Get target user
    const targetUser = await db
      .select({ schoolId: users.schoolId })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine the school for the new role
    // For schoolAdmins: Must use their school
    // For global admins: Use provided schoolId or fall back to user's current school
    let roleSchoolId: number;
    
    if (adminSchoolId !== null) {
      // SchoolAdmin: Enforce school isolation
      if (targetUser[0].schoolId !== adminSchoolId) {
        return res.status(403).json({ 
          error: 'Access denied. You can only manage users from your school.' 
        });
      }
      
      // SchoolAdmins can only assign roles to their school
      if (schoolId && schoolId !== adminSchoolId) {
        return res.status(403).json({ 
          error: 'You can only assign roles to your school.' 
        });
      }
      
      roleSchoolId = adminSchoolId;
    } else {
      // Global admin: Use provided schoolId or default to user's school
      roleSchoolId = schoolId || targetUser[0].schoolId;
    }

    // Check if role already exists AT THE SAME SCHOOL
    // CRITICAL: Must check (userId, role, schoolId) to allow same role at different schools
    const existingRole = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, targetUserId),
        eq(userRoles.role, role),
        eq(userRoles.schoolId, roleSchoolId)
      ))
      .limit(1);

    if (existingRole && existingRole.length > 0) {
      return res.status(409).json({ 
        error: 'Role already assigned',
        message: `User already has the ${role} role at school ${roleSchoolId}` 
      });
    }

    // Insert new role
    const newRole = await db
      .insert(userRoles)
      .values({
        userId: targetUserId,
        role,
        schoolId: roleSchoolId,
        isPrimary: isPrimary || false,
      })
      .returning();

    return res.json({
      success: true,
      message: `Successfully added ${role} role to user`,
      role: newRole[0],
    });
  } catch (error) {
    console.error('Error adding role (admin):', error);
    next(error);
  }
});

/**
 * DELETE /api/user/admin/users/:userId/roles/:roleId
 * Remove a role from a user (admin only)
 */
userRolesRouter.delete('/admin/users/:userId/roles/:roleId', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;
    
    if (!adminId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if requester is admin
    const { isAdmin, schoolId: adminSchoolId } = await isAdminOrSchoolAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or SchoolAdmin role required.' });
    }

    const targetUserId = parseInt(req.params.userId);
    const roleId = parseInt(req.params.roleId);
    
    if (isNaN(targetUserId) || isNaN(roleId)) {
      return res.status(400).json({ error: 'Invalid user ID or role ID' });
    }

    const db = await getDb();
    
    // Get target user
    const targetUser = await db
      .select({ schoolId: users.schoolId })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For schoolAdmins, enforce school isolation
    if (adminSchoolId !== null && targetUser[0].schoolId !== adminSchoolId) {
      return res.status(403).json({ 
        error: 'Access denied. You can only manage users from your school.' 
      });
    }

    // Get the role to be deleted
    const roleToDelete = await db
      .select({ role: userRoles.role, userId: userRoles.userId, schoolId: userRoles.schoolId })
      .from(userRoles)
      .where(eq(userRoles.id, roleId))
      .limit(1);

    if (!roleToDelete || roleToDelete.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Verify role belongs to target user
    if (roleToDelete[0].userId !== targetUserId) {
      return res.status(400).json({ error: 'Role does not belong to specified user' });
    }

    // For schoolAdmins, enforce that the role being deleted belongs to their school
    if (adminSchoolId !== null && roleToDelete[0].schoolId !== adminSchoolId) {
      return res.status(403).json({ 
        error: 'Access denied. You can only remove roles from your school.' 
      });
    }

    // Check if this is the user's last role
    const allRoles = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.userId, targetUserId));

    if (allRoles.length <= 1) {
      return res.status(400).json({ 
        error: 'Cannot remove last role',
        message: 'Users must have at least one role' 
      });
    }

    // CRITICAL: Handle primary role (users.role) reassignment before deletion
    // If the role being deleted is the primary role, we need to reassign users.role
    const currentUser = await db
      .select({ role: users.role, activeRole: users.activeRole })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (currentUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPrimaryRole = currentUser[0].role === roleToDelete[0].role;
    
    if (isPrimaryRole) {
      // Find another role to promote to primary (including schoolId for proper alignment)
      const remainingRoles = await db
        .select({ role: userRoles.role, id: userRoles.id, schoolId: userRoles.schoolId })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, targetUserId),
          ne(userRoles.id, roleId) // Exclude the role being deleted
        ))
        .limit(1);

      if (remainingRoles.length === 0) {
        // This should never happen due to last-role check, but defensive coding
        return res.status(400).json({ 
          error: 'Cannot remove primary role',
          message: 'Cannot delete the only remaining role. Users must have at least one role.' 
        });
      }

      // Reassign users.role AND users.schoolId to the next available role
      // CRITICAL: Must update schoolId to maintain tenant isolation
      const newPrimaryRole = remainingRoles[0].role;
      const newSchoolId = remainingRoles[0].schoolId;
      
      await db
        .update(users)
        .set({ 
          role: newPrimaryRole,
          schoolId: newSchoolId, // CRITICAL: Update school context
          activeRole: null // Also clear activeRole to use the new primary
        })
        .where(eq(users.id, targetUserId));

      console.log(`🔄 Reassigned primary role for user ${targetUserId} from ${roleToDelete[0].role} to ${newPrimaryRole} (school ${newSchoolId})`);
    } else if (currentUser[0].activeRole === roleToDelete[0].role) {
      // If activeRole matches the deleted role (but not primary), clear it
      await db
        .update(users)
        .set({ activeRole: null })
        .where(eq(users.id, targetUserId));

      console.log(`🔄 Cleared activeRole for user ${targetUserId} after deleting their active role: ${roleToDelete[0].role}`);
    }

    // Delete the role
    await db
      .delete(userRoles)
      .where(eq(userRoles.id, roleId));

    return res.json({
      success: true,
      message: `Successfully removed ${roleToDelete[0].role} role from user`,
    });
  } catch (error) {
    console.error('Error removing role (admin):', error);
    next(error);
  }
});

export default userRolesRouter;
