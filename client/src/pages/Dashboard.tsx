import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardStats } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/dashboard/StatCard";
import AIGenerationCard from "@/components/dashboard/AIGenerationCard";
import RecentLessonsCard from "@/components/dashboard/RecentLessonsCard";
import VirtualTutorCard from "@/components/dashboard/VirtualTutorCard";
import UpcomingEventsCard from "@/components/dashboard/UpcomingEventsCard";
import MarketplaceAnalyticsCard from "@/components/dashboard/MarketplaceAnalyticsCard";
import AIStatusPanel from "@/components/AIStatusPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, BookOpen, CheckCircle, DollarSign, 
  PlusCircle, Wand2
} from "lucide-react";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: fetchDashboardStats,
  });

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
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Educator Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your courses, students, and analytics
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Curriculum
          </Button>
          <Button variant="outline">
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Lessons
          </Button>
        </div>
      </div>
      
      {/* Stats and charts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {statsLoading ? (
          // Skeleton loading for stats
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-card rounded-lg shadow p-5">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-lg" />
              </div>
              <div className="mt-4">
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))
        ) : (
          // Actual stats cards
          <>
            <StatCard
              title="Total Students"
              value={stats?.totalStudents || 0}
              icon={<Users className="h-6 w-6" />}
              change={{ value: "+12%", isPositive: true }}
            />
            <StatCard
              title="Active Courses"
              value={stats?.activeCourses || 0}
              icon={<BookOpen className="h-6 w-6" />}
              change={{ value: "+2", isPositive: true }}
            />
            <StatCard
              title="Lesson Completion"
              value={`${stats?.completionRate || 0}%`}
              icon={<CheckCircle className="h-6 w-6" />}
              change={{ value: "+5%", isPositive: true }}
            />
            <StatCard
              title="Marketplace Sales"
              value={`$${stats?.marketplaceSales || 0}`}
              icon={<DollarSign className="h-6 w-6" />}
              change={{ value: "+18%", isPositive: true }}
            />
          </>
        )}
      </div>
      
      {/* AI Status Panel */}
      <div className="mb-6">
        <AIStatusPanel />
      </div>
      
      {/* Main content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Activities and Lessons column */}
        <div className="lg:col-span-2 space-y-6">
          <AIGenerationCard />
          <RecentLessonsCard />
        </div>
        
        {/* Side column */}
        <div className="space-y-6">
          <VirtualTutorCard />
          <UpcomingEventsCard />
          <MarketplaceAnalyticsCard />
        </div>
      </div>
    </AppShell>
  );
}
