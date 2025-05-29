import { useAuth } from "@/hooks/useAuth0";
import AppShell from "@/components/layout/AppShell";
import ParentAppShell from "@/components/layout/ParentAppShell";
import EnrollmentAssistant from "@/components/enrollment/EnrollmentAssistant";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Bot } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function EnrollmentAssistantPage() {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user;
  const [, setLocation] = useLocation();
  
  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);
  
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }
  
  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Select the appropriate layout based on user role
  const Shell = user?.role === 'parent' ? ParentAppShell : AppShell;
  
  return (
    <Shell>
      <div className="container mx-auto p-4 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Enrollment Assistant</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI Enrollment Assistant</h1>
            <p className="text-muted-foreground">
              Get personalized help with finding and enrolling in programs
            </p>
          </div>
        </div>
        
        <EnrollmentAssistant />
      </div>
    </Shell>
  );
}