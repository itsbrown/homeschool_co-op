import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle, AlertCircle, Download } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ImportUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: number;
}

interface ImportResult {
  schoolId: number;
  parents: { successful: number; failed: number };
  children: { successful: number; failed: number };
  staff: { successful: number; failed: number };
  errors: string[];
}

function ImportUsersDialog({ open, onOpenChange, schoolId }: ImportUsersDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importUsersMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/school-admin/import-users', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type - let browser handle it for FormData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/users"] });
      toast({
        title: "Import Completed",
        description: `Successfully imported users. Check results for details.`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
  };

  const handleImport = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one CSV file to import.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("schoolId", schoolId.toString());

    Array.from(selectedFiles).forEach((file) => {
      formData.append("files", file);
    });

    importUsersMutation.mutate(formData);
  };

  const handleClose = () => {
    setSelectedFiles(null);
    setImportResult(null);
    onOpenChange(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = (templateType: string) => {
    const link = document.createElement('a');
    link.href = `/api/school-admin/csv-template/${templateType}`;
    link.download = `${templateType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTotalSuccessful = (): number => {
    if (!importResult) return 0;
    return importResult.parents.successful + importResult.children.successful + importResult.staff.successful;
  };

  const getTotalFailed = (): number => {
    if (!importResult) return 0;
    return importResult.parents.failed + importResult.children.failed + importResult.staff.failed;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Users</DialogTitle>
          <DialogDescription>
            Upload CSV files to bulk import users. Files should include columns for first name, last name, email, and optionally phone and location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {!importResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">CSV Format Requirements</CardTitle>
                  <CardDescription>
                    Your CSV files should include these columns:
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="font-medium text-sm">Required: First Name, Last Name, Email</p>
                    <p className="text-sm text-muted-foreground">
                      Optional: Phone, Location, Emergency Contact info (for parents), Grade (for children), Position (for staff)
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-sm">File naming: Use "parent", "student", "child", "staff", or "teacher" in filename</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-sm mb-2">Download sample templates:</p>
                    <div className="flex flex-col space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 justify-start"
                        onClick={() => handleDownloadTemplate('parents')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        📋 Parents Template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 justify-start"
                        onClick={() => handleDownloadTemplate('children')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        👶 Children Template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 justify-start"
                        onClick={() => handleDownloadTemplate('staff')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        📥 Staff Template
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Example filenames: "parents.csv", "students.csv", "staff_members.csv"
                  </div>
                </CardContent>
              </Card>

              <div 
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <div className="text-sm font-medium mb-2">
                  Click to upload CSV files or drag and drop
                </div>
                <div className="text-xs text-muted-foreground">
                  Supports multiple CSV files
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFiles && selectedFiles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Selected Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Array.from(selectedFiles).map((file, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {(file.size / 1024).toFixed(1)} KB
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {importUsersMutation.isPending && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  <span>Processing import...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {importResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Import Results
                  </CardTitle>
                  <CardDescription>
                    Import completed for school ID: {importResult.schoolId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Parents</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600">✓ {importResult.parents.successful}</span>
                          <span className="text-red-600">✗ {importResult.parents.failed}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Children</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600">✓ {importResult.children.successful}</span>
                          <span className="text-red-600">✗ {importResult.children.failed}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Staff</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600">✓ {importResult.staff.successful}</span>
                          <span className="text-red-600">✗ {importResult.staff.failed}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex justify-between text-sm font-medium">
                    <span>Total Successful: {getTotalSuccessful()}</span>
                    <span>Total Failed: {getTotalFailed()}</span>
                  </div>

                  {importResult.errors.length > 0 && (
                    <Card className="border-red-200">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          Import Errors ({importResult.errors.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {importResult.errors.slice(0, 10).map((error, index) => (
                            <div key={index} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                              {error}
                            </div>
                          ))}
                          {importResult.errors.length > 10 && (
                            <div className="text-xs text-muted-foreground">
                              ... and {importResult.errors.length - 10} more errors
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Fixed footer outside scrolling area */}
        <div className="flex justify-end space-x-2 pt-4 border-t bg-background">
          {!importResult && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFiles || selectedFiles.length === 0 || importUsersMutation.isPending}
              >
                {importUsersMutation.isPending ? 'Importing...' : 'Import Users'}
              </Button>
            </>
          )}
          {importResult && (
            <Button onClick={handleClose} className="bg-green-600 hover:bg-green-700">
              ✓ Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportUsersDialog;