import { useAuth0 as useAuth0Hook } from '@auth0/auth0-react';

export function useAuth() {
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0Hook();
  
  return {
    user,
    isAuthenticated,
    isLoading,
    login: loginWithRedirect,
    logout,
    getAccessTokenSilently,
  };
}