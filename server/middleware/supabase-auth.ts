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

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    sub: string;
  };
  auth?: {
    payload?: {
      sub: string;
      email: string;
      [key: string]: any;
    };
  };
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
          req.user = {
            id: String(user.id),
            email: user.email,
            sub: String(user.id),
            role: user.role,
            permissions: user.permissions,
            schoolId: user.schoolId,
            name: user.name,
          } as any;
          
          req.auth = {
            payload: {
              sub: String(user.id),
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
      console.error('Supabase auth error:', error);
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
    if (user.email) {
      try {
        // Import storage dynamically to avoid circular dependencies
        const { storage } = await import('../storage.js');
        const dbUser = await storage.getUserByEmail(user.email);
        
        if (dbUser) {
          // Store database user ID for req.user
          dbUserId = dbUser.id;
          
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
    req.user = {
      id: dbUserId !== null ? dbUserId : user.id, // Use database ID if available, fallback to Supabase UUID
      email: user.email!,
      sub: user.id,
    } as any;

    // 🔒 CRITICAL: Spread user_metadata FIRST, then override with secure values
    // This prevents user_metadata from overwriting admin-only app_metadata values
    const { role: _, school_id: __, ...safeUserMetadata } = user.user_metadata || {};
    
    req.auth = {
      payload: {
        sub: user.id,
        email: user.email!,
        // Include non-critical metadata from user_metadata (like name, preferences)
        ...safeUserMetadata,
        // Phase 2: Use app_metadata (admin-only) or user_metadata (existing users)
        // These MUST come after spread to prevent tampering via user_metadata
        role: (PHASE_2_APP_METADATA_ENABLED ? user.app_metadata?.role : null) || user.user_metadata?.role,
        school_id: (PHASE_2_APP_METADATA_ENABLED ? user.app_metadata?.school_id : null) || user.user_metadata?.school_id,
      },
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
