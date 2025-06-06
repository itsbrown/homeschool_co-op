// Authentication debugging utility
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export const debugAuthState = async () => {
  try {
    console.log('🔧 Manual auth state check...');
    
    // Check current session
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log('🔧 Current session:', { session, error });
    
    // Check user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('🔧 Current user:', { user, userError });
    
    // Check localStorage
    const token = localStorage.getItem('supabase_token');
    console.log('🔧 LocalStorage token:', !!token);
    
    return { session, user, hasToken: !!token };
  } catch (err) {
    console.error('🔧 Auth debug error:', err);
    return null;
  }
};

export const forceAuthRefresh = async () => {
  try {
    console.log('🔧 Forcing auth refresh...');
    const { data, error } = await supabase.auth.refreshSession();
    console.log('🔧 Refresh result:', { data, error });
    return data;
  } catch (err) {
    console.error('🔧 Refresh error:', err);
    return null;
  }
};