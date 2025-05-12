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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CsvMappingDialog } from "@/components/admin/CsvMappingDialog";

export default function ClassesUploadPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [csvColumns, setCsvColumns] = useState<{ name: string; sample: string }[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

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
      
      // Parse CSV file to extract headers and sample data
      parseCsvFile(selectedFile);
    } else {
      setFile(null);
      toast({
        title: "Invalid file format",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };
  
  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string;
        const lines = csvText.split('\n');
        
        if (lines.length < 2) {
          throw new Error("CSV file must have at least headers and one data row");
        }
        
        // Extract headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        // Parse data rows (up to 10)
        const data: any[] = [];
        for (let i = 1; i < Math.min(lines.length, 11); i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          
          if (values.length !== headers.length) {
            // Skip malformed rows
            continue;
          }
          
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index];
          });
          
          data.push(row);
        }
        
        // Create columns with samples for mapping
        const columns = headers.map(header => ({
          name: header,
          sample: data[0]?.[header] || ""
        }));
        
        setCsvColumns(columns);
        setCsvData(data);
        
        // Show mapping dialog
        setShowMappingDialog(true);
      } catch (error: any) {
        console.error("Error parsing CSV:", error);
        toast({
          title: "Invalid CSV format",
          description: error.message || "Could not parse the CSV file",
          variant: "destructive",
        });
        setFile(null);
      }
    };
    
    reader.onerror = () => {
      toast({
        title: "Error reading file",
        description: "Failed to read the CSV file",
        variant: "destructive",
      });
      setFile(null);
    };
    
    reader.readAsText(file);
  };

  const handleMappingConfirm = async (mapping: Record<string, string>) => {
    if (!file || !csvData) return;
    
    setShowMappingDialog(false);
    setIsLoading(true);
    setUploadStatus("idle");
    
    try {
      // Create FormData with both file and mapping
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));

      // Use existing csv upload route with credentials
      const response = await fetch("/api/admin/upload/classes", {
        method: "POST",
        body: formData,
        credentials: "include" // Include cookies for auth
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
      
      // Force a hard refresh of the classes data
      // First invalidate the query cache
      queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });
      // Then force a refetch to ensure it's updated
      queryClient.resetQueries({ queryKey: ['/api/admin/classes'] });
      
      // Redirect back to classes page after a delay to ensure data is refreshed
      setTimeout(() => {
        setLocation("/admin/classes");
      }, 2500);
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
  
  const handleUpload = () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }
    
    // Show the mapping dialog if we already have CSV data
    if (csvData && csvColumns.length > 0) {
      setShowMappingDialog(true);
    } else {
      // Otherwise, parse the file
      parseCsvFile(file);
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