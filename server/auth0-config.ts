import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// Log Auth0 environment variables for debugging
console.log('🔍 Auth0 Environment Variables:');
console.log('Audience:', process.env.AUTH0_API_IDENTIFIER);
console.log('Issuer:', `https://${process.env.AUTH0_DOMAIN}/`);
console.log('Domain:', process.env.AUTH0_DOMAIN);
console.log('Client ID:', process.env.AUTH0_CLIENT_ID);
console.log('Client Secret Set:', process.env.AUTH0_CLIENT_SECRET ? 'Yes' : 'No');

// Auth0 JWT verification middleware
export const jwtCheck = auth({
  audience: process.env.AUTH0_API_IDENTIFIER,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256'
});

// Optional authentication - doesn't fail if no token
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    // No token provided, continue without auth
    return next();
  }
  
  // Token provided, verify it
  jwtCheck(req, res, next);
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    // For development, extract role from user data or use default
    const userRole = req.auth?.role || req.headers['x-user-role'] || 'admin';
    
    if (allowedRoles.includes(userRole)) {
      return next();
    }
    
    res.status(403).json({ message: 'Insufficient permissions' });
  };
};

// Helper functions for specific roles
export const requireAdmin = requireRole(['admin']);
export const requireSchoolAdmin = requireRole(['admin', 'schoolAdmin']);
export const requireParent = requireRole(['admin', 'parent']);
export const requireEducator = requireRole(['admin', 'educator']);