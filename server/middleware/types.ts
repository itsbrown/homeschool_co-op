import { Request } from 'express';

/**
 * Extended Request interface with all middleware-added properties
 * Centralizes type definitions to avoid duplication and drift
 */
declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      payload?: {
        [key: string]: any;
        sub: string;
        email: string;
        role?: string;
        school_id?: number | null;
        name?: string;
        permissions?: any;
      };
      // Direct fields for requireRole middleware compatibility
      role?: string;
      email?: string;
      schoolId?: number | null;
      dbUserId?: number | null;
    };
    user?: {
      id: number;  // Always normalized to DB integer ID in supabaseAuth
      email: string;
      sub: string;  // Supabase UUID (or DB ID string for session auth)
      role?: string;
      schoolId?: number | null;
      activeRoleId?: number | null;
      permissions?: any;
      name?: string;
      allRoles?: string[];  // All roles the user holds at their current school (additive permissions)
      /** True when DB was unavailable and auth used app_metadata fallback (id may be null). */
      degradedDbMode?: boolean;
    };
    schoolId?: string | number;
  }
}
