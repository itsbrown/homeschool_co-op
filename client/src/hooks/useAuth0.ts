import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useState } from 'react';

export function useAuth() {
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const getToken = async () => {
      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently();
          setAccessToken(token);
        } catch (error) {
          console.error('Error getting access token:', error);
        }
      }
    };

    getToken();
  }, [isAuthenticated, getAccessTokenSilently]);

  const login = () => {
    loginWithRedirect();
  };

  const logoutUser = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return {
    user,
    isAuthenticated: isAuthenticated && !isLoading,
    isLoading,
    login,
    logout: logoutUser,
    accessToken,
  };
}