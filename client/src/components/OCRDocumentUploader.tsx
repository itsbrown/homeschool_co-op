import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileType, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OCRDocumentUploaderProps {
  onDocumentProcessed?: (success: boolean, text?: string) => void;
  allowedFileTypes?: string[];
  maxSizeMB?: number;
  title?: string;
  description?: string;
}

const OCRDocumentUploader: React.FC<OCRDocumentUploaderProps> = ({
  onDocumentProcessed,
  allowedFileTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp'],
  maxSizeMB = 50,
  title = 'Upload Document for OCR',
  description = 'Upload a document, book, or image to extract text using OCR technology.',
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check file type
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
    const isValidType = allowedFileTypes.includes(fileExtension);
    if (!isValidType) {
      toast({
        title: 'Invalid file type',
        description: `Please upload one of the following file types: ${allowedFileTypes.join(', ')}`,
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    // Check file size
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      toast({
        title: 'File too large',
        description: `Max file size is ${maxSizeMB}MB. Your file is ${fileSizeMB.toFixed(2)}MB.`,
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    setStatus('idle');
    setErrorMessage('');
    setProgress(0);
  };

  const uploadFile = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    // Reset state
    setIsUploading(true);
    setProgress(0);
    setStatus('uploading');
    setErrorMessage('');

    // Create form data for file upload
    const formData = new FormData();
    formData.append('document', file);
    formData.append('useOCR', 'true');
    formData.append('subject', 'Document OCR');
    formData.append('ageRange', '6-8');
    formData.append('activityType', 'worksheet');
    formData.append('difficulty', 'beginner');
    formData.append('instructions', `Extract text from uploaded document: ${file.name}`);

    try {
      // Create simulated upload progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 300);

      // Upload file
      const response = await fetch('/api/activities/generate', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload document');
      }

      // Get job ID from response
      const data = await response.json();
      if (!data.jobId) {
        throw new Error('No job ID returned from server');
      }

      // Update UI
      setProgress(100);
      setStatus('processing');
      toast({
        title: 'Document uploaded successfully',
        description: 'Your document is now being processed with OCR...',
      });

      // Poll for job status
      await pollJobStatus(data.jobId);

    } catch (error) {
      console.error('Error uploading document:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/activities/job/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to check job status');
      }

      const data = await response.json();
      
      if (data.status === 'completed') {
        setStatus('success');
        toast({
          title: 'OCR Processing Complete',
          description: 'Document has been successfully processed',
        });
        
        // Notify parent component if callback provided
        if (onDocumentProcessed) {
          onDocumentProcessed(true, data.result?.data?.extractedText);
        }
        
        return;
      } else if (data.status === 'failed') {
        setStatus('error');
        setErrorMessage(data.result?.error || 'OCR processing failed');
        
        if (onDocumentProcessed) {
          onDocumentProcessed(false);
        }
        
        return;
      }
      
      // If still processing, poll again after a delay
      setTimeout(() => pollJobStatus(jobId), 2000);
    } catch (error) {
      console.error('Error checking job status:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check job status');
      
      if (onDocumentProcessed) {
        onDocumentProcessed(false);
      }
    }
  };

  const resetUploader = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setErrorMessage('');
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-md">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <FileType className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept={allowedFileTypes.join(',')}
              disabled={isUploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <Upload className="h-10 w-10 text-gray-400" />
              <span className="text-sm text-gray-500">
                {file ? file.name : `Click to upload or drag and drop`}
              </span>
              <span className="text-xs text-gray-400">
                ({allowedFileTypes.join(', ')}) - Max {maxSizeMB}MB
              </span>
            </label>
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {status === 'uploading' ? 'Uploading...' : 'Processing OCR...'}
              </span>
              <Badge variant={status === 'uploading' ? "outline" : "default"}>
                {status === 'uploading' ? `${progress}%` : 'Processing'}
                {status === 'processing' && <RefreshCw className="ml-1 h-3 w-3 animate-spin" />}
              </Badge>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-gray-500">
              {status === 'uploading' 
                ? 'Uploading your document. Please wait...' 
                : 'Extracting text from your document using OCR...'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center p-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <h3 className="font-medium">Document Processed Successfully</h3>
            <p className="text-sm text-gray-500">
              Your document has been successfully processed with OCR.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center p-6 space-y-3 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h3 className="font-medium">Processing Failed</h3>
            <p className="text-sm text-red-500">
              {errorMessage || 'An error occurred while processing your document.'}
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {status !== 'idle' && (
          <Button variant="outline" onClick={resetUploader}>
            Reset
          </Button>
        )}
        {(status === 'idle' && file) && (
          <Button onClick={uploadFile} disabled={isUploading || !file}>
            Process Document
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default OCRDocumentUploader;