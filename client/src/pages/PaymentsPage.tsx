import React from "react";
import { useLocation } from "wouter";
import BaseLayout from "@/components/layout/BaseLayout";
import PaymentManagement from "@/components/payments/PaymentManagement";
import { useAuth } from "@/hooks/useAuth0";

export default function PaymentsPage() {
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
      <BaseLayout pageTitle="Payments">
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </BaseLayout>
    );
  }
  
  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Ensure only parents can access this page
  if (user && user.role !== 'parent') {
    return (
      <BaseLayout pageTitle="Access Denied">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>Only parents can access the payment management system.</p>
        </div>
      </BaseLayout>
    );
  }
  
  return (
    <BaseLayout pageTitle="Payment Management">
      <div className="space-y-6">
        <div>
          <p className="text-muted-foreground">
            View and manage payments for your children's programs and classes
          </p>
        </div>
        
        <PaymentManagement />
      </div>
    </ParentAppShell>
  );
}