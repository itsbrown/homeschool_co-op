import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { UserSyncService } from '../services/userSyncService';

// Supabase JWT verification middleware with fallback for development
export const jwtCheck = async (req: any, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    console.log('🔍 Verifying Supabase token...');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('❌ Token verification failed:', error?.message);
      return res.status(401).json({ message: 'Token verification failed' });
    }

    console.log('✅ Token verified successfully for:', user.email);
    console.log('🔍 User object fields:', Object.keys(user));
    console.log('🔍 User ID field:', user.id);

    // Sync user with database - ALWAYS use database as source of truth for schoolId
    let dbUser;
    try {
      // Do NOT pass schoolId from metadata - let database be the source of truth
      dbUser = await UserSyncService.syncAuth0User(user);
      console.log('✅ User synced with database:', dbUser.email, 'Role:', dbUser.role, 'SchoolId:', dbUser.schoolId);
    } catch (syncError) {
      console.error('❌ Failed to sync user with database:', syncError);
      // Fallback to memory storage
      if (user.email) {
        try {
          const { storage } = await import('../storage');
          const memUser = await storage.getUserByEmail(user.email);
          if (memUser) {
            dbUser = memUser;
            console.log('✅ Loaded user from memory storage:', memUser.email, 'Role:', memUser.role, 'SchoolId:', memUser.schoolId);
          }
        } catch (memError) {
          console.error('❌ Failed to load from memory storage:', memError);
        }
      }
    }

    // Check for role override from role switcher
    const activeRoleHeader = req.headers['x-active-role'];

    // Use role from database if available, otherwise use user metadata, otherwise default
    let effectiveRole = dbUser?.role || user.user_metadata?.role || 'parent';
    
    // Check user_roles table for superAdmin role (multi-role system)
    // This is the source of truth for roles in the new system
    let userRoles: string[] = [];
    if (dbUser?.id) {
      try {
        const { getDb } = await import('../db');
        const schemaModule = await import('../../shared/schema');
        const drizzleModule = await import('drizzle-orm');
        
        const database = await getDb();
        const rolesResult = await database.select({
          role: schemaModule.userRoles.role
        }).from(schemaModule.userRoles).where(drizzleModule.eq(schemaModule.userRoles.userId, dbUser.id));
        
        userRoles = rolesResult.map((r: { role: string }) => r.role);
        console.log('📋 User roles from user_roles table:', userRoles);
        
        // If user has superAdmin in their roles, set effectiveRole to superAdmin for API access
        if (userRoles.some((r: string) => r.toLowerCase() === 'superadmin')) {
          effectiveRole = 'superAdmin';
          console.log('🔑 User has superAdmin role in user_roles table');
        }
      } catch (rolesError) {
        console.error('❌ Failed to fetch user_roles:', rolesError);
      }
    }

    // Allow role switching via header (for UI role switching)
    if (activeRoleHeader && userRoles.length > 0) {
      // Only allow switching to roles the user actually has
      const hasRole = userRoles.some(r => r.toLowerCase() === (activeRoleHeader as string).toLowerCase());
      if (hasRole) {
        effectiveRole = activeRoleHeader as string;
        console.log(`🔄 Role switched to: ${effectiveRole} for user: ${user.email}`);
      }
    }

    // Use the correct user ID field (id is the standard field for Supabase)
    const userIdentifier = user.id || user.email;

    // Include database user info if available
    req.user = {
      ...user,
      role: effectiveRole,
      id: userIdentifier,
      email: user.email,
      dbUser: dbUser // Include database user data
    };

    // Also set req.auth for compatibility with existing code
    req.auth = {
      userId: userIdentifier,
      supabaseId: userIdentifier,
      email: user.email,
      role: effectiveRole,
      isActive: dbUser?.isActive ?? true,
      schoolId: dbUser?.schoolId,
      dbUserId: dbUser?.id,
      payload: {
        email: user.email,
        role: effectiveRole
      }
    };

    console.log('✅ Token verified for user:', user.email);
    next();
  } catch (error) {
    console.error('❌ JWT verification error:', error);
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.auth) {
      console.log('❌ No auth info found');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRole = req.auth.role;
    // Collect all roles for the user at their current school (additive permissions model)
    // Prefer req.user.allRoles (set by supabaseAuth), fallback to active role only
    const allUserRoles: string[] = (req.user?.allRoles && Array.isArray(req.user.allRoles) && req.user.allRoles.length > 0)
      ? req.user.allRoles
      : (userRole ? [userRole] : []);
    console.log('🔒 Checking role access - User allRoles:', allUserRoles, 'Required:', allowedRoles);

    // Role hierarchy for inheritance checks
    const roleHierarchy: Record<string, string[]> = {
      'superAdmin': ['admin', 'schoolAdmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      'admin': ['schoolAdmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      'schoolAdmin': ['director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      'director': ['teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      'teacher': ['parent', 'student', 'learner'],
      'educator': ['parent', 'student', 'learner'],
      'mentor': ['student', 'learner'],
      'parent': ['student', 'learner'],
      'student': [],
      'learner': []
    };

    // Helper: check if a single role satisfies the requirement (direct match or hierarchy)
    const roleSatisfies = (role: string, required: string[]): boolean => {
      if (required.includes(role)) return true;
      const inherited = roleHierarchy[role] || [];
      return required.some(r => inherited.includes(r));
    };

    // Super admin in any role → full access
    if (allUserRoles.some(r => r.toLowerCase() === 'superadmin' || r === 'superAdmin')) {
      return next();
    }

    // Check if ANY of the user's roles (additive) satisfy the requirement
    const hasSatisfyingRole = allUserRoles.some(r => roleSatisfies(r, allowedRoles));

    if (hasSatisfyingRole) {
      return next();
    }

    console.log('🚫 Access denied for user allRoles:', allUserRoles);
    res.status(403).json({ message: 'Insufficient permissions' });
  };
};

// School-scoped authorization
export const requireSchoolAccess = (req: any, res: Response, next: NextFunction) => {
  if (!req.auth) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { role, schoolId } = req.auth;
  const requestedSchoolId = req.params.schoolId || req.body.schoolId;

  // Super admin and admin have access to all schools
  if (['superAdmin', 'admin'].includes(role)) {
    return next();
  }

  // School admin and staff can only access their own school
  if (['schoolAdmin', 'teacher'].includes(role)) {
    if (schoolId && schoolId.toString() === requestedSchoolId?.toString()) {
      return next();
    }
  }

  console.log('🚫 School access denied. Role:', role, 'SchoolId:', schoolId, 'RequestedSchoolId:', requestedSchoolId);
  res.status(403).json({ message: 'School access denied' });
};

// Export alias for backward compatibility
export const verifyAuth0Token = jwtCheck;
export const requireAdmin = requireRole(['admin', 'superAdmin', 'school-admin']);
export const requireEducator = requireRole(['admin', 'superAdmin', 'school-admin', 'teacher']);