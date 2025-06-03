import { useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Home } from "lucide-react";

export default function LogoutPage() {
  const { signOut, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      signOut();
    }
  }, [signOut, isAuthenticated]);

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <LogOut className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Logged Out</CardTitle>
            <CardDescription>
              You have been successfully logged out of your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Thank you for using our platform. Your session has been ended securely.
            </p>
            <Button 
              onClick={handleGoHome}
              className="w-full"
            >
              <Home className="mr-2 h-4 w-4" />
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}