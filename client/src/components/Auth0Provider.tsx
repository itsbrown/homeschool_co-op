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
    return <div>Auth0 configuration missing</div>;
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
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0Wrapper;