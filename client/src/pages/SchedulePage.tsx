import React from "react";
import { useLocation } from "wouter";
import AppShell from "@/components/layout/AppShell";
import ParentAppShell from "@/components/layout/ParentAppShell";
import FamilySchedule from "@/components/schedule/FamilySchedule";
import { useAuth } from "@/hooks/useAuth0";

export default function SchedulePage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);
  
  if (isLoading) {
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
          <p>Only parents can access the family schedule.</p>
        </div>
      </AppShell>
    );
  }
  
  return (
    <ParentAppShell>
      <div className="container mx-auto p-4">
        <FamilySchedule />
      </div>
    </ParentAppShell>
  );
}