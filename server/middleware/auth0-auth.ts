import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';

// Supabase JWT verification middleware with fallback for development
export const jwtCheck = async (req: any, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Development mode: Allow bypass with default user
      if (process.env.NODE_ENV === 'development') {
        console.log('🛠️ Development mode: Using default user for unauthenticated request');
        req.auth = {
          userId: 'dev-user',
          supabaseId: 'dev-user',
          email: 'coreycreates@gmail.com',
          role: 'parent',
          isActive: true,
          payload: {
            email: 'coreycreates@gmail.com',
            role: 'parent'
          }
        };
        return next();
      }
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    console.log('🔍 Verifying Supabase token...');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('❌ Token verification failed:', error?.message);
      
      // Development fallback
      if (process.env.NODE_ENV === 'development') {
        console.log('🛠️ Development mode: Using fallback user due to token error');
        req.auth = {
          userId: 'dev-user',
          supabaseId: 'dev-user',
          email: 'coreycreates@gmail.com',
          role: 'parent',
          isActive: true,
          payload: {
            email: 'coreycreates@gmail.com',
            role: 'parent'
          }
        };
        return next();
      }
      
      return res.status(401).json({ message: 'Token verification failed' });
    }

    console.log('✅ Token verified successfully for:', user.email);
    console.log('🔍 User object fields:', Object.keys(user));
    console.log('🔍 User ID field:', user.id, 'Sub field:', user.sub);

    // Check for role override from role switcher
    const activeRoleHeader = req.headers['x-active-role'];
    const multiRoleUsers = ['coreycreates@gmail.com'];
    let effectiveRole = user.user_metadata?.role || 'parent';

    // Allow role switching for multi-role users
    if (user.email && multiRoleUsers.includes(user.email) && activeRoleHeader) {
      const allowedRoles = ['parent', 'school_admin'];
      if (allowedRoles.includes(activeRoleHeader as string)) {
        effectiveRole = activeRoleHeader as string;
        console.log(`🔄 Role switched to: ${effectiveRole} for user: ${user.email}`);
      }
    }

    // Use the correct user ID field (sub is the standard field for Supabase)
    const userIdentifier = user.id || user.sub || user.email;
    
    // Use the role from the token metadata - no database lookup needed
    req.user = {
      ...user,
      role: effectiveRole,
      id: userIdentifier,
      email: user.email
    };

    // Also set req.auth for compatibility with existing code
    req.auth = {
      userId: userIdentifier,
      supabaseId: userIdentifier,
      email: user.email,
      role: effectiveRole,
      isActive: true,
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
    console.log('🔒 Checking role access - User:', userRole, 'Required:', allowedRoles);

    // Super admin has access to everything
    if (userRole === 'superAdmin') {
      return next();
    }

    // Check if user's role is in allowed roles
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Check for hierarchical permissions
    const roleHierarchy = {
      'superAdmin': ['admin', 'schoolAdmin', 'teacher', 'parent', 'student'],
      'admin': ['schoolAdmin', 'teacher', 'parent', 'student'],
      'schoolAdmin': ['teacher', 'parent', 'student'],
      'teacher': ['parent', 'student'],
      'parent': ['student'],
      'student': []
    };

    const userPermissions = roleHierarchy[userRole as keyof typeof roleHierarchy] || [];
    const hasHierarchicalAccess = allowedRoles.some(role => userPermissions.includes(role));

    if (hasHierarchicalAccess) {
      return next();
    }

    console.log('🚫 Access denied for user role:', userRole);
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

  console.log('🚫 School access denied');
  res.status(403).json({ message: 'School access denied' });
};

// Export alias for backward compatibility
export const verifyAuth0Token = jwtCheck;
export const requireAdmin = requireRole(['admin', 'superAdmin', 'school-admin']);
export const requireEducator = requireRole(['admin', 'superAdmin', 'school-admin', 'teacher']);