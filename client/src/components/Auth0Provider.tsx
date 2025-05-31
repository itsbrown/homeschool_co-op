import React from 'react';
import { Auth0Provider } from '@auth0/auth0-react';

interface Auth0WrapperProps {
  children: React.ReactNode;
}

const Auth0Wrapper: React.FC<Auth0WrapperProps> = ({ children }) => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_API_IDENTIFIER;

  // Log configuration for debugging
  console.log('🔧 Auth0 Config:', { domain, clientId, audience });

  if (!domain || !clientId) {
    console.error('❌ Auth0 configuration missing:', { domain, clientId, audience });
    throw new Error('Auth0 configuration missing. Please ensure VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID are properly set.');
  }

  const handleOnRedirectCallback = (appState?: any) => {
    console.log('🔄 Auth0 redirect callback completed', appState);
    // Navigate to intended URL or default to dashboard
    window.history.replaceState(
      {},
      document.title,
      appState?.returnTo || window.location.pathname
    );
  };

  const handleError = (error: Error) => {
    console.error('🚨 Auth0 Error:', error);
    // Don't redirect on error - let user see the error
  };

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: audience,
        scope: "openid profile email"
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
      onRedirectCallback={handleOnRedirectCallback}
      skipRedirectCallback={window.location.search.includes('error=')}
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0Wrapper;