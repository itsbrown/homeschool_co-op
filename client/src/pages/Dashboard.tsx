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
    console.log('🎯 Routing to ParentAppShell for parent user');
    return (
      <ParentAppShell>
        {/* Parent Dashboard with register child button and AI assistant */}
        <RoleDashboard />
      </ParentAppShell>
    );
  }

  // For super admin, admin, educator - show educator dashboard with AI tools
  if (user && ['superAdmin', 'admin', 'educator'].includes(userRole)) {
    console.log('🎯 Routing to Educator Dashboard for role:', userRole);
    return (
      <div className="min-h-screen bg-background">
        {/* AI Status Panel */}
        <div className="container mx-auto pt-6 pb-2">
          <AIStatusPanel />
        </div>
        
        {/* Role-specific Dashboard */}
        <RoleDashboard />
      </div>
    );
  }

  console.log('🎯 Routing to default AppShell for role:', userRole);

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
