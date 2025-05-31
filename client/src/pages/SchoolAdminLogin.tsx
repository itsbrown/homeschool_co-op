import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SchoolAdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('POST', '/api/school-admin/login', {
        username: 'schooladmin',
        password: 'password'
      });
      
      if (response.ok) {
        toast({
          title: "Login successful",
          description: "You have been logged in as a School Administrator.",
        });
        setLocation("/schools");
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Login failed");
        toast({
          title: "Login failed",
          description: errorData.message || "Could not log in as School Administrator.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setError("Could not connect to server");
      toast({
        title: "Connection error",
        description: "Could not connect to the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondary">
      <div className="flex flex-col items-center justify-center space-y-4 mb-6">
        <h1 className="text-2xl font-bold">School Administrator Login</h1>
        <p className="text-muted-foreground">
          This page allows you to access the School Administrator interface.
        </p>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-md max-w-md">
          <p>{error}</p>
        </div>
      )}
      
      <Button 
        onClick={handleManualLogin} 
        disabled={loading} 
        size="lg"
        className="min-w-[200px]"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Logging in...
          </>
        ) : (
          "Login as School Admin"
        )}
      </Button>
      
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => setLocation("/login")}
      >
        Back to Login Page
      </Button>
    </div>
  );
}