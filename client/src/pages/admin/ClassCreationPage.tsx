import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminShell } from "@/components/ui/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ClassCreationForm } from "@/components/admin/ClassCreationForm";
import { useAuth } from "@/hooks/useAuth";

export default function ClassCreationPage() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();

  // Check if user is admin
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== "admin") {
      setLocation("/");
    }
  }, [isAuthenticated, user, setLocation]);

  const handleBackToClasses = () => {
    setLocation("/admin/classes");
  };

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
            <h1 className="text-3xl font-bold tracking-tight">Create New Class</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create New Class</CardTitle>
            <CardDescription>
              Fill out the form below to create a new class for your program
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClassCreationForm
              onSuccess={() => setLocation("/admin/classes")}
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}