import { RegistrationDashboard } from "@/components/registration/RegistrationDashboard";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function RegistrationPage() {
  const { user, isLoading } = useAuth();
  
  // Redirect to login if not authenticated
  if (!isLoading && !user) {
    return <Redirect to="/login" />;
  }
  
  // Check if user is a parent or admin
  const isParentOrAdmin = user && (user.role === 'parent' || user.role === 'admin');
  
  // Redirect to dashboard if not a parent or admin
  if (!isLoading && !isParentOrAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <DashboardShell>
      <RegistrationDashboard />
    </DashboardShell>
  );
}