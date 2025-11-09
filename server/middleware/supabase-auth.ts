import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ supabaseAuth - Rejecting: Missing or invalid authorization header');
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    console.log('🔐 supabaseAuth - Token extracted, length:', token.length);

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      id: user.id,
      email: user.email!,
      sub: user.id,
    };

    req.auth = {
      payload: {
        sub: user.id,
        email: user.email!,
        ...user.user_metadata,
      },
    };

    // 🔒 SECURITY MONITORING & AUTO-SYNC: Detect and correct metadata mismatches
    // This protects against user_metadata tampering by ensuring database is source of truth
    if (user.email) {
      try {
        // Import storage dynamically to avoid circular dependencies
        const { storage } = await import('../storage.js');
        const dbUser = await storage.getUserByEmail(user.email);
        
        if (dbUser) {
          // Check for metadata mismatches (potential tampering or missing data)
          const metadataSchoolId = user.user_metadata?.school_id;
          const metadataRole = user.user_metadata?.role;
          const dbSchoolId = dbUser.schoolId;
          const dbRole = dbUser.role;

          const schoolIdMismatch = metadataSchoolId !== undefined && metadataSchoolId !== dbSchoolId;
          const roleMismatch = metadataRole !== undefined && metadataRole !== dbRole;
          const missingSchoolId = !metadataSchoolId && dbSchoolId;
          const missingRole = !metadataRole && dbRole;

          // 🚨 SECURITY ALERT: Log potential tampering attempts
          if (schoolIdMismatch || roleMismatch) {
            console.warn(`🚨 SECURITY: Metadata mismatch detected for ${user.email}`);
            console.warn(`   Metadata school_id: ${metadataSchoolId} vs DB: ${dbSchoolId}`);
            console.warn(`   Metadata role: ${metadataRole} vs DB: ${dbRole}`);
            console.warn(`   This could indicate tampering or outdated token. Auto-correcting...`);
          }

          // Auto-fix missing or mismatched metadata
          if (missingSchoolId || missingRole || schoolIdMismatch || roleMismatch) {
            if (missingSchoolId || missingRole) {
              console.log(`⚠️ Auto-fixing missing metadata for ${user.email}`);
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
              console.error(`❌ Failed to update metadata for ${user.email}:`, updateError.message);
            } else {
              console.log(`✅ Metadata synced for ${user.email}: school_id=${dbUser.schoolId}, role=${dbUser.role}`);
              if (schoolIdMismatch || roleMismatch) {
                console.log(`   🔒 Corrected mismatch - token will be updated on next login`);
              }
            }
            
            // Apply corrections to current request immediately
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

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
