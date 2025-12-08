import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { storage } from '../storage';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔐 PHASE 2 FEATURE FLAG: Set to 'false' to rollback to Phase 1 behavior
const PHASE_2_APP_METADATA_ENABLED = process.env.PHASE_2_APP_METADATA_ENABLED !== 'false';

if (PHASE_2_APP_METADATA_ENABLED) {
  console.log('✅ Phase 2 app_metadata mode ENABLED (default)');
} else {
  console.log('⚠️ Phase 2 app_metadata mode DISABLED - using Phase 1 user_metadata only');
}

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Track users whose metadata has been synced to avoid repeated warnings
const metadataSyncedUsers = new Set<string>();

/**
 * AuthenticatedRequest extends Express Request with all middleware-added properties
 * Type definition is centralized in server/middleware/types.ts to avoid duplication
 */
export interface AuthenticatedRequest extends Request {
  // All properties are inherited from the module augmentation in types.ts
  // This interface exists for backwards compatibility and explicit type checking
}

export const supabaseAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    console.log('🔐 supabaseAuth middleware - Path:', req.path);
    console.log('🔐 supabaseAuth middleware - Authorization header:', authHeader ? 'PRESENT' : 'MISSING');
    console.log('🔐 supabaseAuth middleware - Session:', (req as any).session?.userId ? 'PRESENT' : 'MISSING');
    console.log('🔐 supabaseAuth middleware - Session data:', JSON.stringify({
      userId: (req as any).session?.userId,
      userRole: (req as any).session?.userRole,
      activeRole: (req as any).session?.activeRole
    }));
    
    // Check for session-based authentication first (for tests and legacy support)
    // Fall back to storage lookup if userRole is missing
    if ((req as any).session?.userId) {
      console.log('✅ Session with userId detected:', (req as any).session.userId);
      
      // Try to get user from storage
      try {
        const user = await storage.getUser((req as any).session.userId);
        
        if (user) {
          console.log('✅ Session user found in storage:', user.email, 'role:', user.role);
          
          // Set up auth context to match Supabase structure with full user data
          // Use numeric database ID directly (no string conversion)
          // NOTE: For session auth, we don't have a Supabase UUID, so we use the DB ID as sub
          // This is acceptable for session-based auth (tests and legacy support)
          req.user = {
            id: user.id, // Numeric database ID
            email: user.email,
            sub: user.supabaseId || String(user.id), // Use Supabase UUID if available, fallback to DB ID
            role: user.role,
            permissions: user.permissions,
            schoolId: user.schoolId,
            name: user.name,
          };
          
          req.auth = {
            payload: {
              sub: user.supabaseId || String(user.id), // Use Supabase UUID if available, fallback to DB ID
              email: user.email,
              role: user.role,
              school_id: user.schoolId,
              name: user.name,
              permissions: user.permissions,
            },
          };
          
          // Also populate userRole in session if missing
          if (!(req as any).session.userRole) {
            (req as any).session.userRole = user.role;
          }
          
          return next();
        } else {
          console.log('⚠️ Session user ID', (req as any).session.userId, 'not found in storage, continuing to token check');
        }
      } catch (error) {
        console.error('Error loading session user:', error);
        // Continue to token check
      }
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ supabaseAuth - Rejecting: Missing or invalid authorization header and no valid session');
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    console.log('🔐 supabaseAuth - Token extracted, length:', token.length);

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Handle deleted/stale user tokens more gracefully
      if (error && (error as any).code === 'user_not_found') {
        console.log('🔄 Stale token: User was deleted from Supabase, token still cached in browser');
      } else {
        console.error('Supabase auth error:', error);
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // 🔐 PHASE 2 HYBRID MODE: Check app_metadata first (new users), then user_metadata (existing users)
    // Feature flag allows instant rollback to Phase 1 if needed
    const hasAppMetadata = user.app_metadata && (user.app_metadata.role || user.app_metadata.school_id);
    const metadataSource = hasAppMetadata && PHASE_2_APP_METADATA_ENABLED ? 'app_metadata' : 'user_metadata';
    
    if (hasAppMetadata && PHASE_2_APP_METADATA_ENABLED) {
      console.log(`✅ Phase 2: Using app_metadata for ${user.email} (secure, immutable)`);
    }

    // 🔒 SECURITY MONITORING & AUTO-SYNC: Detect and correct metadata mismatches
    // This protects against user_metadata tampering by ensuring database is source of truth
    // CRITICAL: We need to fetch dbUser FIRST to set req.user.id to the database integer ID
    let dbUserId: number | null = null;
    let dbUserData: any = null;
    if (user.email) {
      try {
        const dbUser = await storage.getUserByEmail(user.email);
        
        if (dbUser) {
          // Store database user data for req.user
          dbUserId = dbUser.id;
          dbUserData = dbUser;
          
          // For Phase 2 users (app_metadata), check if database matches app_metadata
          // For existing users (user_metadata), auto-sync from database
          const currentSchoolId = user.app_metadata?.school_id || user.user_metadata?.school_id;
          const currentRole = user.app_metadata?.role || user.user_metadata?.role;
          const dbSchoolId = dbUser.schoolId;
          const dbRole = dbUser.role;

          const schoolIdMismatch = currentSchoolId !== undefined && currentSchoolId !== dbSchoolId;
          const roleMismatch = currentRole !== undefined && currentRole !== dbRole;
          const missingSchoolId = !currentSchoolId && dbSchoolId;
          const missingRole = !currentRole && dbRole;

          // 🚨 SECURITY ALERT: Log potential tampering attempts (only once per user per server session)
          const userKey = `${user.email}-${currentSchoolId}-${currentRole}`;
          const alreadySynced = metadataSyncedUsers.has(userKey);
          
          if ((schoolIdMismatch || roleMismatch) && !alreadySynced) {
            console.warn(`🚨 SECURITY: Metadata mismatch detected for ${user.email} (source: ${metadataSource})`);
            console.warn(`   Current school_id: ${currentSchoolId} vs DB: ${dbSchoolId}`);
            console.warn(`   Current role: ${currentRole} vs DB: ${dbRole}`);
            console.warn(`   This could indicate tampering or outdated token. Auto-correcting...`);
          }

          // Auto-fix for user_metadata users (Phase 1)
          // Phase 2 users with app_metadata should already be correct, but log if not
          if (missingSchoolId || missingRole || schoolIdMismatch || roleMismatch) {
            if (!hasAppMetadata) {
              // Only update Supabase if we haven't already synced this user
              if (!alreadySynced) {
                // Existing user with user_metadata - auto-sync from database
                if (missingSchoolId || missingRole) {
                  console.log(`⚠️ Auto-fixing missing user_metadata for ${user.email}`);
                }
                
                // Update Supabase user metadata to match database (source of truth)
                const { data, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
                  user_metadata: {
                    ...user.user_metadata,
                    school_id: dbUser.schoolId,
                    role: dbUser.role,
                    name: dbUser.name
                  }
                });
                
                if (updateError) {
                  console.error(`❌ Failed to update user_metadata for ${user.email}:`, updateError.message);
                } else {
                  console.log(`✅ user_metadata synced for ${user.email}: school_id=${dbUser.schoolId}, role=${dbUser.role}`);
                  if (schoolIdMismatch || roleMismatch) {
                    console.log(`   🔒 Corrected mismatch - user should log out and back in to refresh token`);
                  }
                  // Mark this user as synced to avoid repeated updates
                  metadataSyncedUsers.add(userKey);
                }
              }
            } else {
              // Phase 2 user with app_metadata mismatch - this shouldn't happen
              if (!alreadySynced) {
                console.error(`⚠️ Phase 2 user ${user.email} has app_metadata mismatch with database!`);
                console.error(`   app_metadata should be admin-only and match database. Investigate!`);
                metadataSyncedUsers.add(userKey);
              }
            }
            
            // Apply corrections to current request immediately (use database as source of truth)
            if (req.auth?.payload) {
              req.auth.payload.school_id = dbUser.schoolId;
              req.auth.payload.role = dbUser.role;
              req.auth.payload.name = dbUser.name;
            }
          }
        }
      } catch (syncError) {
        console.error('Error during metadata sync:', syncError);
      }
    }

    // Set req.user with database integer ID (not Supabase UUID)
    // This is CRITICAL for multi-role API endpoints that query by user ID
    // Also populate role, schoolId, permissions, and name from dbUser
    
    // AUTO-CREATE: If user authenticated via Supabase but doesn't exist in database, create them
    // SECURITY: Only trust app_metadata (admin-only) for role/school, NEVER user_metadata
    // New users default to 'parent' role with no school - role elevation requires admin action
    if (dbUserId === null && user.email) {
      console.log(`🔄 Auto-creating database record for Supabase user: ${user.email}`);
      try {
        // SECURITY: Only trust app_metadata (set by admin) for privileged fields
        // user_metadata is client-modifiable and MUST NOT be trusted for role/school assignment
        // Default to 'parent' role - any elevation requires admin action via proper channels
        const rawRole = user.app_metadata?.role || 'parent';
        const rawSchoolId = user.app_metadata?.school_id;
        
        // Validate role is a known safe value (defense in depth)
        const allowedRoles = ['parent', 'student', 'learner'];
        const defaultRole = allowedRoles.includes(rawRole) ? rawRole : 'parent';
        
        // Log if we're ignoring an elevated role from metadata (potential attack indicator)
        if (rawRole !== defaultRole) {
          console.warn(`🚨 SECURITY: Ignoring elevated role '${rawRole}' for new user ${user.email} - defaulting to 'parent'`);
        }
        
        // SECURITY: Validate schoolId is a valid number or null
        // Never trust non-numeric values from metadata
        let safeSchoolId: number | null = null;
        if (rawSchoolId !== undefined && rawSchoolId !== null) {
          const parsedSchoolId = typeof rawSchoolId === 'number' ? rawSchoolId : parseInt(String(rawSchoolId), 10);
          if (!isNaN(parsedSchoolId) && parsedSchoolId > 0) {
            safeSchoolId = parsedSchoolId;
          } else {
            console.warn(`🚨 SECURITY: Ignoring invalid school_id '${rawSchoolId}' for new user ${user.email} - defaulting to null`);
          }
        }
        
        // Create the user in the database
        const newUser = await storage.createUser({
          email: user.email,
          username: user.email.split('@')[0],
          name: user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0],
          password: '', // Not used with Supabase auth
          role: defaultRole,
          schoolId: safeSchoolId,
          supabaseId: user.id,
          avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          isActive: true,
        });
        
        if (newUser) {
          dbUserId = newUser.id;
          dbUserData = newUser;
          console.log(`✅ Created database record for ${user.email} with ID: ${newUser.id}, role: ${defaultRole}`);
          
          // Also create user_roles entry for the new user with duplicate-key handling
          try {
            await storage.createUserRole({
              userId: newUser.id,
              role: defaultRole,
              schoolId: safeSchoolId,
              isPrimary: true
            });
            console.log(`✅ Created user_role for ${user.email}: ${defaultRole}`);
          } catch (roleError: any) {
            // Handle race condition for user_roles as well
            if (roleError?.code === '23505' || roleError?.message?.includes('duplicate key')) {
              console.log(`⚠️ user_role already exists for ${user.email} - fetching existing roles`);
            } else {
              console.error(`⚠️ Failed to create user_role for ${user.email}:`, roleError);
            }
          }
          
          // Always re-fetch roles and set activeRoleId (handles both new and race-condition cases)
          try {
            const roles = await storage.getUserRolesByUserId(newUser.id);
            if (roles.length > 0 && !newUser.activeRoleId) {
              await storage.updateUser(newUser.id, { activeRoleId: roles[0].id });
              console.log(`✅ Set activeRoleId for ${user.email}: ${roles[0].id}`);
            }
          } catch (rolesFetchError) {
            console.error(`⚠️ Failed to fetch/update roles for ${user.email}:`, rolesFetchError);
          }
        }
      } catch (createError: any) {
        // Handle race condition: concurrent requests may cause duplicate key error
        // In this case, re-fetch the user instead of returning 500
        if (createError?.code === '23505' || createError?.message?.includes('duplicate key')) {
          console.log(`⚠️ Race condition detected for ${user.email} - re-fetching user`);
          try {
            const existingUser = await storage.getUserByEmail(user.email!);
            if (existingUser) {
              dbUserId = existingUser.id;
              dbUserData = existingUser;
              console.log(`✅ Re-fetched existing user after race condition: ${user.email}`);
            }
          } catch (refetchError) {
            console.error(`❌ Failed to re-fetch user after race condition:`, refetchError);
          }
        } else {
          console.error(`❌ Failed to auto-create database record for ${user.email}:`, createError);
          return res.status(500).json({ 
            error: 'Failed to create user record. Please try again or contact support.' 
          });
        }
      }
    }
    
    // ENFORCE: All authenticated users MUST have a database record
    if (dbUserId === null) {
      console.error(`❌ User ${user.email} authenticated via Supabase but not found in database`);
      return res.status(401).json({ 
        error: 'User not found in database. Please contact your administrator.' 
      });
    }
    
    req.user = {
      id: dbUserId, // Always a database integer ID (enforced by check above)
      email: user.email!,
      sub: user.id,
      role: dbUserData?.role,
      schoolId: dbUserData?.schoolId,
      permissions: dbUserData?.permissions,
      name: dbUserData?.name,
    };

    // 🔒 SECURITY: req.auth.payload MUST use database values exclusively
    // Never trust Supabase metadata (app_metadata or user_metadata) for role/school
    // Only include non-sensitive metadata from user_metadata (like name, avatar)
    const { role: _, school_id: __, ...safeUserMetadata } = user.user_metadata || {};
    
    req.auth = {
      payload: {
        sub: user.id,
        email: user.email!,
        // Include non-critical metadata from user_metadata (like name, preferences)
        ...safeUserMetadata,
        // 🔒 CRITICAL: Always use database as source of truth for role and school_id
        // This prevents privilege escalation via tampered metadata in stale tokens
        role: dbUserData?.role,
        school_id: dbUserData?.schoolId,
        name: dbUserData?.name,
      },
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to require educator role access
 * Checks if the authenticated user has an educator-type role (educator, mentor, teacher, etc.)
 * Also allows school admins to access educator features for testing/support
 */
export const requireEducatorRole = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('[EducatorDashboard] Checking educator role access for user:', req.user?.email);
    
    if (!req.user?.id) {
      console.log('[EducatorDashboard] No user ID found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all user roles
    const userRoles = await storage.getUserRolesByUserId(req.user.id);
    console.log('[EducatorDashboard] User roles:', userRoles.map(r => r.role));
    
    // Define educator-type roles (case-insensitive matching)
    const educatorRolePatterns = [
      'educator', 'mentor', 'teacher', 'instructor', 'tutor', 'facilitator',
      'schoolAdmin', 'school_admin', 'admin', 'superAdmin'
    ];
    
    const hasEducatorRole = userRoles.some(r => 
      educatorRolePatterns.some(pattern => 
        r.role.toLowerCase().includes(pattern.toLowerCase())
      )
    );
    
    if (!hasEducatorRole) {
      console.log('[EducatorDashboard] User does not have educator role, access denied');
      return res.status(403).json({ 
        error: 'Access denied. Educator role required.',
        code: 'EDUCATOR_ROLE_REQUIRED'
      });
    }
    
    console.log('[EducatorDashboard] Educator role verified for:', req.user.email);
    next();
  } catch (error) {
    console.error('[EducatorDashboard] Error checking educator role:', error);
    return res.status(500).json({ error: 'Failed to verify educator access' });
  }
};
