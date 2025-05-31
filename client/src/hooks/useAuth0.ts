import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { createAuth0Client, Auth0Client, User } from '@auth0/auth0-spa-js';

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  getAccessTokenSilently: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth0Client, setAuth0Client] = useState<Auth0Client | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth0 = async () => {
      try {
        const client = await createAuth0Client({
          domain: import.meta.env.VITE_AUTH0_DOMAIN,
          clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
          authorizationParams: {
            redirect_uri: window.location.origin,
            audience: import.meta.env.VITE_AUTH0_API_IDENTIFIER,
            scope: "openid profile email read:current_user"
          }
        });

        setAuth0Client(client);

        // Check if user is already authenticated
        const isAuth = await client.isAuthenticated();
        setIsAuthenticated(isAuth);

        if (isAuth) {
          const userData = await client.getUser();
          setUser(userData || null);
        }

        // Handle redirect callback
        if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
          try {
            await client.handleRedirectCallback();
            const isAuthAfterCallback = await client.isAuthenticated();
            setIsAuthenticated(isAuthAfterCallback);
            
            if (isAuthAfterCallback) {
              const userData = await client.getUser();
              setUser(userData || null);
            }
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (error) {
            console.error('Error handling redirect callback:', error);
          }
        }
      } catch (error) {
        console.error('Failed to initialize Auth0:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth0();
  }, []);

  const getUserRole = (user: any) => {
    const roles = user?.[`${import.meta.env.VITE_AUTH0_API_IDENTIFIER}/roles`] || 
                  user?.['https://asa-platform.com/roles'] ||
                  user?.roles || 
                  user?.['app_metadata']?.roles ||
                  [];
    
    if (Array.isArray(roles) && roles.length > 0) {
      return roles[0];
    }
    
    return user?.['custom:role'] || user?.['app_metadata']?.role || 'parent';
  };

  const login = () => {
    // This will be handled by the EmbeddedLogin component
    window.location.href = '/login';
  };

  const logout = async () => {
    if (auth0Client) {
      await auth0Client.logout({
        logoutParams: {
          returnTo: window.location.origin
        }
      });
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const getAccessTokenSilently = async () => {
    if (!auth0Client) {
      throw new Error('Auth0 client not initialized');
    }
    return await auth0Client.getTokenSilently();
  };

  const contextValue = {
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
    login,
    logout,
    getAccessTokenSilently,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}