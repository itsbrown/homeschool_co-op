import React, { useEffect } from "react";
import { useParams, useLocation } from "wouter";

export default function SchoolRegistrationFormPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to the unified registration landing page
    if (code) {
      setLocation(`/register/${code}`);
    } else {
      setLocation("/registration/landing");
    }
  }, [code, setLocation]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting to registration...</p>
      </div>
    </div>
  );
}