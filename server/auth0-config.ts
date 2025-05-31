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
  path: ['/api/ai/status', '/api/health', ...(process.env.NODE_ENV === 'development' ? ['/api/*'] : [])] // Skip auth for all API routes in development
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

// Simplified role-based authorization with default access
export const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    console.log('👤 Role Check - Request:', req.method, req.path);
    console.log('👤 Role Check - Required Roles:', allowedRoles);
    
    // Check if user is authenticated
    if (!req.auth) {
      console.log('❌ Role Check - No auth object found');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // For development: always allow access if user is authenticated
    if (process.env.NODE_ENV === 'development') {
      console.log('🛠️ Development Mode - Allowing access');
      return next();
    }
    
    // Extract user role with simplified logic
    const userRole = req.auth?.payload?.role || 
                    req.auth?.payload?.['https://asa-platform.com/roles']?.[0] ||
                    req.auth?.role ||
                    'parent'; // Default role
    
    console.log('👤 Role Check - User Role:', userRole);
    
    // Check if user role is allowed
    if (allowedRoles.includes(userRole) || allowedRoles.includes('parent')) {
      console.log('✅ Role Check - Access granted');
      return next();
    }
    
    console.log('❌ Role Check - Access denied');
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