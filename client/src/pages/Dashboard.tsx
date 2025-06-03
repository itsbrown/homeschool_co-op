import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth0";
import { useLocation } from "wouter";
import AppShell from "@/components/layout/AppShell";
import ParentAppShell from "@/components/layout/ParentAppShell";
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
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }
  
  // Use ParentAppShell for parent users, standard AppShell for others
  const userRole = user?.role || 'parent';
  
  console.log('🏠 Dashboard page - User role:', userRole);
  console.log('🔍 User email:', user?.email);
  console.log('🔍 User metadata role:', user?.role);
  console.log('🔍 Final determined role:', userRole);
  
  if (user && userRole === 'parent') {
    return (
      <ParentAppShell>
        <div className="container mx-auto p-4">
          {/* Parent Dashboard */}
          <RoleDashboard />
        </div>
      </ParentAppShell>
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
