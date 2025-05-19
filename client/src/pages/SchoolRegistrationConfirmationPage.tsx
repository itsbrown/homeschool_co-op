import React from "react";
import { useLocation } from "wouter";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function SchoolRegistrationConfirmationPage() {
  const [, setLocation] = useLocation();
  
  return (
    <AppShell>
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Registration Submitted</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4">
              Thank you for registering your school/co-op with our platform! 
            </p>
            <p className="mb-4">
              Your registration has been submitted and is pending review by our team. 
              You will receive an email notification once your registration has been approved.
            </p>
            <p className="mb-4">
              After approval, you'll be able to manage your school profile, add staff members,
              and create classes for your students.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}