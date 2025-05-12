import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, CheckCircle, FileText, UserPlus, BookOpen } from "lucide-react";

export default function ChildRegistrationSuccess() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we have a registered child ID in sessionStorage
    const registeredChildId = sessionStorage.getItem('registeredChildId');
    
    if (!registeredChildId && !isLoading) {
      // If navigated directly to this page without going through the registration flow
      toast({
        title: "Incomplete Registration",
        description: "Please complete the registration form first.",
      });
      
      // Use setTimeout to avoid React state update warnings
      setTimeout(() => {
        setLocation("/children/register");
      }, 0);
    }
  }, [isLoading, toast, setLocation]);

  // Use useEffect for auth redirects instead of doing it in render
  useEffect(() => {
    // If not authenticated, redirect to login
    if (!isLoading && !user) {
      setTimeout(() => {
        setLocation("/login");
      }, 0);
    }
    // Verify user is a parent
    else if (user && user.role !== "parent") {
      toast({
        title: "Access Denied",
        description: "Only parent accounts can register children.",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/dashboard");
      }, 0);
    }
  }, [isLoading, user, toast, setLocation]);

  return (
    <AppShell>
      <div className="container mx-auto p-4 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Registration Complete</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Registration Successful!</CardTitle>
            <CardDescription>
              Your child has been successfully registered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center">
              Thank you for registering your child. You can now enroll them in programs and activities.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <Card className="border border-muted">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">View Child Profile</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Access and manage your child's profile information
                  </p>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button variant="outline" className="w-full" onClick={() => setLocation("/dashboard?tab=children")}>
                    Go to Profiles
                  </Button>
                </CardFooter>
              </Card>
              
              <Card className="border border-muted">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Find Programs</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Browse available programs and enroll your child
                  </p>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button className="w-full" onClick={() => {
                    // Get the registered child id from sessionStorage
                    const childDataStr = sessionStorage.getItem('registeredChildId');
                    let childId = '';
                    
                    if (childDataStr) {
                      try {
                        childId = JSON.parse(childDataStr);
                      } catch (error) {
                        console.error("Error parsing child ID:", error);
                      }
                    }
                    
                    // Navigate to programs with child ID as query parameter for filtering
                    setLocation(childId ? `/programs?childId=${childId}` : "/programs");
                  }}>
                    Browse Programs
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button 
              variant="outline"
              onClick={() => setLocation("/children/register")}
              className="mr-2"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Register Another Child
            </Button>
            <Button onClick={() => setLocation("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}