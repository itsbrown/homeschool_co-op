import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  Eye, 
  EyeOff, 
  Loader2,
  FileType,
  Image,
  File as FileIcon,
  Bell,
  Users
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/layout/AppShell';
import { format } from 'date-fns';
import { UserLookup, type UserResult } from '@/components/ui/user-lookup';

interface SchoolDocument {
  id: number;
  schoolId: number;
  uploadedBy: number;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  isPublished: boolean;
  visibleToAll: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SchoolData {
  id: number;
  name: string;
}

interface ClassInfo {
  id: number;
  title: string;
  enrollmentCount?: number;
}

type NotificationTargetType = 'all_parents' | 'class_specific' | 'individual';

const categoryLabels: Record<string, string> = {
  policy: 'Policy',
  handbook: 'Handbook',
  form: 'Form',
  newsletter: 'Newsletter',
  calendar: 'Calendar',
  curriculum: 'Curriculum',
  other: 'Other'
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileType className="h-8 w-8 text-red-500" />;
  if (mimeType.includes('word')) return <FileText className="h-8 w-8 text-blue-700" />;
  return <FileIcon className="h-8 w-8 text-gray-500" />;
}

export default function DocumentManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: 'other',
    isPublished: true,
    visibleToAll: true
  });

  const [sendNotification, setSendNotification] = useState(true);
  const [notificationTargetType, setNotificationTargetType] = useState<NotificationTargetType>('all_parents');
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);

  const { data: schoolData } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user?.email,
  });

  const { data: documentsData, isLoading } = useQuery<{ success: boolean; documents: SchoolDocument[] }>({
    queryKey: ['/api/schools/documents'],
    enabled: !!user?.email,
  });

  const documents = documentsData?.documents || [];

  const { data: classesData } = useQuery<{ items: ClassInfo[], total: number }>({
    queryKey: ['/api/school-admin/classes'],
    enabled: !!user?.email,
  });
  const classes = classesData?.items || [];

  const buildNotificationTargetData = () => {
    if (!sendNotification || !uploadForm.isPublished) return null;

    switch (notificationTargetType) {
      case 'all_parents':
        return { targetType: 'all_parents' };
      case 'class_specific':
        return { targetType: 'class_specific', classIds: selectedClasses };
      case 'individual':
        return { targetType: 'individual', userIds: selectedUsers.map(u => u.id) };
      default:
        return null;
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('title', uploadForm.title || file.name);
      formData.append('description', uploadForm.description);
      formData.append('category', uploadForm.category);
      formData.append('isPublished', uploadForm.isPublished.toString());
      formData.append('visibleToAll', uploadForm.visibleToAll.toString());

      const notificationData = buildNotificationTargetData();
      if (notificationData) {
        formData.append('notificationTargeting', JSON.stringify(notificationData));
      }

      const response = await apiRequest('POST', '/api/schools/documents/upload', formData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/schools/documents'] });
      setIsUploadDialogOpen(false);
      resetUploadForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('DELETE', `/api/schools/documents/${documentId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/schools/documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: number; isPublished: boolean }) => {
      const response = await apiRequest('PATCH', `/api/schools/documents/${id}`, { isPublished });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document visibility updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/schools/documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update document",
        variant: "destructive",
      });
    },
  });

  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadForm({
      title: '',
      description: '',
      category: 'other',
      isPublished: true,
      visibleToAll: true
    });
    setSendNotification(true);
    setNotificationTargetType('all_parents');
    setSelectedClasses([]);
    setSelectedUsers([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const MAX_FILE_SIZE_MB = 25;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "File too large",
          description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
          variant: "destructive",
        });
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      if (!uploadForm.title) {
        setUploadForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
      }
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    uploadMutation.mutate(selectedFile, {
      onSettled: () => setIsUploading(false)
    });
  };

  const handleDownload = (document: SchoolDocument) => {
    const link = window.document.createElement('a');
    link.href = document.filePath;
    link.download = document.fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  return (
    <AppShell>
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Document Management</h1>
            <p className="text-muted-foreground">
              Upload and manage documents for parents and staff
            </p>
          </div>
          <Button onClick={() => setIsUploadDialogOpen(true)} data-testid="button-upload-document">
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No documents yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Upload policies, handbooks, forms, and other documents for parents to access.
              </p>
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Your First Document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {getFileIcon(doc.mimeType)}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{doc.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {formatFileSize(doc.fileSize)} • {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">{categoryLabels[doc.category] || doc.category}</Badge>
                    <Badge variant={doc.isPublished ? 'default' : 'secondary'}>
                      {doc.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  {doc.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {doc.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      data-testid={`button-download-${doc.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePublishMutation.mutate({ 
                        id: doc.id, 
                        isPublished: !doc.isPublished 
                      })}
                      data-testid={`button-toggle-publish-${doc.id}`}
                    >
                      {doc.isPublished ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this document?')) {
                          deleteMutation.mutate(doc.id);
                        }
                      }}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-delete-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document to share with parents. Supported formats: PDF, Word, and images.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="file">File</Label>
                <Input
                  id="file"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif"
                  data-testid="input-file-upload"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum file size: {MAX_FILE_SIZE_MB}MB
                </p>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Document title"
                  data-testid="input-document-title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the document"
                  data-testid="input-document-description"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={uploadForm.category} 
                  onValueChange={(value) => setUploadForm(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger data-testid="select-document-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="policy">Policy</SelectItem>
                    <SelectItem value="handbook">Handbook</SelectItem>
                    <SelectItem value="form">Form</SelectItem>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="calendar">Calendar</SelectItem>
                    <SelectItem value="curriculum">Curriculum</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="visibleToAll">Visible to all parents</Label>
                <Switch
                  id="visibleToAll"
                  checked={uploadForm.visibleToAll}
                  onCheckedChange={(checked) => setUploadForm(prev => ({ ...prev, visibleToAll: checked }))}
                  data-testid="switch-visible-to-all"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isPublished">Publish immediately</Label>
                <Switch
                  id="isPublished"
                  checked={uploadForm.isPublished}
                  onCheckedChange={(checked) => setUploadForm(prev => ({ ...prev, isPublished: checked }))}
                  data-testid="switch-publish"
                />
              </div>

              {uploadForm.isPublished && (
                <>
                  <div className="flex items-center justify-between border-t pt-4">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="sendNotification">Notify parents</Label>
                    </div>
                    <Switch
                      id="sendNotification"
                      checked={sendNotification}
                      onCheckedChange={setSendNotification}
                      data-testid="switch-send-notification"
                    />
                  </div>

                  {sendNotification && (
                    <div className="space-y-3 border rounded-lg p-3 bg-muted/50">
                      <Label className="text-sm font-medium">Who should receive the notification?</Label>
                      <Tabs value={notificationTargetType} onValueChange={(v) => setNotificationTargetType(v as NotificationTargetType)}>
                        <TabsList className="grid w-full grid-cols-3 h-auto">
                          <TabsTrigger value="all_parents" className="text-xs py-1.5">All Parents</TabsTrigger>
                          <TabsTrigger value="class_specific" className="text-xs py-1.5">By Class</TabsTrigger>
                          <TabsTrigger value="individual" className="text-xs py-1.5">Individual</TabsTrigger>
                        </TabsList>

                        <TabsContent value="all_parents" className="mt-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>All parents will receive a notification about this document.</span>
                          </div>
                        </TabsContent>

                        <TabsContent value="class_specific" className="mt-2 space-y-2">
                          <Label className="text-sm">Select classes</Label>
                          {classes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No classes available</p>
                          ) : (
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {classes.map((cls) => (
                                <div key={cls.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`class-${cls.id}`}
                                    checked={selectedClasses.includes(cls.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedClasses([...selectedClasses, cls.id]);
                                      } else {
                                        setSelectedClasses(selectedClasses.filter(id => id !== cls.id));
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`class-${cls.id}`} className="text-sm font-normal">
                                    {cls.title}
                                    {cls.enrollmentCount !== undefined && (
                                      <span className="text-muted-foreground ml-1">({cls.enrollmentCount} enrolled)</span>
                                    )}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedClasses.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                            </p>
                          )}
                        </TabsContent>

                        <TabsContent value="individual" className="mt-2 space-y-2">
                          <Label className="text-sm">Select recipients</Label>
                          <UserLookup
                            value={selectedUsers}
                            onChange={setSelectedUsers}
                            placeholder="Search for parents..."
                            multiSelect={true}
                            modalTitle="Select Document Recipients"
                          />
                          {selectedUsers.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {selectedUsers.length} recipient{selectedUsers.length !== 1 ? 's' : ''} selected
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>

                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsUploadDialogOpen(false);
                resetUploadForm();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={!selectedFile || isUploading}
                data-testid="button-confirm-upload"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
