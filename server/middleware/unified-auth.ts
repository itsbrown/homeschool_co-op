import { Request, Response, NextFunction } from 'express';

// Unified authentication middleware
export const unifiedAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check for Firebase auth header
  const authHeader = req.headers.authorization;
  const firebaseUser = req.headers['x-firebase-user'];
  
  // For development, we'll be permissive
  // In production, verify Firebase tokens here
  if (authHeader || firebaseUser) {
    return next();
  }
  
  // Allow access for school admin routes during development
  if (req.path.startsWith('/api/schools/') || req.path.startsWith('/api/school-admin/')) {
    return next();
  }
  
  res.status(401).json({ message: "Unauthorized" });
};

// Role-based authorization
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // For development, skip role checking
    // In production, check user role from Firebase token
    next();
  };
};

// Specific role helpers
export const requireAdmin = requireRole(['admin']);
export const requireSchoolAdmin = requireRole(['admin', 'schoolAdmin']);
export const requireParent = requireRole(['admin', 'parent']);