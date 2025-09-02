import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileSpreadsheet, Upload, Check, AlertCircle, Users, UserPlus, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth0";
import AppShell from "@/components/layout/AppShell";

export default function ContactImportPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadResults, setUploadResults] = useState<any>(null);

  // Check if user is school admin
  if (!isAuthenticated || !user || !['school_admin', 'schoolAdmin'].includes(user.role)) {
    setLocation("/");
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const csvFiles = selectedFiles.filter(file => 
      file.type === "text/csv" || file.name.endsWith('.csv')
    );
    
    if (csvFiles.length !== selectedFiles.length) {
      toast({
        title: "Invalid file format",
        description: "Please select only CSV files",
        variant: "destructive",
      });
    }
    
    if (csvFiles.length > 0) {
      setFiles(csvFiles);
      setUploadStatus("idle");
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select CSV files to upload",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append("files", file);
      });

      // Send school-specific contact import request
      const response = await fetch("/api/school-admin/contact-import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to upload files");
      }

      setUploadStatus("success");
      setUploadResults(data.results);
      
      toast({
        title: "Upload successful",
        description: `Successfully processed ${files.length} file(s) for your school`,
      });

    } catch (error: any) {
      console.error("Error uploading files:", error);
      setUploadStatus("error");
      
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFileTypeFromName = (fileName: string) => {
    const name = fileName.toLowerCase();
    if (name.includes('parent') || name.includes('user')) return 'Parents/Users';
    if (name.includes('child') || name.includes('student')) return 'Children/Students';
    if (name.includes('enrollment')) return 'Enrollments';
    if (name.includes('payment')) return 'Payments';
    if (name.includes('staff') || name.includes('teacher')) return 'Staff';
    return 'Unknown';
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => setLocation("/schools/students")}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Students
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Import Contacts</h1>
            <p className="text-muted-foreground">
              Import contacts and create accounts for your school
            </p>
          </div>
        </div>

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upload">Upload Files</TabsTrigger>
            <TabsTrigger value="guide">Import Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload CSV Files
                </CardTitle>
                <CardDescription>
                  Select multiple CSV files to import contacts for your school. All imported accounts will be automatically associated with your school.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="csv-files">CSV Files</Label>
                  <Input
                    id="csv-files"
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Select one or more CSV files. Files are automatically categorized by name (parents, children, staff, etc.)
                  </p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-medium">Selected Files ({files.length})</h3>
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="font-medium">{file.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {(file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Badge variant="outline">
                              {getFileTypeFromName(file.name)}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button 
                  onClick={handleUpload} 
                  disabled={isLoading || files.length === 0}
                  className="w-full"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? "Uploading..." : `Import ${files.length} File(s) to Your School`}
                </Button>

                {uploadStatus === "success" && uploadResults && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-green-800">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">Import Completed Successfully</span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="text-center p-2 bg-white rounded border">
                        <div className="font-medium text-lg text-blue-600">
                          {uploadResults.parents?.successful || 0}
                        </div>
                        <div className="text-muted-foreground">Parents Created</div>
                        {uploadResults.parents?.failed > 0 && (
                          <div className="text-red-600 text-xs">
                            {uploadResults.parents.failed} failed
                          </div>
                        )}
                      </div>
                      
                      <div className="text-center p-2 bg-white rounded border">
                        <div className="font-medium text-lg text-green-600">
                          {uploadResults.children?.successful || 0}
                        </div>
                        <div className="text-muted-foreground">Students Added</div>
                        {uploadResults.children?.failed > 0 && (
                          <div className="text-red-600 text-xs">
                            {uploadResults.children.failed} failed
                          </div>
                        )}
                      </div>
                      
                      <div className="text-center p-2 bg-white rounded border">
                        <div className="font-medium text-lg text-purple-600">
                          {uploadResults.enrollments?.successful || 0}
                        </div>
                        <div className="text-muted-foreground">Enrollments</div>
                        {uploadResults.enrollments?.failed > 0 && (
                          <div className="text-red-600 text-xs">
                            {uploadResults.enrollments.failed} failed
                          </div>
                        )}
                      </div>
                      
                      <div className="text-center p-2 bg-white rounded border">
                        <div className="font-medium text-lg text-orange-600">
                          {uploadResults.payments?.successful || 0}
                        </div>
                        <div className="text-muted-foreground">Payments</div>
                        {uploadResults.payments?.failed > 0 && (
                          <div className="text-red-600 text-xs">
                            {uploadResults.payments.failed} failed
                          </div>
                        )}
                      </div>
                    </div>

                    {uploadResults.errors && uploadResults.errors.length > 0 && (
                      <div className="mt-4">
                        <details className="bg-red-50 border border-red-200 rounded p-3">
                          <summary className="cursor-pointer font-medium text-red-800">
                            View Errors ({uploadResults.errors.length})
                          </summary>
                          <div className="mt-2 space-y-1 text-sm text-red-700">
                            {uploadResults.errors.map((error: string, index: number) => (
                              <div key={index} className="text-xs bg-white p-2 rounded border">
                                {error}
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {uploadStatus === "error" && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">Upload Failed</span>
                    </div>
                    <p className="text-sm text-red-600 mt-2">
                      There was an error processing your files. Please check the file format and try again.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    File Naming Guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Name your CSV files to match the content:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• <code className="bg-gray-100 px-1 rounded">parents.csv</code> or <code className="bg-gray-100 px-1 rounded">users.csv</code> - Parent/User accounts</li>
                      <li>• <code className="bg-gray-100 px-1 rounded">children.csv</code> or <code className="bg-gray-100 px-1 rounded">students.csv</code> - Student profiles</li>
                      <li>• <code className="bg-gray-100 px-1 rounded">staff.csv</code> or <code className="bg-gray-100 px-1 rounded">teachers.csv</code> - Staff members</li>
                      <li>• <code className="bg-gray-100 px-1 rounded">enrollments.csv</code> - Class enrollments</li>
                      <li>• <code className="bg-gray-100 px-1 rounded">payments.csv</code> - Payment records</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    CSV Format Examples
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Parents CSV Format:</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs font-mono">
                      First Name,Last Name,Email,Phone<br/>
                      John,Smith,john@email.com,555-1234<br/>
                      Jane,Doe,jane@email.com,555-5678
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Students CSV Format:</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs font-mono">
                      First Name,Last Name,Parent Email,Grade<br/>
                      Alex,Smith,john@email.com,3rd Grade<br/>
                      Emma,Doe,jane@email.com,1st Grade
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    School Association & Account Creation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">Import Process:</h4>
                      <ol className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                          <span>All contacts are automatically linked to your school</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                          <span>User accounts are created with school association</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                          <span>Students are enrolled in your school system</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">4</span>
                          <span>Welcome emails are sent with login credentials</span>
                        </li>
                      </ol>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-medium">After Import:</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>Parents receive school-specific invitations</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <UserPlus className="h-4 w-4" />
                          <span>Accounts are ready for your school portal</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>View imported users in Students & Staff sections</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          <span>All data is associated with your school only</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}