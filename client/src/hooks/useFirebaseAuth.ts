// This file has been removed as part of consolidating to Auth0-only authentication
// Use useAuth0 hook from @auth0/auth0-react for all authentication needs

// Export empty function to prevent import errors during migration
const useFirebaseAuth = () => ({
  user: null,
  loading: false,
  error: null
});

export { useFirebaseAuth };
export default useFirebaseAuth;