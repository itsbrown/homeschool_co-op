import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client with service role key for server-side operations
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaXZ3anVnbHd3ZnJocWVld2p1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njc0Mzk3NCwiZXhwIjoyMDYyMzE5OTc0fQ.XXyVSDqFjafa8tMqMLHHw1mXs3si4tnz8P2C41X2EfA'
);

export interface DatabaseUser {
  id: string;
  auth_user_id?: string;
  name: string;
  username?: string;
  email: string;
  role: 'parent' | 'educator' | 'admin' | 'schoolAdmin' | 'superAdmin';
  avatar?: string;
  subscription: 'free' | 'family' | 'educator' | 'premium';
  created_at: string;
  updated_at?: string;
}

export interface RoleInvitation {
  id: number;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  is_active: boolean;
  used_at?: string;
  created_at: string;
  expires_at: string;
}