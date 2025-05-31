import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth0";
import { useLocation } from "wouter";
import BaseLayout from "@/components/layout/BaseLayout";
import RoleDashboard from "@/components/dashboards/RoleDashboard";
import AIStatusPanel from "@/components/AIStatusPanel";

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <BaseLayout pageTitle="Loading...">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout pageTitle="Dashboard">
      {/* AI Status Panel */}
      <div className="mb-6">
        <AIStatusPanel />
      </div>
      
      {/* Role-specific Dashboard */}
      <RoleDashboard />
    </BaseLayout>
  );
}
