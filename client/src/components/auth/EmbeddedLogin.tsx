import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, User, GraduationCap, Building } from "lucide-react";
import { useLocation } from "wouter";

export default function EmbeddedLogin() {
  const [, setLocation] = useLocation();
  const { loginWithRedirect, isLoading: authLoading } = useAuth0();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      await loginWithRedirect({
        authorizationParams: {
          login_hint: email,
          screen_hint: "login"
        }
      });
    } catch (err) {
      setError("Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      await loginWithRedirect({
        authorizationParams: {
          connection: "google-oauth2"
        }
      });
    } catch (err) {
      setError("Google login failed. Please try again.");
      setIsLoading(false);
    }
  };

  const handleGeneralLogin = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      await loginWithRedirect();
    } catch (err) {
      setError("Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    // Redirect to the customized Auth0 signup page
    await loginWithRedirect({
      authorizationParams: {
        redirect_uri: window.location.origin,
        screen_hint: "signup"
      }
    });
  };

  const handleQuickAccess = (role: string) => {
    const testAccounts = {
      parent: { email: "parent@test.com", password: "demo123" },
      educator: { email: "educator@test.com", password: "demo123" },
      school_admin: { email: "schooladmin@test.com", password: "demo123" }
    };

    const account = testAccounts[role as keyof typeof testAccounts];
    if (account) {
      setEmail(account.email);
      setPassword(account.password);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">Welcome Back</h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to your Adaptive Learning Platform account
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleGeneralLogin}
              className="w-full"
            >
              Sign In
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Quick Login Options
                </span>
              </div>
            </div>

            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Quick access for testing:
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAccess("parent")}
                  disabled={isLoading}
                  className="justify-start"
                >
                  <User className="h-4 w-4 mr-2" />
                  Parent Account
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAccess("educator")}
                  disabled={isLoading}
                  className="justify-start"
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Educator Account
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAccess("school_admin")}
                  disabled={isLoading}
                  className="justify-start"
                >
                  <Building className="h-4 w-4 mr-2" />
                  School Admin Account
                </Button>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Button variant="link" className="p-0 h-auto" onClick={handleSignup}>
                  Sign up
                </Button>
              </p>
              <Button variant="link" className="p-0 h-auto text-sm" onClick={handleGeneralLogin}>
                Forgot your password?
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}