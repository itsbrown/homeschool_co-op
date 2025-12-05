import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { XCircle } from "lucide-react";

export default function AcceptEducatorInvitationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Get invitation token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Validate invitation token using public staff-invitations endpoint (no auth required)
      // Staff invitations are stored in staff_invitations table (not role_invitations)
      fetch(`/api/public/staff-invitations/validate?token=${token}`)
        .then(response => response.json())
        .then(data => {
          setIsValidating(false);
          if (data.valid) {
            setInvitationData(data.invitation);
          } else {
            setValidationError(data.message || "This invitation link is invalid or has expired.");
          }
        })
        .catch(error => {
          console.error('Error validating invitation:', error);
          setIsValidating(false);
          setValidationError("Failed to validate invitation. Please try again.");
        });
    } else {
      setIsValidating(false);
      setValidationError("No invitation token provided in the URL.");
    }
  }, []);

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const token = new URLSearchParams(window.location.search).get('token');
      
      // Accept the invitation using public staff-invitations endpoint (no auth required)
      // This creates the Supabase auth account and local database user with the provided password
      const response = await fetch('/api/public/staff-invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          password: password
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Welcome!",
          description: result.message || "Your account has been created successfully.",
        });
        
        // Redirect to login page so user can sign in with their new credentials
        setLocation('/login');
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to accept invitation.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast({
        title: "Error",
        description: "Failed to accept invitation.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while validating
  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>Validating your invitation...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show error state if validation failed
  if (validationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-destructive">Invalid Invitation</CardTitle>
            <CardDescription>{validationError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={() => setLocation('/login')}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no invitation data (shouldn't happen but safety check)
  if (!invitationData) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept Educator Invitation</CardTitle>
          <CardDescription>
            Welcome! You've been invited to join as an educator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email" 
                value={invitationData.email} 
                disabled 
                className="bg-gray-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Role</Label>
              <Input 
                type="text" 
                value={invitationData.role} 
                disabled 
                className="bg-gray-50"
              />
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Input 
                type="text" 
                value={invitationData.department} 
                disabled 
                className="bg-gray-50"
              />
            </div>

            <form onSubmit={handleAcceptInvitation} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Create Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? "Setting up account..." : "Accept Invitation"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
