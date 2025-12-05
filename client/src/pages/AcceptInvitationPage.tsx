import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface InvitationData {
  id: number;
  email: string;
  role: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

export default function AcceptInvitationPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/accept-invitation");
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Get token from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link - no token provided");
      setLoading(false);
      return;
    }

    // Validate invitation using the public endpoint (no auth required)
    const validateInvitation = async () => {
      try {
        const response = await fetch(`/api/public/role-invitations/validate?token=${token}`);
        const data = await response.json();
        
        if (data.valid) {
          setInvitation(data.invitation);
        } else {
          setError(data.message || "Invalid or expired invitation token");
        }
      } catch (err) {
        console.error("Error validating invitation:", err);
        setError("Failed to validate invitation");
      } finally {
        setLoading(false);
      }
    };

    validateInvitation();
  }, [token]);

  const handleAcceptInvitation = async () => {
    if (!token) return;
    
    setAccepting(true);
    try {
      // Use the public endpoint (no auth required)
      const response = await fetch('/api/public/role-invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();
      
      if (response.ok) {
        // Show success message and redirect after delay
        if (data.accountCreated) {
          alert('Success! Your account has been created and login credentials have been sent to your email. Please check your inbox.');
        } else {
          alert('Invitation accepted! You can now log in with your existing account.');
        }
        
        // Redirect to login page
        setTimeout(() => {
          setLocation('/login?invitation=accepted&role=' + invitation?.role);
        }, 2000);
      } else {
        setError(data.message || "Failed to accept invitation");
      }
    } catch (err) {
      console.error("Error accepting invitation:", err);
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
            <p className="text-sm text-gray-600">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-700">Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setLocation('/login')}
              className="w-full"
              variant="outline"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            You've been invited to join ASA Platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Email:</span>
                <span className="text-gray-600">{invitation.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Role:</span>
                <span className="text-blue-600 font-semibold">
                  {invitation.role === 'schoolAdmin' ? 'School Administrator' : 
                   invitation.role === 'teacher' ? 'Teacher' :
                   invitation.role === 'admin' ? 'Platform Admin' :
                   invitation.role}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Invited by:</span>
                <span className="text-gray-600">{invitation.invitedBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Expires:</span>
                <span className="text-gray-600">
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          <Alert>
            <AlertDescription>
              By accepting this invitation, you'll be able to create an account with the {invitation?.role} role.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button 
              onClick={handleAcceptInvitation}
              disabled={accepting}
              className="flex-1"
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                'Accept Invitation'
              )}
            </Button>
            <Button 
              onClick={() => setLocation('/login')}
              variant="outline"
              className="flex-1"
            >
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}