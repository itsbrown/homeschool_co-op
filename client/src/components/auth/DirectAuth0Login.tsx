import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function DirectAuth0Login() {
  const { loginWithRedirect, isLoading, isAuthenticated, error } = useAuth0();
  const [hasAttemptedRedirect, setHasAttemptedRedirect] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  const handleLogin = async () => {
    console.log('Manual Auth0 login triggered...');
    setHasAttemptedRedirect(true);
    
    try {
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri: window.location.origin
        }
      });
    } catch (err: any) {
      console.error('Auth0 redirect failed:', err);
      setRedirectError(err.message || 'Authentication failed');
    }
  };

  // Handle Auth0 errors or redirect failures
  if (error || redirectError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.084 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Error
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              {redirectError || error?.message || 'Unable to connect to authentication service'}
            </p>
            <Button 
              onClick={() => {
                setHasAttemptedRedirect(false);
                setRedirectError(null);
              }}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show manual login interface
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Sign in to your American Seekers Academy account
          </p>
          
          {isLoading ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          ) : (
            <Button 
              onClick={handleLogin}
              className="w-full mb-4"
              disabled={hasAttemptedRedirect}
            >
              Sign In with Auth0
            </Button>
          )}
          
          <p className="text-xs text-gray-500">
            You'll be redirected to our secure login page
          </p>
        </div>
      </div>
    </div>
  );
}