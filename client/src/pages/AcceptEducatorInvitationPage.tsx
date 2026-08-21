import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, XCircle } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";

type InvitationWelcome = {
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  position?: string;
  schoolName?: string;
  className?: string | null;
  campusName?: string | null;
};

export default function AcceptEducatorInvitationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<InvitationWelcome | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (!token) {
      setIsValidating(false);
      setValidationError("This invitation link is missing. Ask your director to resend from Staff.");
      return;
    }

    fetch(`/api/public/staff-invitations/validate?token=${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((data) => {
        setIsValidating(false);
        if (data.valid) {
          setInvitationData(data.invitation);
        } else {
          setValidationError(
            data.message || "This invitation link is invalid or has expired. Ask your director to resend from Staff.",
          );
        }
      })
      .catch(() => {
        setIsValidating(false);
        setValidationError("Failed to validate invitation. Please try again.");
      });
  }, []);

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      toast({
        title: "Passwords do not match",
        description: "Enter the same password in both fields.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const token = new URLSearchParams(window.location.search).get("token");
      const response = await fetch("/api/public/staff-invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast({
          title: "Could not join",
          description: result.message || "Failed to accept invitation.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await signIn(invitationData?.email || result.email, password);
      if (error) {
        toast({
          title: "Account created",
          description: "Sign in with the password you just set.",
        });
        setLocation("/login");
        return;
      }

      toast({
        title: result.schoolName ? `Welcome to ${result.schoolName}` : "Welcome",
        description: result.className ? `Your class: ${result.className}` : undefined,
      });
      setLocation("/educator/dashboard");
    } catch {
      toast({
        title: "Could not join",
        description: "Failed to accept invitation.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Checking your invitation…</CardTitle>
            <CardDescription>This only takes a moment.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription data-testid="text-invite-error">{validationError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setLocation("/login")}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitationData) {
    return null;
  }

  const schoolName = invitationData.schoolName || "your school";
  const position = invitationData.position || invitationData.role || "Mentor";
  const displayName = [invitationData.firstName, invitationData.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md" data-testid="card-accept-invite">
        <CardHeader>
          <CardTitle>Join {schoolName}</CardTitle>
          <CardDescription>
            {displayName ? `Welcome, ${displayName}. ` : "Welcome. "}
            You have been invited as a {position}
            {invitationData.className ? ` for ${invitationData.className}` : ""}
            {invitationData.campusName ? ` at ${invitationData.campusName}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAcceptInvitation} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={invitationData.email}
                disabled
                className="bg-gray-50"
                data-testid="input-invite-email-readonly"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Create password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a password"
                  required
                  style={{ fontSize: 16 }}
                  data-testid="input-invite-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordMismatch(false);
                }}
                onBlur={() => setPasswordMismatch(confirmPassword.length > 0 && password !== confirmPassword)}
                placeholder="Confirm your password"
                required
                style={{ fontSize: 16 }}
                data-testid="input-invite-password-confirm"
              />
              {passwordMismatch && (
                <p className="text-sm text-destructive">Passwords do not match.</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-join-school"
            >
              {isLoading ? "Setting up your account…" : `Join ${schoolName}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
