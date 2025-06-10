import React, { useState, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { 
  Upload, 
  FileText, 
  X, 
  Check, 
  AlertCircle, 
  Loader2,
  FileUp,
  Image,
  Video,
  FileArchive,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FileUploadItem {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface FileUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onUploadComplete: (files: File[]) => void;
  maxFiles?: number;
  acceptedFileTypes?: string[];
}

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return <Image className="h-5 w-5" />;
  if (fileType.startsWith('video/')) return <Video className="h-5 w-5" />;
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileSpreadsheet className="h-5 w-5" />;
  if (fileType.includes('zip') || fileType.includes('rar')) return <FileArchive className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function FileUploadModal({
  open,
  onOpenChange,
  title,
  description,
  onUploadComplete,
  maxFiles = 10,
  acceptedFileTypes = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png']
}: FileUploadModalProps) {
  const { toast } = useToast();
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newItems: FileUploadItem[] = acceptedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      progress: 0
    }));

    setUploadItems(prev => [...prev, ...newItems].slice(0, maxFiles));
  }, [maxFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: acceptedFileTypes.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>)
  });

  const removeFile = (id: string) => {
    setUploadItems(prev => prev.filter(item => item.id !== id));
  };

  const uploadFile = async (item: FileUploadItem) => {
    try {
      setUploadItems(prev => 
        prev.map(prevItem => 
          prevItem.id === item.id 
            ? { ...prevItem, status: 'uploading', progress: 0 }
            : prevItem
        )
      );

      const formData = new FormData();
      formData.append('files', item.file);

      const response = await fetch('/api/file-upload/knowledge-base', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setUploadItems(prev => 
          prev.map(prevItem => 
            prevItem.id === item.id 
              ? { ...prevItem, status: 'success', progress: 100 }
              : prevItem
          )
        );
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error) {
      setUploadItems(prev => 
        prev.map(prevItem => 
          prevItem.id === item.id 
            ? { 
                ...prevItem, 
                status: 'error', 
                error: error instanceof Error ? error.message : 'Upload failed'
              }
            : prevItem
        )
      );
    }
  };

  const handleUpload = async () => {
    if (uploadItems.length === 0) return;

    setIsUploading(true);
    
    try {
      // Process uploads sequentially for demo
      for (const item of uploadItems.filter(i => i.status === 'pending')) {
        await simulateUpload(item);
      }

      const successfulFiles = uploadItems
        .filter(item => item.status === 'success')
        .map(item => item.file);

      onUploadComplete(successfulFiles);
      
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${successfulFiles.length} files`,
      });

      // Reset and close
      setUploadItems([]);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Some files failed to upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if (!isUploading) {
      setUploadItems([]);
      onOpenChange(false);
    }
  };

  const totalProgress = uploadItems.length > 0 
    ? uploadItems.reduce((sum, item) => sum + item.progress, 0) / uploadItems.length 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Drop Zone */}
          {uploadItems.length === 0 ? (
            <div 
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {isDragActive ? 'Drop files here' : 'Click to select files'}
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                or drag and drop files here
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, Word, Images, and other document formats accepted
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress Overview */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading files...</span>
                    <span>{Math.round(totalProgress)}%</span>
                  </div>
                  <Progress value={totalProgress} className="h-2" />
                </div>
              )}

              {/* File List */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {uploadItems.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 text-muted-foreground">
                          {getFileIcon(item.file.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(item.file.size)}
                          </p>
                          {item.status === 'uploading' && (
                            <Progress value={item.progress} className="h-1 mt-1" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {item.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(item.id)}
                            disabled={isUploading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        {item.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        {item.status === 'success' && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Add More Files Button */}
              {!isUploading && uploadItems.length < maxFiles && (
                <Button
                  variant="outline"
                  className="w-full"
                  {...getRootProps()}
                >
                  <input {...getInputProps()} />
                  <Upload className="mr-2 h-4 w-4" />
                  Add More Files
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isUploading}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={uploadItems.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {uploadItems.length} {uploadItems.length === 1 ? 'file' : 'files'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}