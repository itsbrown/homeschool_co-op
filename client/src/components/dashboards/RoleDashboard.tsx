import React from "react";
import { useAuth } from "@/components/SupabaseProvider";
import AdminDashboard from "./AdminDashboard";
import EducatorDashboard from "./EducatorDashboard";
import ParentDashboard from "./ParentDashboard";
import LearnerDashboard from "./LearnerDashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoleDashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  
  if (isLoading) {
    return <DashboardSkeleton />;
  }
  
  if (!isAuthenticated || !user) {
    // This should not happen as the dashboard should only be shown to authenticated users
    // but we handle it gracefully just in case
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p>You need to be logged in to view your dashboard</p>
      </div>
    );
  }
  
  // Determine user role from Supabase user metadata or email
  const userEmail = user.email;
  const userRole = user.user_metadata?.role || 
                  (userEmail === 'coreycreates@gmail.com' || 
                   userEmail === 'contact.americanseekersacademy@gmail.com' ||
                   userEmail === 'contact@americanseekersacademy.com' ? 'school_admin' : 'parent');

  console.log('👤 User logged in with role:', userRole);

  // Render the appropriate dashboard based on user role
  switch (userRole) {
    case 'admin':
    case 'school_admin':
    case 'schoolAdmin':
      return <AdminDashboard />;
    case 'educator':
      return <EducatorDashboard />;
    case 'parent':
      return <ParentDashboard />;
    case 'learner':
      return <LearnerDashboard />;
    default:
      // Fallback for any undefined or new roles
      return (
        <div className="container mx-auto p-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to ASA Platform!</h1>
          <p>Your role-specific dashboard is being set up.</p>
          <p className="text-sm text-muted-foreground mt-4">
            Current role: {userRole || 'Unknown role'}
          </p>
        </div>
      );
  }
}

// Loading skeleton for dashboard
function DashboardSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      
      <Skeleton className="h-12 w-full" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}