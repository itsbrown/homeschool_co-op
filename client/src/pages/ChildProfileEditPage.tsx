import React, { useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { Redirect, useRoute, useLocation } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import ChildRegistrationForm from "@/components/registration/ChildRegistrationForm";
import type { Child } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ChildProfileEditPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [match, params] = useRoute("/children/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const childId = params?.id;

  // Early returns for auth and routing
  if (authLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </ParentAppShell>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!match || !childId) {
    return <Redirect to="/children" />;
  }

  // Fetch the specific child by ID
  const { data: childData, isLoading: childLoading, error } = useQuery<Child>({
    queryKey: [`/api/children/${childId}`],
    enabled: !!childId && isAuthenticated,
  });

  // Handle errors with useEffect to avoid calling toast during render
  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load child information",
        variant: "destructive",
      });
      setLocation("/children");
    }
  }, [error, toast, setLocation]);

  // Handle child not found with useEffect
  useEffect(() => {
    if (!childLoading && !error && childData === undefined) {
      toast({
        title: "Error",
        description: "Child not found",
        variant: "destructive",
      });
      setLocation("/children");
    }
  }, [childLoading, error, childData, toast, setLocation]);

  if (childLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </ParentAppShell>
    );
  }

  // If we're still loading or had errors, don't render the form yet
  if (!childData || error) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </ParentAppShell>
    );
  }

  // Convert the child data to the format expected by ChildRegistrationForm
  const defaultValues = {
    firstName: childData?.firstName || "",
    lastName: childData?.lastName || "",
    birthdate: childData?.birthdate || "",
    gradeLevel: childData?.gradeLevel || "",
    gender: childData?.gender || "",
    school: childData?.school || "",
    interests: Array.isArray(childData?.interests) ? childData.interests : [],
    learningStyle: childData?.learningStyle || "",
    specialNeeds: childData?.specialNeeds || "",
    allergies: childData?.allergies || "",
    emergencyContact: childData?.emergencyContact || "",
    additionalLanguages: childData?.additionalLanguages || "",
    notes: childData?.notes || "",
  };



  const handleSuccess = (updatedChildId: string) => {
    toast({
      title: "Success",
      description: "Child profile updated successfully",
    });
    // Navigate back to children list
    setLocation("/children");
  };

  return (
    <ParentAppShell>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/children")}
            className="mb-4"
            data-testid="button-back-to-children"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Child Profile</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Update your child's profile information
          </p>
        </div>
        
        <ChildRegistrationForm
          childId={childId}
          defaultValues={defaultValues}
          onSuccess={handleSuccess}
        />
      </div>
    </ParentAppShell>
  );
}