
import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth0";

export default function AcceptEducatorInvitationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Get invitation token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');
    
    if (token && email) {
      // Validate invitation token using public endpoint (no auth required)
      fetch(`/api/public/role-invitations/validate?token=${token}&email=${email}`)
        .then(response => response.json())
        .then(data => {
          if (data.valid) {
            setInvitationData(data.invitation);
          } else {
            toast({
              title: "Invalid Invitation",
              description: "This invitation link is invalid or has expired.",
              variant: "destructive",
            });
            setLocation('/');
          }
        })
        .catch(error => {
          console.error('Error validating invitation:', error);
          toast({
            title: "Error",
            description: "Failed to validate invitation.",
            variant: "destructive",
          });
        });
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
      // If user is not logged in, create account and login
      if (!user) {
        await login({
          email: invitationData.email,
          password: password,
          role: 'educator'
        });
      }

      // Accept the invitation using public endpoint (no auth required)
      const response = await fetch('/api/public/role-invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get('token'),
          email: invitationData.email,
          password: password
        }),
      });

      if (response.ok) {
        toast({
          title: "Welcome!",
          description: "Your educator account has been activated successfully.",
        });
        
        // Redirect to educator dashboard
        setLocation('/educator/dashboard');
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to accept invitation.",
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

  if (!invitationData) {
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
