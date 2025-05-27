import { useFirebaseAuth } from './useFirebaseAuth';

export function useAuth() {
  // For now, continue using Firebase authentication until Auth0 is fully configured
  // This maintains existing functionality without breaking the Rules of Hooks
  const firebaseAuth = useFirebaseAuth();
  
  return {
    user: firebaseAuth.user,
    isAuthenticated: firebaseAuth.isAuthenticated,
    isLoading: firebaseAuth.isLoading,
    login: firebaseAuth.loginWithEmail,
    logout: firebaseAuth.logout,
    accessToken: null,
  };
}