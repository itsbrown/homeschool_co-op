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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Upload, FileText, CheckCircle, AlertCircle, Download, Eye, Users, UserPlus, RefreshCw } from "lucide-react";
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
  parents: { successful: number; failed: number; skipped: number; updated: number };
  children: { successful: number; failed: number; skipped: number; updated: number };
  staff: { successful: number; failed: number; skipped: number; updated: number };
  errors: string[];
  duplicatesHandled: string[];
}

interface ImportPreview {
  newRecords: { parents: any[], children: any[], enrollments: any[], payments: any[] };
  duplicates: Array<{
    type: string;
    existingRecord: any;
    newRecord: any;
    matchedBy: string;
  }>;
  summary: {
    totalNew: number;
    totalDuplicates: number;
    willSkip: number;
    willOverride: number;
    willUpdate: number;
  };
}

type ImportMode = 'skip' | 'override' | 'update';

function ImportUsersDialog({ open, onOpenChange, schoolId }: ImportUsersDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/account-import/preview-import', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Preview failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportPreview(data.preview);
      setShowPreview(true);
      toast({
        title: "Preview Generated",
        description: `Found ${data.preview.summary.totalNew} new records and ${data.preview.summary.totalDuplicates} duplicates.`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importUsersMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/account-import/upload-accounts', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
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

  const handlePreview = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one CSV file to preview.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("schoolId", schoolId.toString());
    formData.append("mode", importMode);

    Array.from(selectedFiles).forEach((file) => {
      formData.append("files", file);
    });

    previewMutation.mutate(formData);
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
    formData.append("mode", importMode);

    Array.from(selectedFiles).forEach((file) => {
      formData.append("files", file);
    });

    importUsersMutation.mutate(formData);
  };

  const handleClose = () => {
    setSelectedFiles(null);
    setImportResult(null);
    setImportPreview(null);
    setShowPreview(false);
    setImportMode('skip');
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
                <>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Duplicate Handling</CardTitle>
                      <CardDescription>
                        Choose how to handle records that already exist in the system
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup value={importMode} onValueChange={(value) => setImportMode(value as ImportMode)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="skip" id="skip" />
                          <Label htmlFor="skip" className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Skip Duplicates</div>
                              <div className="text-xs text-muted-foreground">Leave existing records unchanged</div>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="override" id="override" />
                          <Label htmlFor="override" className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Override Duplicates</div>
                              <div className="text-xs text-muted-foreground">Replace existing records completely</div>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="update" id="update" />
                          <Label htmlFor="update" className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Update Existing</div>
                              <div className="text-xs text-muted-foreground">Merge new data with existing records</div>
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}

          {(previewMutation.isPending || importUsersMutation.isPending) && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  <span>{previewMutation.isPending ? 'Generating preview...' : 'Processing import...'}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {showPreview && importPreview && !importResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  Import Preview
                </CardTitle>
                <CardDescription>
                  Review what will happen before importing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-green-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-green-700">New Records</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-sm">
                        <div>Parents: {importPreview.newRecords.parents.length}</div>
                        <div>Children: {importPreview.newRecords.children.length}</div>
                        <div>Enrollments: {importPreview.newRecords.enrollments.length}</div>
                        <div>Payments: {importPreview.newRecords.payments.length}</div>
                        <div className="font-medium pt-1 border-t">Total: {importPreview.summary.totalNew}</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-yellow-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-yellow-700">Duplicates Found</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-sm">
                        <div>Total Duplicates: {importPreview.summary.totalDuplicates}</div>
                        {importMode === 'skip' && <div>Will Skip: {importPreview.summary.willSkip}</div>}
                        {importMode === 'override' && <div>Will Override: {importPreview.summary.willOverride}</div>}
                        {importMode === 'update' && <div>Will Update: {importPreview.summary.willUpdate}</div>}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {importPreview.duplicates.length > 0 && (
                  <Card className="border-orange-200">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                        <AlertCircle className="h-4 w-4" />
                        Duplicate Details ({importPreview.duplicates.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {importPreview.duplicates.slice(0, 10).map((duplicate, index) => (
                          <div key={index} className="text-xs bg-orange-50 p-2 rounded border-l-2 border-orange-300">
                            <div className="font-medium">{duplicate.type.charAt(0).toUpperCase() + duplicate.type.slice(1)}</div>
                            <div className="text-muted-foreground">
                              {duplicate.newRecord.firstName && duplicate.newRecord.lastName 
                                ? `${duplicate.newRecord.firstName} ${duplicate.newRecord.lastName}`
                                : duplicate.newRecord.email || duplicate.newRecord.parentEmail || 'Record'
                              }
                            </div>
                            <div className="text-xs text-muted-foreground">Matched by: {duplicate.matchedBy}</div>
                          </div>
                        ))}
                        {importPreview.duplicates.length > 10 && (
                          <div className="text-xs text-muted-foreground text-center">
                            ... and {importPreview.duplicates.length - 10} more duplicates
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex justify-center pt-2">
                  <Button 
                    onClick={handleImport}
                    disabled={importUsersMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {importUsersMutation.isPending ? 'Importing...' : 'Proceed with Import'}
                  </Button>
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
          {!importResult && !showPreview && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!selectedFiles || selectedFiles.length === 0 || previewMutation.isPending}
                variant="outline"
              >
                <Eye className="mr-2 h-4 w-4" />
                {previewMutation.isPending ? 'Analyzing...' : 'Preview Import'}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFiles || selectedFiles.length === 0 || importUsersMutation.isPending || previewMutation.isPending}
              >
                {importUsersMutation.isPending ? 'Importing...' : 'Import Directly'}
              </Button>
            </>
          )}
          {showPreview && !importResult && (
            <>
              <Button type="button" variant="outline" onClick={() => setShowPreview(false)}>
                ← Back to Files
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