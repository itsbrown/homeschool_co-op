import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AdminShell } from "@/components/ui/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileSpreadsheet, Upload, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

export default function ClassesUploadPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // Check if user is admin
  const isAdmin = user?.role === "admin";
  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && (selectedFile.type === "text/csv" || selectedFile.name.endsWith('.csv'))) {
      setFile(selectedFile);
      setUploadStatus("idle");
      setStatusMessage("");
    } else {
      setFile(null);
      toast({
        title: "Invalid file format",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setUploadStatus("idle");
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use existing csv upload route
      const response = await fetch("/api/admin/upload/classes", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to upload CSV file");
      }

      setUploadStatus("success");
      setStatusMessage(`Successfully imported ${data.processedCount || 0} classes`);
      
      toast({
        title: "Upload successful",
        description: `Successfully imported ${data.processedCount || 0} classes`,
      });
    } catch (error: any) {
      console.error("Error uploading CSV:", error);
      setUploadStatus("error");
      setStatusMessage(error.message || "An error occurred while uploading the file");
      
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
            <h1 className="text-3xl font-bold tracking-tight">Upload Classes</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Import Classes from CSV</CardTitle>
            <CardDescription>
              Upload a CSV file containing class data to bulk import into the system.
              The CSV should include headers for title, description, price, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Label 
                    htmlFor="csv-file" 
                    className="cursor-pointer flex flex-col items-center justify-center gap-2"
                  >
                    <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                    <div className="flex flex-col items-center">
                      <span className="font-medium">Click to upload a CSV file</span>
                      <span className="text-xs text-muted-foreground">
                        or drag and drop
                      </span>
                    </div>
                    {file && (
                      <div className="mt-2 text-sm font-medium text-primary">
                        {file.name}
                      </div>
                    )}
                  </Label>
                </div>
              </div>

              {uploadStatus !== "idle" && (
                <div className={`p-4 rounded-md ${uploadStatus === "success" ? "bg-green-50" : "bg-red-50"}`}>
                  <div className="flex items-center gap-2">
                    {uploadStatus === "success" ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className={uploadStatus === "success" ? "text-green-700" : "text-red-700"}>
                      {statusMessage}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleBackToClasses}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload} 
                  disabled={!file || isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload CSV
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}