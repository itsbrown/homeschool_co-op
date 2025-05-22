import React from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import ChildRegistrationForm from "@/components/registration/ChildRegistrationForm";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChildRegistrationPage() {
  const { childId } = useParams();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Redirect if not authenticated
  React.useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  // If editing, fetch the child's current information
  const { data: childData, isLoading: childLoading } = useQuery({
    queryKey: ["/api/children", childId],
    queryFn: () => 
      childId 
        ? fetch(`/api/children/${childId}`).then(res => res.json())
        : Promise.resolve(null),
    enabled: !!childId,
  });
  
  if (authLoading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }
  
  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Ensure only parents can access this page
  if (user && user.role !== 'parent') {
    return (
      <AppShell>
        <div className="container mx-auto p-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>Only parents can register children in the system.</p>
        </div>
      </AppShell>
    );
  }
  
  return (
    <AppShell>
      <div className="container mx-auto p-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">
            {childId ? "Edit Child Information" : "Child Registration"}
          </h1>
          <p className="text-muted-foreground">
            {childId 
              ? "Update your child's information in our system" 
              : "Register your child to enroll them in our programs"}
          </p>
        </div>
        
        {childId && childLoading ? (
          <div className="space-y-4 max-w-3xl mx-auto">
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-12 w-32 ml-auto" />
          </div>
        ) : (
          <ChildRegistrationForm 
            childId={childId} 
            defaultValues={childId ? childData : undefined}
          />
        )}
      </div>
    </AppShell>
  );
}