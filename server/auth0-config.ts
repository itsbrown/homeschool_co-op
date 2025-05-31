import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// Log Auth0 environment variables for debugging
console.log('🔍 Auth0 Environment Variables:');
console.log('Audience:', process.env.AUTH0_API_IDENTIFIER);
console.log('Issuer:', `https://${process.env.AUTH0_DOMAIN}/`);
console.log('Domain:', process.env.AUTH0_DOMAIN);
console.log('Client ID:', process.env.AUTH0_CLIENT_ID);
console.log('Client Secret Set:', process.env.AUTH0_CLIENT_SECRET ? 'Yes' : 'No');

// Auth0 JWT verification middleware with detailed logging
export const jwtCheck = auth({
  audience: process.env.AUTH0_API_IDENTIFIER,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256'
}).unless({ 
  path: ['/api/ai/status', '/api/health'] // Skip auth for public routes
});

// Add custom middleware to log JWT verification results
export const jwtCheckWithLogging = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  console.log('🔐 JWT Check - Request:', req.method, req.path);
  console.log('🔐 JWT Check - Auth Header Present:', !!authHeader);
  
  if (authHeader) {
    console.log('🔐 JWT Check - Token Preview:', authHeader.substring(0, 20) + '...');
  }
  
  jwtCheck(req, res, (err) => {
    if (err) {
      console.log('❌ JWT Check - Verification Failed:', err.message);
      console.log('❌ JWT Check - Error Details:', {
        name: err.name,
        status: err.status,
        code: err.code
      });
      return res.status(401).json({ 
        error: 'Token verification failed', 
        message: err.message 
      });
    }
    
    console.log('✅ JWT Check - Token verified successfully');
    console.log('✅ JWT Check - User payload:', JSON.stringify((req as any).auth, null, 2));
    next();
  });
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  console.log('🔓 Optional Auth - Request:', req.method, req.path);
  console.log('🔓 Optional Auth - Token Present:', !!authHeader);
  
  if (!authHeader) {
    console.log('🔓 Optional Auth - No token, continuing without auth');
    return next();
  }
  
  // Token provided, verify it
  jwtCheckWithLogging(req, res, next);
};

// Role-based authorization middleware with comprehensive logging
export const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    console.log('👤 Role Check - Request:', req.method, req.path);
    console.log('👤 Role Check - Required Roles:', allowedRoles);
    
    // Check if user is authenticated
    if (!req.auth) {
      console.log('❌ Role Check - No auth object found');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    console.log('👤 Role Check - Auth Object:', JSON.stringify(req.auth, null, 2));
    
    // Extract role from various possible locations
    const possibleRoles = [
      req.auth?.role,
      req.auth?.payload?.role,
      req.auth?.payload?.roles,
      req.auth?.payload?.[`${process.env.AUTH0_API_IDENTIFIER}/roles`],
      req.auth?.payload?.['https://asa-platform.com/roles'],
      req.auth?.payload?.app_metadata?.roles,
      req.auth?.payload?.user_metadata?.role,
      req.headers['x-user-role'], // Fallback for testing
      'admin' // Default for development
    ];
    
    console.log('👤 Role Check - Possible Role Values:', possibleRoles);
    
    // Find the first non-undefined role
    let userRole = possibleRoles.find(role => role !== undefined);
    
    // Handle array of roles
    if (Array.isArray(userRole)) {
      console.log('👤 Role Check - User has multiple roles:', userRole);
      // Check if any of the user's roles match the required roles
      const hasMatchingRole = userRole.some(role => allowedRoles.includes(role));
      if (hasMatchingRole) {
        console.log('✅ Role Check - Access granted (array match)');
        return next();
      }
    } else if (userRole && allowedRoles.includes(userRole)) {
      console.log('✅ Role Check - Access granted:', userRole);
      return next();
    }
    
    console.log('❌ Role Check - Access denied');
    console.log('❌ Role Check - User Role:', userRole);
    console.log('❌ Role Check - Required Roles:', allowedRoles);
    console.log('❌ Role Check - Full Request Auth:', req.auth);
    
    res.status(403).json({ 
      message: 'Insufficient permissions',
      userRole: userRole,
      requiredRoles: allowedRoles
    });
  };
};

// Helper functions for specific roles
export const requireAdmin = requireRole(['admin']);
export const requireSchoolAdmin = requireRole(['admin', 'schoolAdmin']);
export const requireParent = requireRole(['admin', 'parent']);
export const requireEducator = requireRole(['admin', 'educator']);