import { useFirebaseAuth } from './useFirebaseAuth';

export function useAuth() {
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