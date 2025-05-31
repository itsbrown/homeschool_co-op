import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth0";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogIn, Shield } from "lucide-react";

export default function Login() {
  const { login, isLoading, isAuthenticated } = useAuth();

  // If already authenticated, don't show login page
  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    login({
      appState: {
        returnTo: window.location.origin
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-800">
              ASA Learning Platform
            </CardTitle>
            <CardDescription>
              Secure access with Auth0 authentication
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">
                Click the button below to sign in securely through Auth0
              </p>
              
              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                <LogIn className="mr-2 h-4 w-4" />
                {isLoading ? "Redirecting..." : "Sign In with Auth0"}
              </Button>
              
              <div className="text-xs text-gray-500 mt-4">
                You'll be redirected to Auth0's secure login page
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}