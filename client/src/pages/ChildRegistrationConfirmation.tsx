import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Check, AlertCircle, ArrowLeft, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface ChildFormData {
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  school: string | null;
  specialNeeds: string | null;
  allergies: string | null;
  medicalInfo: string | null;
  // Add missing fields that are expected by the server
  learningStyle: string | null;
  interests: string[] | null;
  profileImage: string | null;
}

export default function ChildRegistrationConfirmation() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [childData, setChildData] = useState<ChildFormData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Retrieve stored data from sessionStorage
    const storedData = sessionStorage.getItem('childRegistrationData');
    
    if (storedData) {
      try {
        setChildData(JSON.parse(storedData));
      } catch (error) {
        console.error("Error parsing stored data:", error);
        toast({
          title: "Error",
          description: "There was a problem retrieving your registration data. Please try again.",
          variant: "destructive",
        });
        
        // Use setTimeout to avoid updating during render
        setTimeout(() => {
          setLocation("/children/register");
        }, 0);
      }
    } else {
      // No data in session storage, redirect back to registration form
      toast({
        title: "Missing Information",
        description: "Please complete the registration form first.",
      });
      
      // Use setTimeout to avoid updating during render
      setTimeout(() => {
        setLocation("/children/register");
      }, 0);
    }
  }, [toast, setLocation]);

  // If not authenticated, redirect to login
  useEffect(() => {
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSubmit = async () => {
    if (!childData) return;
    
    setIsSubmitting(true);
    try {
      // Submit data to API
      const response = await apiRequest("POST", "/api/children", childData);
      const newChild = await response.json();
      
      // Store the new child ID in sessionStorage for the success page
      if (newChild && newChild.id) {
        sessionStorage.setItem('registeredChildId', JSON.stringify(newChild.id));
      }
      
      // Clear form data from session storage
      sessionStorage.removeItem('childRegistrationData');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
      
      // Navigate to success page
      setLocation("/children/register/success");
    } catch (error) {
      console.error("Error registering child:", error);
      toast({
        title: "Registration Failed",
        description: "There was a problem registering your child. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setLocation("/children/register");
  };

  if (!childData) {
    return (
      <AppShell>
        <div className="container mx-auto p-4 flex items-center justify-center h-[80vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
                Loading Registration Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>Retrieving your registration information...</p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setLocation("/children/register")}>
                Return to Registration Form
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

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
              <BreadcrumbLink href="/children/register">Register Child</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Confirm Registration</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Confirm Registration</h1>
            <p className="text-muted-foreground">
              Please review and confirm your child's information
            </p>
          </div>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Registration Summary</CardTitle>
            <CardDescription>
              Review the information below before submitting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">First Name</h3>
                  <p className="text-base">{childData.firstName}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Last Name</h3>
                  <p className="text-base">{childData.lastName}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Birth Date</h3>
                  <p className="text-base">{formatDate(childData.birthdate)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Grade Level</h3>
                  <p className="text-base">{childData.gradeLevel}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Allergies</h3>
                <p className="text-base">{childData.allergies || "None specified"}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Special Needs or Accommodations</h3>
                <p className="text-base">{childData.specialNeeds || "None specified"}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Medical Information</h3>
                <p className="text-base">{childData.medicalInfo || "None specified"}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleEdit}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Edit Information
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>Registering...</>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm & Register
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}