import React from "react";
import { useLocation } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import PaymentManagement from "@/components/payments/PaymentManagement";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";

export default function PaymentsPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { activeRole } = useRole();
  
  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);
  
  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ParentAppShell>
    );
  }
  
  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Ensure only parents can access this page
  if (user && activeRole !== 'parent') {
    return (
      <ParentAppShell>
        <div className="container mx-auto py-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p>Only parents can access the payment management system.</p>
          </div>
        </div>
      </ParentAppShell>
    );
  }
  
  return (
    <ParentAppShell>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Payments</h1>
            <p className="text-muted-foreground mt-1">
              View and manage payments for your children's programs and classes
            </p>
          </div>
        </div>
        
        <PaymentManagement />
      </div>
    </ParentAppShell>
  );
}