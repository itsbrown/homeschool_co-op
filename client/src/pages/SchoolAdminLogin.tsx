import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function SchoolAdminLogin() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const autoLogin = async () => {
      try {
        await login("schooladmin", "password");
        toast({
          title: "Login successful",
          description: "You have been automatically logged in as a School Administrator.",
        });
        setLocation("/dashboard");
      } catch (error) {
        toast({
          title: "Login failed",
          description: "Could not automatically log in as School Administrator. Please try again.",
          variant: "destructive",
        });
        setLocation("/login");
      }
    };

    autoLogin();
  }, [login, setLocation, toast]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondary">
      <div className="flex items-center justify-center space-x-2 mb-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <h1 className="text-2xl font-bold">Logging in as School Administrator...</h1>
      </div>
      <p className="text-muted-foreground">Please wait while we sign you in automatically.</p>
    </div>
  );
}