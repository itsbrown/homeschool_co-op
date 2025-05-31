import { useAuth0 as useAuth0Hook } from '@auth0/auth0-react';
import { inspectJWT } from '../utils/jwtDebugger';

export function useAuth() {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    loginWithRedirect, 
    logout, 
    getAccessTokenSilently,
    error 
  } = useAuth0Hook();

  // Debug logging
  console.log('Auth state:', { 
    isAuthenticated, 
    isLoading, 
    user: user ? { id: user.sub, email: user.email } : null,
    error: error?.message 
  });

  // Enhanced token retrieval with inspection
  const getTokenWithInspection = async () => {
    try {
      console.log('🔍 Requesting access token from Auth0...');
      const token = await getAccessTokenSilently();
      console.log('✅ Token received from Auth0');
      inspectJWT(token);
      
      // Store token in localStorage for API calls
      localStorage.setItem('auth0_token', token);
      return token;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      throw error;
    }
  };

  const getUserRole = (user: any) => {
    // Check for roles in Auth0 user object
    // Auth0 roles can be found in different places depending on configuration
    const roles = user?.[`${import.meta.env.VITE_AUTH0_API_IDENTIFIER}/roles`] || 
                  user?.['https://asa-platform.com/roles'] ||
                  user?.roles || 
                  user?.['app_metadata']?.roles ||
                  [];
    
    // Return the first role found, or default to 'parent'
    if (Array.isArray(roles) && roles.length > 0) {
      return roles[0];
    }
    
    // Fallback role detection
    return user?.['custom:role'] || user?.['app_metadata']?.role || 'parent';
  };

  return {
    user: user ? {
      id: user.sub || '',
      name: user.name || '',
      email: user.email || '',
      role: getUserRole(user),
      roles: user?.[`${import.meta.env.VITE_AUTH0_API_IDENTIFIER}/roles`] || 
             user?.['https://asa-platform.com/roles'] ||
             user?.roles || 
             user?.['app_metadata']?.roles || 
             [],
      avatar: user.picture,
      subscription: user['app_metadata']?.subscription || 'free'
    } : null,
    isAuthenticated,
    isLoading,
    login: () => window.location.href = '/login',
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
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