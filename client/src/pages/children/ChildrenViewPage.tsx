import React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { User, Plus } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useAuth } from "@/hooks/useAuth0";

export default function ChildrenViewPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Fetch children data
  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ["/api/children"],
    enabled: isAuthenticated && user?.role === "parent",
    // Ensure we always have an array, even if the API returns something else
    select: (data) => Array.isArray(data) ? data : [],
  });

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
  if (user && user.role !== 'parent') {
    return (
      <ParentAppShell>
        <div className="container mx-auto p-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>Only parents can access the children management system.</p>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">My Children</h1>
            <p className="text-muted-foreground">
              View and manage your children's profiles
            </p>
          </div>
          <Button asChild>
            <Link href="/children/register">
              <Plus className="mr-2 h-4 w-4" />
              Register Child
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Children Profiles</CardTitle>
            <CardDescription>Manage your children's information and enrollments</CardDescription>
          </CardHeader>
          <CardContent>
            {childrenLoading ? (
              <div className="text-center py-8">Loading children profiles...</div>
            ) : childrenData?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-2" />
                <p>No children registered yet</p>
                <Button className="mt-4" asChild>
                  <Link href="/children/register">Register a Child</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {childrenData?.map((child, index) => (
                  <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{child.name}</h3>
                        <p className="text-sm text-muted-foreground">Age: {child.age}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/children/${child.id}`}>View Profile</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ParentAppShell>
  );
}