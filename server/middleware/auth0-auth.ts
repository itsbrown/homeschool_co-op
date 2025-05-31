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

// Auth0 token verification middleware
export function verifyAuth0Token(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  jwt.verify(token, getKey, {
    audience: AUTH0_API_IDENTIFIER,
    issuer: `https://${AUTH0_DOMAIN}/`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Add user data to request object in the expected format
    req.auth = {
      payload: decoded as any
    };
    req.user = decoded as any;
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

// Role-based authorization middleware
export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role || req.user['custom:role'] || req.user['app_metadata']?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
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