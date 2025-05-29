
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
  
  return {
    user: user ? {
      id: user.sub || '',
      name: user.name || '',
      email: user.email || '',
      role: user['custom:role'] || user['app_metadata']?.role || 'parent',
      avatar: user.picture,
      subscription: user['app_metadata']?.subscription || 'free'
    } : null,
    isAuthenticated,
    isLoading,
    login: loginWithRedirect,
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    getAccessTokenSilently,
  };
}

// Keep the original export for backward compatibility
export const useAuth0 = useAuth;
