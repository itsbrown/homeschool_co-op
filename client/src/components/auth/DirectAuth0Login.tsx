import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";

export default function DirectAuth0Login() {
  const { loginWithRedirect, isLoading } = useAuth0();

  useEffect(() => {
    if (!isLoading) {
      loginWithRedirect({
        authorizationParams: {
          redirect_uri: window.location.origin
        }
      });
    }
  }, [loginWithRedirect, isLoading]);

  // Show a simple loading screen while redirecting
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Redirecting to Login
          </h2>
          <p className="text-gray-600 text-sm">
            Taking you to the sign-in page...
          </p>
        </div>
      </div>
    </div>
  );
}