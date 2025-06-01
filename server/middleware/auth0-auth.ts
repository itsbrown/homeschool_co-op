import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';

// Supabase JWT verification middleware
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

    // Get user from database to get proper role
    const pool = require('../db/pgClient');
    let client;
    try {
      client = await pool.connect();
      const userResult = await client.query(
        'SELECT * FROM users.accounts WHERE email = $1 OR firebase_uid = $2',
        [user.email, user.id]
      );
      const dbUser = userResult.rows[0];
      
      // Attach user info to request
      req.auth = {
        userId: user.id,
        supabaseId: user.id,
        email: user.email,
        role: dbUser?.role || 'school_admin', // Use DB role if available
        schoolId: dbUser?.school_id,
        isActive: true,
        dbUser: dbUser
      };
    } catch (dbError) {
      console.warn('⚠️ Could not fetch user from database, using default role:', dbError.message);
      req.auth = {
        userId: user.id,
        supabaseId: user.id,
        email: user.email,
        role: 'school_admin', // Default fallback
        isActive: true
      };
    } finally {
      if (client) client.release();
    }

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