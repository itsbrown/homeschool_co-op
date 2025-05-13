import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import OCRDocumentUploader from '@/components/OCRDocumentUploader';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, FileText, BookText, AlertTriangle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';

// Define the OCR status response type
interface OCRStatusResponse {
  success: boolean;
  ocrAvailable: boolean;
  message: string;
}

const OCRWorksheetGenerator: React.FC = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [hasProcessedDocument, setHasProcessedDocument] = useState(false);
  
  // Check if OCR service is available
  const { data: ocrStatus, isLoading: isCheckingOCR } = useQuery<OCRStatusResponse>({
    queryKey: ['/api/activities/ocr-status'],
    refetchOnWindowFocus: false,
  });
  
  // Handle OCR document processing completion
  const handleDocumentProcessed = (success: boolean, text?: string) => {
    setHasProcessedDocument(true);
    if (success && text) {
      setExtractedText(text);
      setActiveTab('preview');
    }
  };
  
  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OCR Worksheet Generator</h1>
            <p className="text-muted-foreground mt-1">
              Upload documents and generate educational worksheets from their content
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCheckingOCR ? (
              <Badge variant="outline">Checking OCR Status...</Badge>
            ) : ocrStatus?.ocrAvailable ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                OCR Available
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" />
                OCR Unavailable
              </Badge>
            )}
          </div>
        </div>
        
        <Separator className="my-6" />
        
        {!ocrStatus?.ocrAvailable && !isCheckingOCR && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-yellow-800">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <h3 className="font-semibold">Google Cloud Document AI Not Configured</h3>
                  <p className="text-sm">
                    The OCR service requires a Google Cloud Platform account with Document AI enabled. 
                    Please contact your administrator to configure the necessary credentials.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="upload" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Upload Document
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              disabled={!hasProcessedDocument}
              className="flex items-center gap-1"
            >
              <BookText className="h-4 w-4" />
              Extracted Content
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <OCRDocumentUploader onDocumentProcessed={handleDocumentProcessed} />
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>How It Works</CardTitle>
                  <CardDescription>
                    The OCR Worksheet Generator uses Google Cloud Document AI to extract text from your documents.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-medium">1. Upload a Document</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload a PDF, image, or scanned document. We support PDFs, JPGs, PNGs, and TIFF files.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium">2. OCR Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Our system uses Google Cloud Document AI to extract text from your uploaded document.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium">3. Generate Worksheets</h3>
                    <p className="text-sm text-muted-foreground">
                      The extracted text is analyzed to generate educational worksheets tailored to your subject and grade level.
                    </p>
                  </div>
                  
                  <div className="border rounded-md p-3 bg-muted/50 text-sm">
                    <p className="font-medium mb-1">Supported File Types:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>PDF documents (*.pdf)</li>
                      <li>JPEG images (*.jpg, *.jpeg)</li>
                      <li>PNG images (*.png)</li>
                      <li>TIFF images (*.tiff, *.tif)</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="preview" className="space-y-4">
            <Card className="min-h-[500px]">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Extracted Text Content</span>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('upload')}
                    className="text-sm"
                  >
                    Upload Another Document
                  </Button>
                </CardTitle>
                <CardDescription>
                  The following text was extracted from your document using OCR technology
                </CardDescription>
              </CardHeader>
              <CardContent>
                {extractedText ? (
                  <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                    <pre className="text-sm whitespace-pre-wrap font-mono">{extractedText}</pre>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No content has been extracted yet.
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="flex justify-end">
              <Button 
                size="lg"
                disabled={!extractedText} 
                onClick={() => {
                  // Navigate to the worksheet generator with extracted text
                  window.location.href = `/ai-worksheet-generator?source=ocr&text=${encodeURIComponent(extractedText || '')}`;
                }}
              >
                Create Worksheet from Extracted Text
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
};

export default OCRWorksheetGenerator;