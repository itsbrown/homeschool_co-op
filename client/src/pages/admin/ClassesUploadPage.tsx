import React from "react";
import { CsvUploadForm } from "@/components/admin/CsvUploadForm";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ChevronLeft, FileUp } from "lucide-react";

export default function ClassesUploadPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  
  // Check if user is admin
  const isAdmin = user?.role === "admin";
  
  // If not authenticated or not admin, redirect to login
  if (!isLoading && (!isAuthenticated || !isAdmin)) {
    return <Redirect to="/login" />;
  }
  
  return (
    <DashboardShell>
      <div className="container max-w-4xl py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/classes">
                <ChevronLeft className="h-4 w-4" />
                Back to Classes
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Upload Classes</h1>
          </div>
        </div>
        
        <div className="grid gap-8">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <FileUp className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-lg font-medium">Bulk Import Classes</h2>
              <p className="text-muted-foreground">
                Upload a CSV file to add multiple classes at once. The CSV file should include columns for 
                Class Name, Age/Grade Range, Subjects Covered, Instructional Hours, and more.
              </p>
            </div>
          </div>
          
          <CsvUploadForm 
            endpoint="/api/admin/upload/classes"
            title="Upload Classes CSV"
            description="Upload a CSV file to populate classes in the system. The CSV should include headers matching the example template."
            acceptedFileTypes=".csv"
            successMessage="Classes have been successfully imported"
            errorMessage="Failed to import classes"
            queryKeysToInvalidate={["/api/admin-classes", "/api/admin-classes/stats"]}
          />
          
          <div className="mt-4 border rounded-lg p-6">
            <h3 className="text-lg font-medium mb-2">CSV Format Guidelines</h3>
            <p className="text-muted-foreground mb-4">
              Your CSV file should include the following columns:
            </p>
            <div className="bg-muted p-3 rounded-md overflow-x-auto">
              <pre className="text-xs">
                Class Name,Age/Grade Range,Subjects Covered,Instructional Hours,Curriculum Materials,Learning Objectives,Teaching Methods,Sample Activities,Assessments,Extracurricular Opportunities,Pricing
              </pre>
            </div>
            <div className="mt-4 grid gap-2">
              <div>
                <span className="font-medium">Class Name:</span> The name of the class (e.g., "Macaroni", "Tycoons")
              </div>
              <div>
                <span className="font-medium">Age/Grade Range:</span> Age range (e.g., "Ages 0-3") or grade levels (e.g., "Grades 1-2")
              </div>
              <div>
                <span className="font-medium">Subjects Covered:</span> Comma-separated list of subjects taught in the class
              </div>
              <div>
                <span className="font-medium">Instructional Hours:</span> Total hours of instruction (e.g., "900 hours annually")
              </div>
              <div>
                <span className="font-medium">Pricing:</span> The cost of the class (e.g., "$3000")
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}