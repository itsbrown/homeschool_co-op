import React from 'react';
import { Auth0Provider } from '@auth0/auth0-react';

interface Auth0WrapperProps {
  children: React.ReactNode;
}

const Auth0Wrapper: React.FC<Auth0WrapperProps> = ({ children }) => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_API_IDENTIFIER;

  if (!domain || !clientId) {
    // Fallback: render children without Auth0 until configuration is complete
    console.warn('Auth0 configuration incomplete, using fallback authentication');
    return <>{children}</>;
  }

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
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0Wrapper;