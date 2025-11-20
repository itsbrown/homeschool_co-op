import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { sql, eq, and } from 'drizzle-orm';
import { users, userRoles } from '@shared/schema';
import { supabaseAuth } from '../middleware/supabase-auth';

export const userRolesRouter = Router();

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
 * Body: { role: string }
 */
userRolesRouter.post('/switch-role', supabaseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const db = await getDb();
    
    // Verify the user has this role and get the associated school
    const userRole = await db
      .select({ schoolId: userRoles.schoolId })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, role)
      ))
      .limit(1);

    if (!userRole || userRole.length === 0) {
      return res.status(403).json({ 
        error: 'You do not have this role',
        message: `Role '${role}' is not assigned to your account`,
      });
    }

    // Update the user's active role
    await db
      .update(users)
      .set({ activeRole: role })
      .where(eq(users.id, userId));

    // Return the school context for the new role
    const newSchoolId = userRole[0].schoolId;

    return res.json({
      success: true,
      activeRole: role,
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

export default userRolesRouter;
