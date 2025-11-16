/**
 * Authentication Utility Functions
 * Centralized helpers for extracting data from Supabase JWT tokens
 */

import { Request } from 'express';

/**
 * Supabase JWT Payload Structure
 */
export interface SupabaseAuthPayload {
  sub: string;  // User ID
  email?: string;
  email_verified?: boolean;
  name?: string;
  phone_verified?: boolean;
  role?: string;
  school_id?: number;
  [key: string]: any;
}

/**
 * Extended Request type with Supabase auth
 */
export interface AuthenticatedRequest extends Request {
  auth?: {
    payload?: SupabaseAuthPayload;
    [key: string]: any;
  };
  user?: {
    email?: string;
    sub?: string;
    [key: string]: any;
  };
}

/**
 * Extract email from Supabase JWT token, legacy Auth0 token, or session
 */
export function getAuthEmail(req: AuthenticatedRequest): string | undefined {
  // Try Supabase JWT payload first
  if (req.auth?.payload?.email) {
    return req.auth.payload.email;
  }
  
  // Fallback to legacy Auth0 user object
  if (req.user?.email) {
    return req.user.email;
  }
  
  // Fallback to session-based auth (for tests and legacy support)
  const session = (req as any).session;
  if (session?.userId) {
    // Session doesn't store email directly, but req.user should be set by middleware
    return undefined;
  }
  
  return undefined;
}

/**
 * Extract user ID from Supabase JWT token, legacy Auth0 token, or session
 */
export function getAuthUserId(req: AuthenticatedRequest): string | undefined {
  // Try Supabase JWT payload first
  if (req.auth?.payload?.sub) {
    return req.auth.payload.sub;
  }
  
  // Fallback to legacy Auth0 user object
  if (req.user?.sub) {
    return req.user.sub;
  }
  
  // Another fallback for userId field
  if ((req as any).auth?.userId) {
    return (req as any).auth.userId;
  }
  
  // Fallback to session-based auth (for tests and legacy support)
  const session = (req as any).session;
  if (session?.userId) {
    return String(session.userId);
  }
  
  return undefined;
}

/**
 * Extract role from Supabase JWT token or session
 */
export function getAuthRole(req: AuthenticatedRequest): string | undefined {
  // Try JWT payload first
  if (req.auth?.payload?.role) {
    return req.auth.payload.role;
  }
  
  // Fallback to session-based auth (for tests and legacy support)
  const session = (req as any).session;
  if (session?.userRole) {
    return session.userRole;
  }
  
  return undefined;
}

/**
 * Extract school ID from Supabase JWT token
 */
export function getAuthSchoolId(req: AuthenticatedRequest): number | undefined {
  const schoolId = req.auth?.payload?.school_id;
  return schoolId ? Number(schoolId) : undefined;
}

/**
 * Check if request is authenticated (has valid JWT)
 */
export function isAuthenticated(req: AuthenticatedRequest): boolean {
  return !!(getAuthEmail(req) || getAuthUserId(req));
}

/**
 * Require authentication - throws error if not authenticated
 */
export function requireAuth(req: AuthenticatedRequest): void {
  if (!isAuthenticated(req)) {
    throw new Error('Not authenticated');
  }
}
