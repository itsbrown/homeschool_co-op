import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { sql, eq, and, ne } from 'drizzle-orm';
import { users, userRoles, schools, insertUserRoleSchema } from '@shared/schema';
import { supabaseAuth } from '../middleware/supabase-auth';
import type { Request as ExpressRequest } from 'express-serve-static-core';

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

/**
 * Helper function to check if a SchoolAdmin has access to manage a target user's roles.
 * 
 * Access is granted if ANY of these conditions are true:
 * 1. Target user's schoolId matches admin's school (legacy support)
 * 2. Target user has existing roles at admin's school (multi-role users)
 * 3. Target user has null schoolId AND no roles at other schools (new user onboarding)
 * 
 * This ensures proper multi-tenant isolation while allowing legitimate onboarding.
 */
interface SchoolAdminAccessResult {
  hasAccess: boolean;
  hasAccessViaSchoolId: boolean;
  hasAccessViaRoles: boolean;
  isNewUserWithNoSchool: boolean;
  rolesAtOtherSchools: number;
}

async function checkSchoolAdminAccessToUser(
  targetUserId: number,
  targetUserSchoolId: number | null,
  adminSchoolId: number
): Promise<SchoolAdminAccessResult> {
  const db = await getDb();
  
  // Check if user has at least one role at the admin's school
  const userRolesAtAdminSchool = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(
      eq(userRoles.userId, targetUserId),
      eq(userRoles.schoolId, adminSchoolId)
    ))
    .limit(1);
  
  // Check if user has roles at OTHER schools (for cross-tenant protection)
  const userRolesAtOtherSchools = await db
    .select({ id: userRoles.id, schoolId: userRoles.schoolId })
    .from(userRoles)
    .where(and(
      eq(userRoles.userId, targetUserId),
      ne(userRoles.schoolId, adminSchoolId)
    ))
    .limit(1);
  
  // Determine access via three pathways
  const hasAccessViaSchoolId = targetUserSchoolId === adminSchoolId;
  const hasAccessViaRoles = userRolesAtAdminSchool.length > 0;
  // Only allow access to users with null schoolId if they have NO roles at other schools
  const isNewUserWithNoSchool = targetUserSchoolId === null && userRolesAtOtherSchools.length === 0;
  
  const hasAccess = hasAccessViaSchoolId || hasAccessViaRoles || isNewUserWithNoSchool;
  
  return {
    hasAccess,
    hasAccessViaSchoolId,
    hasAccessViaRoles,
    isNewUserWithNoSchool,
    rolesAtOtherSchools: userRolesAtOtherSchools.length,
  };
}

