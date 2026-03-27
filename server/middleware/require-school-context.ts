import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * [FIX:v3.0] Extract school ID from PostgreSQL database (authoritative source)
 * CRITICAL: JWT tokens can have stale school_id values - ALWAYS query database
 * 
 * Priority:
 * 1. user.schoolId (legacy field) - most users have this set
 * 2. activeRoleId lookup - for multi-role users with null schoolId
 */
async function extractSchoolId(req: any): Promise<number | null> {
  const userEmail = req.user?.email;
  const env = process.env.NODE_ENV || 'unknown';
  console.log(`🔍 [extractSchoolId] [ENV:${env}] [FIX:v3.0-middleware] Looking up school for user: ${userEmail}`);
  
  // CRITICAL: PostgreSQL database is the ONLY source of truth for school_id
  // JWT tokens can have stale metadata (e.g., school_id=1 when database has school_id=2)
  
  if (!userEmail) {
    console.error(`❌ [extractSchoolId] No user email in request`);
    return null;
  }
  
  try {
    // Get user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      console.error(`❌ [extractSchoolId] User not found in database: ${userEmail}`);
      return null;
    }
    
    console.log(`👤 [extractSchoolId] [FIX:v3.0] User found - ID: ${user.id}, schoolId: ${user.schoolId}, activeRoleId: ${user.activeRoleId}`);
    
    // PRODUCTION-SAFE: Prioritize legacy schoolId field first
    if (user.schoolId !== null && user.schoolId !== undefined && user.schoolId > 0) {
      console.log(`🏫 [extractSchoolId] ✅ [FIX:v3.0] Using direct user.schoolId from DB: ${user.schoolId}`);
      return user.schoolId;
    } else {
      console.log(`⚠️  [extractSchoolId] [FIX:v3.0] Skipping user.schoolId (value: ${user.schoolId}) - falling back to activeRoleId lookup`);
    }
    
    // Multi-role support: Get school ID from active role
    if (user.activeRoleId) {
      const db = await getDb();
      const activeRoles = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.id, user.activeRoleId))
        .limit(1);
      
      if (activeRoles.length > 0 && activeRoles[0].schoolId) {
        console.log(`🏫 [extractSchoolId] ✅ Using active role school ID: ${activeRoles[0].schoolId}`);
        return activeRoles[0].schoolId;
      } else {
        console.warn(`⚠️  [extractSchoolId] Active role ${user.activeRoleId} not found or has no schoolId`);
      }
    } else {
      console.warn(`⚠️  [extractSchoolId] No activeRoleId set for user ${userEmail}`);
    }
    
    console.error(`❌ [extractSchoolId] No schoolId found anywhere for user ${userEmail}`);
  } catch (error) {
    console.error(`❌ [extractSchoolId] Error looking up school ID for user ${userEmail}:`, error);
  }
  
  console.error(`❌ [extractSchoolId] FINAL: Returning null for user ${userEmail}`);
  return null;
}

/**
 * Express middleware that injects req.schoolId from PostgreSQL database
 * Apply this middleware AFTER supabaseAuth on all school-scoped routes
 *
 * Role access model (additive roles — Phase 2):
 *   - superAdmin / admin: always pass (no school restriction needed)
 *   - schoolAdmin: full school-scoped access (existing behavior, unchanged)
 *   - director (single-role OR additive via allRoles): treated identically to schoolAdmin
 *     This is the Phase 2 extension. Covers:
 *       - userRole === 'director' (single-role director)
 *       - req.user.allRoles includes 'director' (multi-role: e.g., parent + director)
 *   - educator (teacher, single-role only): view-only — blocked upstream by requireRole
 *
 * Test matrix (expected behavior):
 *   - Single-role educator: view-only, no schedule builder write access (blocked by requireRole)
 *   - Multi-role parent + director: full scheduler access (passes via allRoles includes 'director')
 *   - schoolAdmin: behavior completely unchanged (passes via userRole check)
 *
 * Usage:
 *   router.get("/students", supabaseAuth, requireRole([...]), requireSchoolContext, async (req: any, res) => {
 *     const schoolId = req.schoolId; // Always populated from database
 *   });
 */
export async function requireSchoolContext(req: any, res: Response, next: NextFunction) {
  try {
    const userRole: string = req.auth?.role || req.user?.role || '';
    const allRoles: string[] = req.user?.allRoles || [];

    // Roles that bypass school-scoped restrictions entirely
    const isSuperAdmin = ['superAdmin', 'admin'].includes(userRole);

    // Phase 2: Director is treated the same as schoolAdmin for school-scoped access.
    // Check both the single-role path (userRole) and the additive-roles path (allRoles).
    // Pattern: if (['schoolAdmin', 'director'].includes(userRole) || req.user.allRoles?.includes('director'))
    const hasSchoolAdminAccess =
      isSuperAdmin ||
      ['schoolAdmin', 'director'].includes(userRole) ||
      allRoles.includes('director');

    if (!hasSchoolAdminAccess) {
      console.log(`⚠️  [requireSchoolContext] Role "${userRole}" does not have school-admin-level access; proceeding as school-scoped observer`);
    }

    // Log director access for observability (development only)
    if (userRole === 'director' || allRoles.includes('director')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Director access granted for user', req.user?.id);
      }
    }

    const schoolId = await extractSchoolId(req);
    
    if (schoolId === null) {
      return res.status(400).json({ 
        message: "School ID not found in database",
        hint: "Contact support if this persists"
      });
    }
    
    // Inject schoolId into request for downstream handlers (as STRING to match storage contracts)
    req.schoolId = String(schoolId);
    // Expose whether user has school-admin-level access for downstream handlers
    req.hasSchoolAdminAccess = hasSchoolAdminAccess;
    console.log(`✅ [requireSchoolContext] Injected req.schoolId="${req.schoolId}" (string) for user ${req.user?.email}`);
    next();
  } catch (error) {
    console.error('[requireSchoolContext] Error extracting school ID:', error);
    return res.status(500).json({ message: "Error determining school context" });
  }
}
