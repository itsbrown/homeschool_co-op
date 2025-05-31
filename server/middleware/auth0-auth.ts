import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Auth0 configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_API_IDENTIFIER = process.env.AUTH0_API_IDENTIFIER;

// Log Auth0 configuration for debugging
console.log('🔍 Auth0 Middleware Configuration:');
console.log('Domain:', AUTH0_DOMAIN);
console.log('API Identifier:', AUTH0_API_IDENTIFIER);
console.log('JWKS URI:', `https://${AUTH0_DOMAIN}/.well-known/jwks.json`);

if (!AUTH0_DOMAIN || !AUTH0_API_IDENTIFIER) {
  console.error('❌ Missing Auth0 environment variables');
  throw new Error('AUTH0_DOMAIN and AUTH0_API_IDENTIFIER must be set in environment variables');
}

// JWKS client for token verification
const client = jwksClient({
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`
});

// Get signing key from Auth0
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// Extended Request interface to include user data
export interface AuthenticatedRequest extends Request {
  user?: any;
  auth?: {
    payload?: any;
  };
}

// Auth0 token verification middleware with detailed logging
export function verifyAuth0Token(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  console.log('🔒 Auth0 Verify - Request:', req.method, req.path);
  console.log('🔒 Auth0 Verify - Auth Header:', authHeader ? 'Present' : 'Missing');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Auth0 Verify - No valid Bearer token found');
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  console.log('🔒 Auth0 Verify - Token Preview:', token.substring(0, 20) + '...');

  jwt.verify(token, getKey, {
    audience: AUTH0_API_IDENTIFIER,
    issuer: `https://${AUTH0_DOMAIN}/`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('❌ Auth0 Verify - Token verification failed:', err.message);
      console.error('❌ Auth0 Verify - Error details:', {
        name: err.name,
        message: err.message,
        expiredAt: err.expiredAt,
        audience: AUTH0_API_IDENTIFIER,
        issuer: `https://${AUTH0_DOMAIN}/`
      });
      return res.status(401).json({ error: 'Invalid token', details: err.message });
    }

    console.log('✅ Auth0 Verify - Token verified successfully');
    console.log('✅ Auth0 Verify - Decoded payload:', JSON.stringify(decoded, null, 2));

    // Add user data to request object in the expected format
    req.auth = {
      payload: decoded as any
    };
    req.user = decoded as any;
    
    console.log('✅ Auth0 Verify - User data attached to request');
    next();
  });
}

// Optional authentication middleware (doesn't fail if no token)
export function optionalAuth0Token(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without user data
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    audience: AUTH0_API_IDENTIFIER,
    issuer: `https://${AUTH0_DOMAIN}/`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (!err) {
      req.auth = {
        payload: decoded as any
      };
      req.user = decoded as any;
    }
    next(); // Continue regardless of token validity
  });
}

// Role-based authorization middleware with detailed logging
export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    console.log('🛡️ Auth0 Role Check - Request:', req.method, req.path);
    console.log('🛡️ Auth0 Role Check - Required Roles:', roles);
    
    if (!req.user) {
      console.log('❌ Auth0 Role Check - No user object found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('🛡️ Auth0 Role Check - User object:', JSON.stringify(req.user, null, 2));
    
    // Check multiple possible role locations
    const possibleRoles = [
      req.user.role,
      req.user['custom:role'],
      req.user['app_metadata']?.role,
      req.user['app_metadata']?.roles,
      req.user[`${AUTH0_API_IDENTIFIER}/roles`],
      req.user['https://asa-platform.com/roles'],
      req.user.roles
    ];
    
    console.log('🛡️ Auth0 Role Check - Possible role values:', possibleRoles);
    
    const userRole = possibleRoles.find(role => role !== undefined);
    console.log('🛡️ Auth0 Role Check - Extracted user role:', userRole);
    
    // Handle array of roles
    if (Array.isArray(userRole)) {
      console.log('🛡️ Auth0 Role Check - User has multiple roles:', userRole);
      const hasMatchingRole = userRole.some(role => roles.includes(role));
      if (hasMatchingRole) {
        console.log('✅ Auth0 Role Check - Access granted (array match)');
        return next();
      }
    } else if (userRole && roles.includes(userRole)) {
      console.log('✅ Auth0 Role Check - Access granted:', userRole);
      return next();
    }
    
    console.log('❌ Auth0 Role Check - Access denied');
    console.log('❌ Auth0 Role Check - User Role:', userRole);
    console.log('❌ Auth0 Role Check - Required Roles:', roles);
    
    res.status(403).json({ 
      error: 'Insufficient permissions',
      userRole: userRole,
      requiredRoles: roles
    });
  };
}

// Admin-only middleware
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireRole(['admin', 'school_admin'])(req, res, next);
}

// Educator+ middleware (educator, admin, school_admin)
export function requireEducator(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireRole(['educator', 'admin', 'school_admin'])(req, res, next);
}