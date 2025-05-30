import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { AdminShell } from "@/components/ui/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ClassCreationForm } from "@/components/admin/ClassCreationForm";
import { useAuth0 } from "@/hooks/useAuth0";
import { useQuery } from "@tanstack/react-query";

export default function ClassCreationPage() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [, params] = useRoute("/admin/classes/edit/:id");
  
  const classId = params?.id ? parseInt(params.id) : undefined;
  const isEditMode = !!classId;

  // Fetch class data if in edit mode
  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ['/api/admin-classes/classes', classId],
    queryFn: async () => {
      if (!classId) return null;
      
      try {
        const response = await fetch(`/api/admin-classes/classes/${classId}`, {
          credentials: "include"
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch class: ${response.status}`);
        }
        
        return response.json();
      } catch (error) {
        console.error("Error fetching class details:", error);
        throw error;
      }
    },
    enabled: isEditMode && !!classId
  });

  // Check if user is admin
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== "admin") {
      setLocation("/");
    }
  }, [isAuthenticated, user, setLocation]);

  const handleBackToClasses = () => {
    setLocation("/admin/classes");
  };

  const pageTitle = isEditMode ? "Edit Class" : "Create New Class";
  const formDescription = isEditMode 
    ? "Update the details for this class" 
    : "Fill out the form below to create a new class for your program";

  return (
    <AdminShell>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleBackToClasses}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{pageTitle}</CardTitle>
            <CardDescription>
              {formDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEditMode && isLoadingClass ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading class data...</span>
              </div>
            ) : (
              <ClassCreationForm
                initialData={classData}
                classId={classId}
                onSuccess={() => setLocation("/admin/classes")}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}