// Type for authenticated requests - uses the extended Request type from middleware/types.ts
type AuthenticatedRequest = ExpressRequest;

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
    
    // Get all roles for this user with school names
    const roles = await db
      .select({
        id: userRoles.id,
        role: userRoles.role,
        schoolId: userRoles.schoolId,
        schoolName: schools.name,
        isPrimary: userRoles.isPrimary,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .leftJoin(schools, eq(userRoles.schoolId, schools.id))
      .where(eq(userRoles.userId, userId))
      .orderBy(sql`${userRoles.isPrimary} DESC, ${userRoles.createdAt} ASC`);

    // Get user's active role and active role ID
    const user = await db
      .select({ 
        activeRole: users.activeRole, 
        activeRoleId: users.activeRoleId,
        role: users.role 
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const currentUser = user[0];
    
    // Determine the effective active role and ID
    const effectiveActiveRole = currentUser?.activeRole || currentUser?.role;
    const effectiveActiveRoleId = currentUser?.activeRoleId;

    return res.json({
      roles: roles.map((r: any) => ({
        id: r.id,
        role: r.role,
        schoolId: r.schoolId,
        schoolName: r.schoolName,
        isPrimary: r.isPrimary,
        createdAt: r.createdAt,
      })),
      activeRole: effectiveActiveRole,
      activeRoleId: effectiveActiveRoleId,
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
    
    // Get user's active role, active role ID, and primary role
    const user = await db
      .select({ 
        activeRole: users.activeRole,
        activeRoleId: users.activeRoleId,
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
    const effectiveActiveRoleId = currentUser.activeRoleId;

    // CRITICAL: Get school context from user_roles table
    // Priority 1: Use activeRoleId if available (ensures correct school for multi-school roles)
    // Priority 2: Fall back to role string match (backward compatibility)
    let effectiveSchoolId;
    
    if (effectiveActiveRoleId) {
      // Use role ID for precise school context lookup
      const roleById = await db
        .select({ schoolId: userRoles.schoolId })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.id, effectiveActiveRoleId)
        ))
        .limit(1);
      
      effectiveSchoolId = roleById.length > 0 
        ? roleById[0].schoolId 
        : currentUser.schoolId;
    } else {
      // Fall back to role string match
      const roleMapping = await db
        .select({ schoolId: userRoles.schoolId })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.role, effectiveRole)
        ))
        .limit(1);

      effectiveSchoolId = roleMapping.length > 0 
        ? roleMapping[0].schoolId 
        : currentUser.schoolId;
    }

    return res.json({
      activeRole: effectiveRole,
      activeRoleId: effectiveActiveRoleId,
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
    
    // Get current user to check current school context
    const currentUser = await db
      .select({ 
        activeRoleId: users.activeRoleId,
        schoolId: users.schoolId 
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!currentUser || currentUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get current school from active role
    let currentSchoolId = currentUser[0].schoolId;
    if (currentUser[0].activeRoleId) {
      const currentRole = await db
        .select({ schoolId: userRoles.schoolId })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.id, currentUser[0].activeRoleId)
        ))
        .limit(1);
      
      if (currentRole.length > 0) {
        currentSchoolId = currentRole[0].schoolId;
      }
    }
    
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

    // SECURITY: Block cross-school role switching
    if (currentSchoolId !== newSchoolId) {
      return res.status(403).json({
        error: 'Cross-school switching not allowed',
        message: 'You can only switch between roles within the same school. If you need to access a different school, please contact your administrator.',
        currentSchoolId,
        targetSchoolId: newSchoolId,
      });
    }

    // Update the user's active role, active role ID, and school ID (keep in sync)
    await db
      .update(users)
      .set({ 
        activeRole: role,
        activeRoleId: roleId,
        schoolId: newSchoolId // Ensure schoolId stays in sync
      })
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

    // Reset active_role and active_role_id to NULL (will use primary role)
    await db
      .update(users)
      .set({ 
        activeRole: null,
        activeRoleId: null 
      })
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

    // For schoolAdmins, use helper to check access
    if (adminSchoolId !== null) {
      const accessResult = await checkSchoolAdminAccessToUser(
        targetUserId,
        targetUser[0].schoolId,
        adminSchoolId
      );
      
      if (!accessResult.hasAccess) {
        return res.status(403).json({ 
          error: 'Access denied. You can only manage users from your school.' 
        });
      }
      
      console.log(`📋 SchoolAdmin fetching roles: userId=${targetUserId}, hasAccessViaSchoolId=${accessResult.hasAccessViaSchoolId}, hasAccessViaRoles=${accessResult.hasAccessViaRoles}, isNewUser=${accessResult.isNewUserWithNoSchool}, rolesAtOtherSchools=${accessResult.rolesAtOtherSchools}`);
    }

    // Get all roles for this user with school name
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
          schoolName: schools.name,
          isPrimary: userRoles.isPrimary,
          createdAt: userRoles.createdAt,
        })
        .from(userRoles)
        .leftJoin(schools, eq(userRoles.schoolId, schools.id))
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
          schoolName: schools.name,
          isPrimary: userRoles.isPrimary,
          createdAt: userRoles.createdAt,
        })
        .from(userRoles)
        .leftJoin(schools, eq(userRoles.schoolId, schools.id))
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
        schoolName: r.schoolName,
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
      // Use helper to check SchoolAdmin access
      const accessResult = await checkSchoolAdminAccessToUser(
        targetUserId,
        targetUser[0].schoolId,
        adminSchoolId
      );
      
      if (!accessResult.hasAccess) {
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
      
      console.log(`📝 SchoolAdmin adding role: userId=${targetUserId}, role=${role}, schoolId=${roleSchoolId}, targetUserSchoolId=${targetUser[0].schoolId}, rolesAtOtherSchools=${accessResult.rolesAtOtherSchools}`);
    } else {
      // Global admin: Use provided schoolId or default to user's school
      roleSchoolId = schoolId || targetUser[0].schoolId;
      
      console.log(`📝 GlobalAdmin adding role: userId=${targetUserId}, role=${role}, schoolId=${roleSchoolId}`);
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

    // Execute role addition in a transaction to ensure atomicity
    const result = await db.transaction(async (tx: any) => {
      // Get current user state
      const currentUser = await tx
        .select({ activeRoleId: users.activeRoleId })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      // If this is being marked as primary, clear existing primary flags
      if (isPrimary) {
        await tx
          .update(userRoles)
          .set({ isPrimary: false })
          .where(eq(userRoles.userId, targetUserId));
        
        console.log(`🔄 Cleared existing primary flags for user ${targetUserId}`);
      }

      // Insert new role
      const newRole = await tx
        .insert(userRoles)
        .values({
          userId: targetUserId,
          role,
          schoolId: roleSchoolId,
          isPrimary: isPrimary || false,
        })
        .returning();

      // Determine whether to set this as the active role
      let shouldSetActive = false;
      
      if (isPrimary) {
        // Always set as active if this is the new primary role
        shouldSetActive = true;
      } else if (!currentUser[0]?.activeRoleId) {
        // User has no active role - check if there's an existing primary role
        const existingPrimary = await tx
          .select({ id: userRoles.id, role: userRoles.role, schoolId: userRoles.schoolId })
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, targetUserId),
            eq(userRoles.isPrimary, true),
            ne(userRoles.id, newRole[0].id) // Exclude the just-inserted role
          ))
          .limit(1);
        
        if (existingPrimary.length > 0) {
          // There's an existing primary role - use that instead
          await tx
            .update(users)
            .set({
              role: existingPrimary[0].role,
              activeRole: existingPrimary[0].role,
              activeRoleId: existingPrimary[0].id,
              schoolId: existingPrimary[0].schoolId,
            })
            .where(eq(users.id, targetUserId));
          
          console.log(`✅ Set active role for user ${targetUserId} to existing primary ${existingPrimary[0].role} (roleId: ${existingPrimary[0].id})`);
        } else {
          // No existing primary - promote the new role to primary
          shouldSetActive = true;
          
          // Mark the new role as primary since it's being promoted
          if (!isPrimary) {
            await tx
              .update(userRoles)
              .set({ isPrimary: true })
              .where(eq(userRoles.id, newRole[0].id));
            
            console.log(`🔄 Promoted new role ${role} to primary for user ${targetUserId}`);
          }
        }
      }
      
      if (shouldSetActive) {
        await tx
          .update(users)
          .set({
            role, // Update legacy role column for backwards compatibility
            activeRole: role,
            activeRoleId: newRole[0].id,
            schoolId: roleSchoolId, // Update school context when changing active role
          })
          .where(eq(users.id, targetUserId));

        console.log(`✅ Set active role for user ${targetUserId} to ${role} (roleId: ${newRole[0].id}, school: ${roleSchoolId})`);
      }

      return newRole[0];
    });

    return res.json({
      success: true,
      message: `Successfully added ${role} role to user`,
      role: result,
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

    // Execute role deletion in a transaction to ensure atomicity
    await db.transaction(async (tx: any) => {
      // Get current user state and role being deleted
      const currentUser = await tx
        .select({ role: users.role, activeRole: users.activeRole, activeRoleId: users.activeRoleId })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (currentUser.length === 0) {
        throw new Error('User not found');
      }

      // Check if the role being deleted is marked as primary in user_roles
      const roleBeingDeleted = await tx
        .select({ isPrimary: userRoles.isPrimary })
        .from(userRoles)
        .where(eq(userRoles.id, roleId))
        .limit(1);

      const isDeletingActiveRole = currentUser[0].activeRoleId === roleId;
      const isDeletingPrimaryRole = roleBeingDeleted[0]?.isPrimary || currentUser[0].role === roleToDelete[0].role;
      
      // Find remaining roles (primary first, then earliest)
      const remainingRoles = await tx
        .select({ role: userRoles.role, id: userRoles.id, schoolId: userRoles.schoolId, isPrimary: userRoles.isPrimary, createdAt: userRoles.createdAt })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, targetUserId),
          ne(userRoles.id, roleId) // Exclude the role being deleted
        ))
        .orderBy(sql`${userRoles.isPrimary} DESC, ${userRoles.createdAt} ASC`)
        .limit(1);

      if (remainingRoles.length === 0) {
        // This should never happen due to last-role check, but defensive coding
        throw new Error('Cannot remove last role - users must have at least one role');
      }

      // If deleting the active role or primary role, fall back to the next role (primary first, else earliest)
      if (isDeletingActiveRole || isDeletingPrimaryRole) {
        const fallbackRole = remainingRoles[0];
        
        // Clear all primary flags, then set the fallback as primary
        await tx
          .update(userRoles)
          .set({ isPrimary: false })
          .where(eq(userRoles.userId, targetUserId));
        
        await tx
          .update(userRoles)
          .set({ isPrimary: true })
          .where(eq(userRoles.id, fallbackRole.id));
        
        // Update users table with new active/primary role
        await tx
          .update(users)
          .set({ 
            role: fallbackRole.role, // Update legacy role column
            activeRole: fallbackRole.role,
            activeRoleId: fallbackRole.id,
            schoolId: fallbackRole.schoolId, // Update school context
          })
          .where(eq(users.id, targetUserId));

        console.log(`🔄 Reassigned active role for user ${targetUserId} from ${roleToDelete[0].role} to ${fallbackRole.role} (school ${fallbackRole.schoolId}, marked as primary)`);
      }

      // Delete the role
      await tx
        .delete(userRoles)
        .where(eq(userRoles.id, roleId));
    });

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
