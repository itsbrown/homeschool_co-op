import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';

/**
 * Extract school ID from PostgreSQL (not JWT metadata).
 * School admins: prefer schools.admin_id over stale users.school_id.
 */
async function extractSchoolId(req: any): Promise<number | null> {
  const userEmail = req.user?.email;
  const env = process.env.NODE_ENV || 'unknown';
  console.log(`🔍 [extractSchoolId] [ENV:${env}] Looking up school for user: ${userEmail}`);

  if (!userEmail) {
    console.error(`❌ [extractSchoolId] No user email in request`);
    return null;
  }

  try {
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      console.error(`❌ [extractSchoolId] User not found in database: ${userEmail}`);
      return null;
    }

    const schoolId = await resolveSchoolIdForUser(user);
    if (schoolId != null) {
      console.log(`🏫 [extractSchoolId] ✅ Resolved schoolId=${schoolId} for ${userEmail}`);
      return schoolId;
    }

    console.error(`❌ [extractSchoolId] No schoolId found for user ${userEmail}`);
  } catch (error) {
    console.error(`❌ [extractSchoolId] Error looking up school ID for user ${userEmail}:`, error);
  }

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
