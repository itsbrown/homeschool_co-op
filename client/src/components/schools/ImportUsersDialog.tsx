import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ImportUsersDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ImportResult {
  parents: { successful: number; failed: number };
  children: { successful: number; failed: number };
  staff: { successful: number; failed: number };
  errors: string[];
  schoolId?: number;
}

export default function ImportUsersDialog({ open, onClose }: ImportUsersDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const importUsersMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/school-admin/contact-import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to import users');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data.results);
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      toast({
        title: 'Import Completed',
        description: 'User import has been processed. Check the results below.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import users.',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
    setImportResult(null);
  };

  const handleImport = () => {
    if (selectedFiles && selectedFiles.length > 0) {
      importUsersMutation.mutate(selectedFiles);
    }
  };

  const handleClose = () => {
    setSelectedFiles(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const getTotalSuccessful = () => {
    if (!importResult) return 0;
    return importResult.parents.successful + importResult.children.successful + importResult.staff.successful;
  };

  const getTotalFailed = () => {
    if (!importResult) return 0;
    return importResult.parents.failed + importResult.children.failed + importResult.staff.failed;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Users</DialogTitle>
          <DialogDescription>
            Upload CSV files to bulk import users. Files should include columns for first name, last name, email, and optionally phone and location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!importResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">CSV Format Requirements</CardTitle>
                  <CardDescription className="text-xs">
                    Your CSV files should include these columns:
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div><strong>Required:</strong> First Name, Last Name, Email</div>
                  <div><strong>Optional:</strong> Phone, Location, Grade (for children), Position (for staff)</div>
                  <div><strong>File naming:</strong> Use "parent", "student", "child", "staff", or "teacher" in filename</div>
                  <Separator />
                  <div className="text-xs text-muted-foreground">
                    Example: "parents.csv", "students.csv", "staff_members.csv"
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

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFiles || selectedFiles.length === 0 || importUsersMutation.isPending}
                >
                  {importUsersMutation.isPending ? 'Importing...' : 'Import Users'}
                </Button>
              </div>
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

              <div className="flex justify-end">
                <Button onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}