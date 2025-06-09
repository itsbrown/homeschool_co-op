import { useSupabase } from '../components/SupabaseProvider';
import { inspectJWT } from '../utils/jwtDebugger';

export function useAuth() {
  const { 
    user, 
    session,
    isLoading, 
    signIn,
    signOut,
    signInWithGoogle,
    error 
  } = useSupabase();

  const isAuthenticated = !!user && !!session;

  // Debug logging
  console.log('Auth state:', { 
    isAuthenticated, 
    isLoading, 
    user: user ? { id: user.id, email: user.email } : null,
    error: error?.message 
  });

  // Enhanced token retrieval with inspection
  const getTokenWithInspection = async () => {
    try {
      console.log('🔍 Requesting access token from Supabase...');
      if (!session?.access_token) {
        throw new Error('No session available');
      }
      const token = session.access_token;
      console.log('✅ Token received from Supabase');
      inspectJWT(token);
      
      // Store token in localStorage for API calls
      localStorage.setItem('supabase_token', token);
      return token;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      throw error;
    }
  };

  const getUserRole = (user: any) => {
    // For Supabase, check user metadata for roles first
    const metadata = user?.user_metadata || user?.app_metadata || {};
    let role = metadata.role || metadata.roles?.[0];
    
    console.log('🔍 getUserRole - user:', user?.email);
    console.log('🔍 getUserRole - metadata:', metadata);
    console.log('🔍 getUserRole - extracted role:', role);
    
    // Super admin role assignment for the super admin email
    if (user?.email === 'superadmin@americanseekersacademy.com') {
      role = 'superAdmin';
      console.log('🚀 Applied superAdmin role for super admin email');
    }
    
    // School admin role assignment for known admin emails
    if (user?.email === 'contact.americanseekersacademy@gmail.com' || user?.email === 'coreycreates@gmail.com') {
      role = 'school_admin';
      console.log('🏫 Applied school_admin role for known admin email');
    }
    
    console.log('🔍 getUserRole - final role:', role);
    
    // Default to parent role for all users unless they have an invitation
    return role || 'parent';
  };

  return {
    user: user ? {
      id: user.id || '',
      name: user.user_metadata?.name || user.email?.split('@')[0] || '',
      email: user.email || '',
      role: getUserRole(user),
      roles: user.user_metadata?.roles || user.app_metadata?.roles || [],
      avatar: user.user_metadata?.avatar || user.user_metadata?.picture,
      subscription: user.user_metadata?.subscription || 'free'
    } : null,
    isAuthenticated,
    isLoading,
    login: (email: string, password: string) => signIn(email, password),
    logout: () => signOut(),
    signInWithGoogle,
    getAccessTokenSilently: getTokenWithInspection,
    inspectCurrentToken: async () => {
      try {
        const token = await getTokenWithInspection();
        return token;
      } catch (error) {
        console.error('Failed to inspect token:', error);
        return null;
      }
    }
  };
}