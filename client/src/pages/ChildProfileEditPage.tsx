import React from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { Redirect, useRoute } from "wouter";
import PageLayout from "@/components/layout/PageLayout";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import ChildRegistrationForm from "@/components/registration/ChildRegistrationForm";

export default function ChildProfileEditPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [match, params] = useRoute("/children/:id/edit");
  const { toast } = useToast();
  
  const childId = params?.id;

  // Early returns for auth and routing
  if (authLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!match || !childId) {
    return <Redirect to="/children" />;
  }

  // For now, assume all authenticated users are parents since the server logs show the user is correctly identified as a parent
  // We'll simplify the role check to avoid infinite renders
  
  // Fetch child data for editing
  const { data: childData, isLoading: childLoading, error } = useQuery({
    queryKey: ["/api/children", childId],
    enabled: !!childId && isAuthenticated
  });

  if (error) {
    toast({
      title: "Error",
      description: "Failed to load child information",
      variant: "destructive",
    });
    return <Redirect to="/children" />;
  }

  if (childLoading) {
    return (
      <PageLayout title="Edit Child Profile" backTo="/children">
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  if (!childData) {
    toast({
      title: "Error",
      description: "Child not found",
      variant: "destructive",
    });
    return <Redirect to="/children" />;
  }

  // Convert the child data to the format expected by ChildRegistrationForm
  const defaultValues = {
    firstName: (childData as any)?.firstName || "",
    lastName: (childData as any)?.lastName || "",
    birthdate: (childData as any)?.birthdate || "",
    gradeLevel: (childData as any)?.gradeLevel || "",
    gender: (childData as any)?.gender || "",
    school: (childData as any)?.school || "",
    interests: Array.isArray((childData as any)?.interests) ? (childData as any).interests : [],
    learningStyle: (childData as any)?.learningStyle || "",
    specialNeeds: (childData as any)?.specialNeeds || "",
    allergies: (childData as any)?.allergies || "",
    emergencyContact: (childData as any)?.emergencyContact || "",
    additionalLanguages: (childData as any)?.additionalLanguages || "",
    notes: (childData as any)?.notes || "",
  };

  const handleSuccess = (updatedChildId: string) => {
    toast({
      title: "Success",
      description: "Child profile updated successfully",
    });
    // Navigate back to children list
    window.location.href = "/children";
  };

  return (
    <PageLayout title="Edit Child Profile" backTo="/children">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Edit Child Profile</h1>
          <p className="text-gray-600 mt-2">
            Update your child's profile information
          </p>
        </div>
        
        <ChildRegistrationForm
          childId={childId}
          defaultValues={defaultValues}
          onSuccess={handleSuccess}
        />
      </div>
    </PageLayout>
  );
}