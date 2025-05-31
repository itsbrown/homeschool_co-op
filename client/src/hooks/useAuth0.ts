import { useAuth0 as useAuth0Hook } from '@auth0/auth0-react';

export function useAuth() {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    loginWithRedirect, 
    logout, 
    getAccessTokenSilently 
  } = useAuth0Hook();

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
    getAccessTokenSilently,
  };
}