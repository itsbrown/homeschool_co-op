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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
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
  Users,
  Archive,
  ArchiveRestore,
  Calendar,
  Clock
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
  expiresAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocumentViewEntry {
  id: number;
  documentId: number;
  userId: number;
  downloadedAt: string;
  userName: string;
  userEmail: string;
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

interface NotificationTargetingProps {
  targetType: NotificationTargetType;
  onTargetTypeChange: (type: NotificationTargetType) => void;
  selectedClasses: number[];
  onSelectedClassesChange: (classes: number[]) => void;
  selectedUsers: UserResult[];
  onSelectedUsersChange: (users: UserResult[]) => void;
  classes: ClassInfo[];
}

function NotificationTargetingUI({
  targetType,
  onTargetTypeChange,
  selectedClasses,
  onSelectedClassesChange,
  selectedUsers,
  onSelectedUsersChange,
  classes
}: NotificationTargetingProps) {
  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/50">
      <Label className="text-sm font-medium">Who should receive the notification?</Label>
      <Tabs value={targetType} onValueChange={(v) => onTargetTypeChange(v as NotificationTargetType)}>
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
                    id={`target-class-${cls.id}`}
                    checked={selectedClasses.includes(cls.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onSelectedClassesChange([...selectedClasses, cls.id]);
                      } else {
                        onSelectedClassesChange(selectedClasses.filter(id => id !== cls.id));
                      }
                    }}
                  />
                  <Label htmlFor={`target-class-${cls.id}`} className="text-sm font-normal">
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
            onChange={onSelectedUsersChange}
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
  );
}

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: 'other',
    isPublished: false,
    visibleToAll: false,
    expiresAt: '',
  });

  const [sendNotification, setSendNotification] = useState(false);
  const [notificationTargetType, setNotificationTargetType] = useState<NotificationTargetType>('all_parents');
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);

  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [documentToNotify, setDocumentToNotify] = useState<SchoolDocument | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<SchoolDocument | null>(null);
  const [notifyTargetType, setNotifyTargetType] = useState<NotificationTargetType>('all_parents');
  const [notifySelectedClasses, setNotifySelectedClasses] = useState<number[]>([]);
  const [notifySelectedUsers, setNotifySelectedUsers] = useState<UserResult[]>([]);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const [downloadsSheetDocId, setDownloadsSheetDocId] = useState<number | null>(null);
  const [downloadsSheetTitle, setDownloadsSheetTitle] = useState('');

  const { data: schoolData } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user?.email,
  });

  const { data: documentsData, isLoading } = useQuery<{ success: boolean; documents: SchoolDocument[] }>({
    queryKey: ['/api/schools/documents'],
    enabled: !!user?.email,
  });

  const { data: viewsData, isLoading: isLoadingViews } = useQuery<{ success: boolean; views: DocumentViewEntry[] }>({
    queryKey: ['/api/schools/documents', downloadsSheetDocId, 'views'],
    enabled: downloadsSheetDocId !== null,
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
    mutationFn: async (files: File[]) => {
      const createdDocumentIds: number[] = [];
      const errors: string[] = [];
      const single = files.length === 1;

      // Upload each file individually (reusing the per-file validation/dedupe on the
      // backend). Notifications are NOT sent inline — a single joint notification is
      // sent after all uploads succeed so parents get one alert for the whole batch.
      for (const file of files) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const title = single ? (uploadForm.title || baseName) : baseName;

        const formData = new FormData();
        formData.append('document', file);
        formData.append('title', title);
        formData.append('description', uploadForm.description);
        formData.append('category', uploadForm.category);
        formData.append('isPublished', uploadForm.isPublished.toString());
        formData.append('visibleToAll', uploadForm.visibleToAll.toString());
        if (uploadForm.expiresAt) {
          formData.append('expiresAt', uploadForm.expiresAt);
        }

        try {
          const response = await apiRequest('POST', '/api/schools/documents/upload', formData);
          const data = await response.json();
          if (!response.ok) {
            errors.push(`${file.name}: ${data.message || 'upload failed'}`);
            continue;
          }
          if (data.document?.id) {
            createdDocumentIds.push(data.document.id);
          }
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
        }
      }

      // Send one joint notification covering every successfully uploaded document.
      let notifiedCount = 0;
      const notificationData = buildNotificationTargetData();
      if (notificationData && createdDocumentIds.length > 0) {
        try {
          const notifyResponse = await apiRequest('POST', '/api/schools/documents/notify-bulk', {
            documentIds: createdDocumentIds,
            targeting: notificationData,
          });
          if (notifyResponse.ok) {
            notifiedCount = createdDocumentIds.length;
          }
        } catch {
          // Notification failure is non-fatal — documents are still uploaded.
        }
      }

      return { createdCount: createdDocumentIds.length, errors, notifiedCount };
    },
    onSuccess: (result) => {
      if (result.createdCount === 0) {
        toast({
          title: "Upload failed",
          description: result.errors.join('; ') || 'No documents were uploaded',
          variant: "destructive",
        });
        return;
      }

      const notifiedText = result.notifiedCount > 0 ? ' • parents notified' : '';
      toast({
        title: result.errors.length > 0 ? "Partially uploaded" : "Success",
        description: result.errors.length > 0
          ? `${result.createdCount} uploaded${notifiedText}. Issues: ${result.errors.join('; ')}`
          : `${result.createdCount} document${result.createdCount !== 1 ? 's' : ''} uploaded${notifiedText}`,
        variant: result.errors.length > 0 ? "default" : undefined,
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

  const archiveMutation = useMutation({
    mutationFn: async ({ id, isArchived }: { id: number; isArchived: boolean }) => {
      const response = await apiRequest('PATCH', `/api/schools/documents/${id}`, { isArchived });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update document');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Success",
        description: variables.isArchived ? "Document archived" : "Document restored",
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

  const notifyMutation = useMutation({
    mutationFn: async ({ documentId, targeting }: { documentId: number; targeting: any }) => {
      const response = await apiRequest('POST', `/api/schools/documents/${documentId}/notify`, { targeting });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send notification');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Notification sent successfully",
      });
      setIsNotifyDialogOpen(false);
      resetNotifyForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
      });
    },
  });

  const resetUploadForm = () => {
    setSelectedFiles([]);
    setUploadForm({
      title: '',
      description: '',
      category: 'other',
      isPublished: false,
      visibleToAll: false,
      expiresAt: '',
    });
    setSendNotification(false);
    setNotificationTargetType('all_parents');
    setSelectedClasses([]);
    setSelectedUsers([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetNotifyForm = () => {
    setDocumentToNotify(null);
    setNotifyTargetType('all_parents');
    setNotifySelectedClasses([]);
    setNotifySelectedUsers([]);
  };

  const openNotifyDialog = (doc: SchoolDocument) => {
    setDocumentToNotify(doc);
    setNotifyTargetType('all_parents');
    setNotifySelectedClasses([]);
    setNotifySelectedUsers([]);
    setIsNotifyDialogOpen(true);
  };

  const buildNotifyTargetData = () => {
    switch (notifyTargetType) {
      case 'all_parents':
        return { targetType: 'all_parents' };
      case 'class_specific':
        return { targetType: 'class_specific', classIds: notifySelectedClasses };
      case 'individual':
        return { targetType: 'individual', userIds: notifySelectedUsers.map(u => u.id) };
      default:
        return null;
    }
  };

  const handleSendNotification = () => {
    if (!documentToNotify) return;
    
    const targeting = buildNotifyTargetData();
    if (!targeting) {
      toast({
        title: "Error",
        description: "Please select notification recipients",
        variant: "destructive",
      });
      return;
    }

    setIsSendingNotification(true);
    notifyMutation.mutate(
      { documentId: documentToNotify.id, targeting },
      { onSettled: () => setIsSendingNotification(false) }
    );
  };

  const MAX_FILE_SIZE_MB = 25;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const oversized: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        oversized.push(file.name);
      } else {
        validFiles.push(file);
      }
    }

    if (oversized.length > 0) {
      toast({
        title: oversized.length === files.length ? "File too large" : "Some files skipped",
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB. Skipped: ${oversized.join(', ')}`,
        variant: "destructive",
      });
    }

    setSelectedFiles(validFiles);
    // Prefill the title from the file name only when a single file is selected.
    if (validFiles.length === 1 && !uploadForm.title) {
      setUploadForm(prev => ({ ...prev, title: validFiles[0].name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one file to upload",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    uploadMutation.mutate(selectedFiles, {
      onSettled: () => setIsUploading(false)
    });
  };

  const handleDownload = async (document: SchoolDocument) => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/schools/documents/${document.id}/download`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: "Unable to download the document. Please try again.",
        variant: "destructive",
      });
    }
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
            {documents.map((doc) => {
              const isExpired = doc.expiresAt && new Date(doc.expiresAt) < new Date();
              return (
                <Card key={doc.id} data-testid={`card-document-${doc.id}`} className={doc.isArchived ? 'opacity-70' : ''}>
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
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <Badge variant="outline">{categoryLabels[doc.category] || doc.category}</Badge>
                      <Badge variant={doc.isPublished ? 'default' : 'secondary'}>
                        {doc.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      {doc.isArchived && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          Archived
                        </Badge>
                      )}
                      {isExpired && !doc.isArchived && (
                        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Expired
                        </Badge>
                      )}
                      {doc.expiresAt && !isExpired && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="h-3 w-3" />
                          Expires {format(new Date(doc.expiresAt), 'MMM d, yyyy')}
                        </Badge>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {doc.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
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
                        onClick={() => {
                          setDownloadsSheetDocId(doc.id);
                          setDownloadsSheetTitle(doc.title);
                        }}
                        data-testid={`button-downloads-${doc.id}`}
                        title="View download history"
                        className="gap-1"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openNotifyDialog(doc)}
                        data-testid={`button-notify-${doc.id}`}
                        title="Send notification"
                      >
                        <Bell className="h-4 w-4" />
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
                        onClick={() => archiveMutation.mutate({ id: doc.id, isArchived: !doc.isArchived })}
                        data-testid={`button-archive-${doc.id}`}
                        title={doc.isArchived ? 'Restore document' : 'Archive document'}
                      >
                        {doc.isArchived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDocumentToDelete(doc);
                          setDeleteConfirmOpen(true);
                        }}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
              <DialogDescription>
                Upload one or more files to share with parents. Supported formats: PDF, Word, and images.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="file">Files</Label>
                <Input
                  id="file"
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif"
                  data-testid="input-file-upload"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum file size: {MAX_FILE_SIZE_MB}MB each. Select multiple files to upload in bulk.
                </p>
                {selectedFiles.length === 1 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Selected: {selectedFiles[0].name} ({formatFileSize(selectedFiles[0].size)})
                  </p>
                )}
                {selectedFiles.length > 1 && (
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1">
                    <p className="text-xs font-medium">{selectedFiles.length} files selected</p>
                    {selectedFiles.map((f, i) => (
                      <p key={`${f.name}-${i}`} className="text-xs text-muted-foreground truncate">
                        {f.name} ({formatFileSize(f.size)})
                      </p>
                    ))}
                  </div>
                )}
              </div>
              {selectedFiles.length > 1 ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Each document's title will be taken from its file name. The settings below
                    (description, category, visibility, expiry, notification) apply to all selected files.
                  </p>
                </div>
              ) : (
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
              )}
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
                  onCheckedChange={(checked) => {
                    setUploadForm(prev => ({ ...prev, isPublished: checked }));
                    if (!checked) {
                      setSendNotification(false);
                    }
                  }}
                  data-testid="switch-publish"
                />
              </div>
              <div>
                <Label htmlFor="expiresAt" className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Expiry date (optional)
                </Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={uploadForm.expiresAt}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                  data-testid="input-expires-at"
                  style={{ fontSize: '16px' }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If set, this document will automatically be hidden from parents after this date.
                </p>
              </div>

              {uploadForm.isPublished && (
                <>
                  <div className="flex items-center justify-between border-t pt-4">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <Label htmlFor="sendNotification">Notify parents</Label>
                        <p className="text-xs text-muted-foreground">
                          Sends an in-app notification and an email.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="sendNotification"
                      checked={sendNotification}
                      onCheckedChange={setSendNotification}
                      data-testid="switch-send-notification"
                    />
                  </div>

                  {sendNotification && (
                    <NotificationTargetingUI
                      targetType={notificationTargetType}
                      onTargetTypeChange={setNotificationTargetType}
                      selectedClasses={selectedClasses}
                      onSelectedClassesChange={setSelectedClasses}
                      selectedUsers={selectedUsers}
                      onSelectedUsersChange={setSelectedUsers}
                      classes={classes}
                    />
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
                disabled={selectedFiles.length === 0 || isUploading}
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
                    {selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Files` : 'Upload'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isNotifyDialogOpen} onOpenChange={(open) => {
          setIsNotifyDialogOpen(open);
          if (!open) resetNotifyForm();
        }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send Notification</DialogTitle>
              <DialogDescription>
                {documentToNotify && (
                  <>Send a notification about "<strong>{documentToNotify.title}</strong>" to selected recipients.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <NotificationTargetingUI
                targetType={notifyTargetType}
                onTargetTypeChange={setNotifyTargetType}
                selectedClasses={notifySelectedClasses}
                onSelectedClassesChange={setNotifySelectedClasses}
                selectedUsers={notifySelectedUsers}
                onSelectedUsersChange={setNotifySelectedUsers}
                classes={classes}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsNotifyDialogOpen(false);
                resetNotifyForm();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSendNotification} 
                disabled={isSendingNotification}
                data-testid="button-confirm-notify"
              >
                {isSendingNotification ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Send Notification
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDocumentToDelete(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Document</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{documentToDelete?.title}"? This action cannot be undone and will remove the document from all parents' document tabs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (documentToDelete) {
                    deleteMutation.mutate(documentToDelete.id);
                    setDocumentToDelete(null);
                    setDeleteConfirmOpen(false);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Download History Sheet */}
        <Sheet open={downloadsSheetDocId !== null} onOpenChange={(open) => {
          if (!open) setDownloadsSheetDocId(null);
        }}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Download History
              </SheetTitle>
              <SheetDescription>
                {downloadsSheetTitle && (
                  <>Downloads for "<strong>{downloadsSheetTitle}</strong>"</>
                )}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-3">
              {isLoadingViews ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !viewsData?.views || viewsData.views.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Download className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No downloads recorded yet.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {viewsData.views.length} download{viewsData.views.length !== 1 ? 's' : ''} total
                  </p>
                  {viewsData.views.map((view) => (
                    <div key={view.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{view.userName || 'Unknown user'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(view.downloadedAt), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}
