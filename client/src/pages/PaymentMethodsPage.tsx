import { useEffect } from "react";
import { useLocation } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import CardManagementPanel from "@/components/payments/CardManagementPanel";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";

export default function PaymentMethodsPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { activeRole } = useRole();

  useEffect(() => {
    document.title = "Payment Methods - American Seekers Academy";
  }, []);

  useEffect(() => {
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
    return null;
  }

  if (user && activeRole !== "parent") {
    return (
      <ParentAppShell>
        <div className="container mx-auto py-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p>Only parents can access payment methods.</p>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Payment Methods</h1>
          <p className="text-muted-foreground mt-1">
            Manage your saved cards and automatic payment preferences
          </p>
        </div>
        <CardManagementPanel />
      </div>
    </ParentAppShell>
  );
}
