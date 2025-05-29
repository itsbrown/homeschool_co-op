import { useAuth0 } from '@auth0/auth0-react';

export const useAuth = () => {
  const auth0 = useAuth0();

  return {
    ...auth0,
    // Add any additional auth methods here
  };
};

export default useAuth;