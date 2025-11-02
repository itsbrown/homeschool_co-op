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
    if (!user.user_metadata?.school_id && user.email) {
      try {
        // Import storage dynamically to avoid circular dependencies
        const { storage } = await import('../storage.js');
        const dbUser = await storage.getUserByEmail(user.email);
        
        if (dbUser?.schoolId) {
          console.log(`⚠️ Auto-syncing school_id=${dbUser.schoolId} for user ${user.email}`);
          
          // Update Supabase user metadata in background (don't await)
          supabase.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              school_id: dbUser.schoolId,
              role: dbUser.role,
              name: dbUser.name
            }
          }).then(({ error: updateError }) => {
            if (updateError) {
              console.error('❌ Failed to auto-sync metadata:', updateError);
            } else {
              console.log(`✅ Auto-synced metadata for ${user.email}`);
            }
          }).catch(err => console.error('Auto-sync error:', err));
          
          // Add school_id to current request immediately
          if (req.auth?.payload) {
            req.auth.payload.school_id = dbUser.schoolId;
            console.log(`✅ Added school_id=${dbUser.schoolId} to current request`);
          }
        }
      } catch (syncError) {
        console.error('Error during auto-sync:', syncError);
      }
    }

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
