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
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);

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

    // Auto-fix missing school_id in JWT token by syncing from database
    // This runs ONCE per user and permanently updates their Supabase metadata
    if (!user.user_metadata?.school_id && user.email) {
      try {
        // Import storage dynamically to avoid circular dependencies
        const { storage } = await import('../storage.js');
        const dbUser = await storage.getUserByEmail(user.email);
        
        if (dbUser?.schoolId) {
          console.log(`⚠️ Auto-fixing missing school_id for ${user.email}`);
          
          // Update Supabase user metadata SYNCHRONOUSLY to ensure it's permanent
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
            console.log(`✅ Permanently fixed metadata for ${user.email} with school_id=${dbUser.schoolId}`);
            console.log(`   User should log out and back in for changes to take full effect`);
          }
          
          // Add school_id to current request immediately so it works right now
          if (req.auth?.payload) {
            req.auth.payload.school_id = dbUser.schoolId;
            req.auth.payload.role = dbUser.role;
            req.auth.payload.name = dbUser.name;
          }
        }
      } catch (syncError) {
        console.error('Error during metadata auto-fix:', syncError);
      }
    }

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
