import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AdminShell } from "@/components/ui/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileSpreadsheet, Upload, Check, AlertCircle, Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CsvMappingDialog } from "@/components/admin/CsvMappingDialog";

const CSV_TEMPLATE = `Class Name,Description,Category,Price,Capacity,Start Date,End Date,Grade Levels,Session Days,Duration (weeks),Sessions Per Week,Session Length (min),Start Time,End Time,Instructor,Location
Math 101,Foundational math skills including arithmetic and problem solving,academic,150.00,20,09/01/2025,12/15/2025,K-5,"Monday,Wednesday",14,2,60,09:00,10:00,Staff Instructor,Main Campus
Science Basics,Introduction to earth science and the scientific method,academic,125.00,25,09/01/2025,12/15/2025,3-8,"Tuesday,Thursday",14,2,90,10:30,12:00,Staff Instructor,Main Campus`;

function processLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let currentValue = "";
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentValue.trim().replace(/^"|"$/g, ''));
      currentValue = "";
    } else {
      currentValue += char;
    }
  }
  result.push(currentValue.trim().replace(/^"|"$/g, ''));
  return result;
}

export default function ClassesUploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [csvColumns, setCsvColumns] = useState<{ name: string; sample: string }[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [totalRows, setTotalRows] = useState(0);

  if (!isAuthenticated || !user || user.role !== "admin") {
    setLocation("/");
    return null;
  }

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "classes_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && (selectedFile.type === "text/csv" || selectedFile.name.endsWith('.csv'))) {
      setFile(selectedFile);
      setUploadStatus("idle");
      setStatusMessage("");
      parseCsvFile(selectedFile);
    } else {
      setFile(null);
      toast({
        title: "Invalid file format",
        description: "Please select a CSV file (.csv)",
        variant: "destructive",
      });
    }
  };

  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string;
        const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length < 2) {
          throw new Error("CSV file must have at least headers and one data row");
        }

        const headers = processLine(lines[0]);
        const allData: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = processLine(lines[i]);
          while (values.length < headers.length) values.push("");
          if (values.length > headers.length) values.length = headers.length;
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index];
          });
          allData.push(row);
        }

        setTotalRows(allData.length);

        const columns = headers.map(header => ({
          name: header,
          sample: allData[0]?.[header] || ""
        }));

        setCsvColumns(columns);
        setCsvData(allData);
        setShowMappingDialog(true);
      } catch (error: any) {
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
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));

      const response = await fetch("/api/admin/upload/classes", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server error (${response.status}). Please try again.`);
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to upload CSV file");
      }

      const successCount = data.processedCount || 0;
      const failedCount = data.failedCount || 0;

      setUploadStatus("success");
      setStatusMessage(
        `Successfully imported ${successCount} class${successCount !== 1 ? "es" : ""}` +
        (failedCount > 0 ? `. ${failedCount} row${failedCount !== 1 ? "s" : ""} failed.` : ".")
      );

      toast({ title: "Import complete", description: `${successCount} classes imported` });

      queryClient.invalidateQueries({ queryKey: ['/api/admin-classes/classes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });

      setTimeout(() => setLocation("/admin/classes"), 2000);
    } catch (error: any) {
      setUploadStatus("error");
      setStatusMessage(error.message || "An error occurred while uploading");
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast({ title: "No file selected", description: "Please select a CSV file", variant: "destructive" });
      return;
    }
    if (csvData && csvColumns.length > 0) {
      setShowMappingDialog(true);
    } else {
      parseCsvFile(file);
    }
  };

  return (
    <AdminShell>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setLocation("/admin/classes")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Import Classes from CSV</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Upload CSV File</CardTitle>
                <CardDescription>
                  Upload a CSV file to bulk-create classes. After uploading, you'll map your columns to the right fields.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => document.getElementById("csv-file")?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); }}
                    onDragLeave={(e) => e.currentTarget.classList.remove("border-primary")}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-primary");
                      const droppedFile = e.dataTransfer.files[0];
                      if (droppedFile && droppedFile.name.endsWith('.csv')) {
                        setFile(droppedFile);
                        setUploadStatus("idle");
                        parseCsvFile(droppedFile);
                      }
                    }}
                  >
                    <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground mt-1">CSV files only</p>
                    {file && (
                      <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-md text-sm font-medium">
                        <FileSpreadsheet className="h-4 w-4" />
                        {file.name} ({totalRows} rows)
                      </div>
                    )}
                  </div>

                  {uploadStatus !== "idle" && (
                    <div className={`p-4 rounded-md flex items-start gap-3 ${
                      uploadStatus === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                    }`}>
                      {uploadStatus === "success" ? (
                        <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <span className={uploadStatus === "success" ? "text-green-700" : "text-red-700"}>
                        {statusMessage}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setLocation("/admin/classes")}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={!file || isLoading} className="gap-2">
                      {isLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
                      ) : (
                        <><Upload className="h-4 w-4" /> Upload & Map Columns</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CSV Template</CardTitle>
                <CardDescription>
                  Download our template to see the expected format
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full gap-2" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4" />
                  Download Template
                </Button>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p className="font-medium text-foreground">Supported columns:</p>
                  <ul className="space-y-1 list-disc pl-4">
                    <li><strong>Class Name</strong> (required)</li>
                    <li>Description</li>
                    <li>Category</li>
                    <li>Price (in dollars, e.g. 150.00)</li>
                    <li>Capacity</li>
                    <li>Start Date, End Date</li>
                    <li>Grade Levels</li>
                    <li>Session Days</li>
                    <li>Duration (weeks)</li>
                    <li>Start Time, End Time</li>
                    <li>Instructor, Location</li>
                  </ul>
                  <p className="mt-3">
                    Columns don't need exact names — you'll map them after uploading.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {csvData && csvColumns.length > 0 && (
          <CsvMappingDialog
            isOpen={showMappingDialog}
            columns={csvColumns}
            sampleData={csvData}
            onClose={() => setShowMappingDialog(false)}
            onConfirm={handleMappingConfirm}
          />
        )}
      </div>
    </AdminShell>
  );
}
