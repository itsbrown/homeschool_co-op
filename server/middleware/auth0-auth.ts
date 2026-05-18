import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { expandRolesForAuth, isSuperAdminRole, normalizeAuthRole } from '../lib/auth-roles';
import { UserSyncService } from '../services/userSyncService';
import { storage } from '../storage';

// Supabase JWT verification middleware with fallback for development
export const jwtCheck = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Test harness shortcut: allow x-test-user-email in NODE_ENV=test
    // so integration suites can authenticate without live Supabase tokens.
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-user-email']) {
      const testEmail = String(req.headers['x-test-user-email']);
      const { storage } = await import('../storage');
      const testUser = await storage.getUserByEmail(testEmail);
      if (testUser) {
        req.user = {
          id: testUser.supabaseId || String(testUser.id),
          email: testUser.email,
          role: testUser.role,
          dbUser: testUser,
        };
        req.auth = {
          userId: testUser.supabaseId || String(testUser.id),
          supabaseId: testUser.supabaseId || String(testUser.id),
          email: testUser.email,
          role: testUser.role,
          isActive: testUser.isActive ?? true,
          schoolId: testUser.schoolId,
          dbUserId: testUser.id,
          payload: {
            email: testUser.email,
            role: testUser.role,
          },
        };
        return next();
      }
    }

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
    
    // Fetch all roles for this user via storage (additive permissions model)
    // This is the source of truth for roles in the new system
    let userRoles: string[] = [];
    if (dbUser?.id) {
      try {
        const userRoleEntries = await storage.getUserRolesByUserId(dbUser.id);
        const roleSet = new Set<string>();
        for (const entry of userRoleEntries) {
          const norm = normalizeAuthRole(entry.role);
          if (norm) roleSet.add(norm);
          if (entry.role?.trim()) roleSet.add(entry.role.trim());
        }
        if (dbUser.role) {
          const norm = normalizeAuthRole(dbUser.role);
          if (norm) roleSet.add(norm);
        }
        if (dbUser.activeRole) {
          const norm = normalizeAuthRole(dbUser.activeRole);
          if (norm) roleSet.add(norm);
        }
        userRoles = Array.from(roleSet);
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

    // Allow role switching via header (for UI role switching — display preference only, not authz)
    if (activeRoleHeader && userRoles.length > 0) {
      // Only allow switching to roles the user actually has
      const hasRole = userRoles.some(r => r.toLowerCase() === (activeRoleHeader as string).toLowerCase());
      if (hasRole) {
        effectiveRole = activeRoleHeader as string;
        console.log(`🔄 Role switched to: ${effectiveRole} for user: ${user.email}`);
      }
    }

    // Use DB integer ID when available (required for all DB queries downstream)
    const userIdentifier = dbUser?.id ?? user.id ?? user.email;

    // Include database user info and all roles for additive-permissions checks
    req.user = {
      ...user,
      role: dbUser?.role ?? effectiveRole,
      id: userIdentifier,
      email: user.email,
      allRoles: userRoles, // All roles from user_roles table — used by requireRole for authz
      dbUser: dbUser,
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

    // Always evaluate against req.user.allRoles (populated from user_roles table by supabaseAuth).
    // activeRole / effectiveRole is intentionally excluded here — it is a UI display preference only.
    // Fall back to req.user.role (users.role column) only when user_roles is empty (e.g. legacy user
    // with no entries in the user_roles table yet), so they are not completely locked out.
    const allUserRoles: string[] = expandRolesForAuth(
      req.user?.allRoles && Array.isArray(req.user.allRoles) && req.user.allRoles.length > 0
        ? req.user.allRoles
        : req.user?.role
          ? [req.user.role]
          : [],
    );
    const normalizedAllowed = expandRolesForAuth(allowedRoles);
    console.log('🔒 Checking role access - User allRoles:', allUserRoles, 'Required:', normalizedAllowed);

    // Role hierarchy for inheritance checks (canonical keys only)
    const roleHierarchy: Record<string, string[]> = {
      superAdmin: ['admin', 'schoolAdmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      admin: ['schoolAdmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      schoolAdmin: ['director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      director: ['teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
      teacher: ['parent', 'student', 'learner'],
      educator: ['parent', 'student', 'learner'],
      mentor: ['student', 'learner'],
      parent: ['student', 'learner'],
      student: [],
      learner: [],
    };

    const roleSatisfies = (role: string, required: string[]): boolean => {
      const norm = normalizeAuthRole(role);
      if (!norm) return false;
      if (required.includes(norm)) return true;
      const inherited = roleHierarchy[norm] || [];
      return required.some((r) => inherited.includes(r));
    };

    if (allUserRoles.some((r) => isSuperAdminRole(r))) {
      return next();
    }

    const hasSatisfyingRole = allUserRoles.some((r) => roleSatisfies(r, normalizedAllowed));

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
export const requireAdmin = requireRole(['admin', 'superAdmin', 'schoolAdmin']);
export const requireEducator = requireRole(['admin', 'superAdmin', 'schoolAdmin', 'educator', 'teacher']);