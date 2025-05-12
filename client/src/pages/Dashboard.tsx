import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import AppShell from "@/components/layout/AppShell";
import RoleDashboard from "@/components/dashboards/RoleDashboard";
import AIStatusPanel from "@/components/AIStatusPanel";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* AI Status Panel */}
      <div className="mb-6">
        <AIStatusPanel />
      </div>
      
      {/* Role-specific Dashboard */}
      <RoleDashboard />
    </AppShell>
  );
}
