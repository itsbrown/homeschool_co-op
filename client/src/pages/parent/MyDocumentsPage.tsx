import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, FolderOpen, Loader2, Eye, Download, Receipt, FileType, Image, File as FileIcon } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";
import { queryClient } from "@/lib/queryClient";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ParentDocument {
  id: number;
  type: string;
  title: string;
  schoolName: string;
  signedAt: string;
  signatoryName: string;
  agreementVersion: string;
}

interface SchoolDocument {
  id: number;
  schoolId: number;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

interface PaymentReceipt {
  id: number;
  receiptNumber: string;
  schoolId: number;
  schoolName?: string;
  parentUserId: number;
  paymentId: number | null;
  enrollmentId: number | null;
  amount: number;
  description: string;
  receiptDate: string;
  filePath: string | null;
  status: string;
  createdAt: string;
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

function formatCurrency(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-6 w-6 text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileType className="h-6 w-6 text-red-500" />;
  if (mimeType.includes('word')) return <FileText className="h-6 w-6 text-blue-700" />;
  return <FileIcon className="h-6 w-6 text-gray-500" />;
}

export default function MyDocumentsPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const { data: documentsData, isLoading: isLoadingAgreements, isError: isErrorAgreements } = useQuery<{ documents: ParentDocument[] }>({
    queryKey: ["/api/parent/documents"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch("/api/parent/documents", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user && !!session,
    retry: 1,
  });

  const { data: schoolDocsData, isLoading: isLoadingSchoolDocs } = useQuery<{ success: boolean; documents: SchoolDocument[] }>({
    queryKey: ["/api/parent/school-documents"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch("/api/parent/school-documents", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        return { success: false, documents: [] };
      }
      return response.json();
    },
    enabled: !!user && !!session,
    retry: 1,
  });

  const { data: receiptsData, isLoading: isLoadingReceipts } = useQuery<{ success: boolean; receipts: PaymentReceipt[] }>({
    queryKey: ["/api/parent/payment-receipts"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch("/api/parent/payment-receipts", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        return { success: false, receipts: [] };
      }
      return response.json();
    },
    enabled: !!user && !!session,
    retry: 1,
  });

  const handleSchoolDocDownload = async (docId: number, fileName: string) => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/schools/documents/${docId}/download`, {
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
      link.download = fileName;
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

  const handleReceiptDownload = (filePath: string, fileName: string) => {
    const link = window.document.createElement('a');
    link.href = filePath;
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const schoolDocuments = schoolDocsData?.documents || [];
  const paymentReceipts = receiptsData?.receipts || [];

  return (
    <ParentAppShell>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <FolderOpen className="h-7 w-7" />
            My Documents
          </h1>
          <p className="text-muted-foreground mt-1">
            View and download your agreements, school documents, and payment receipts
          </p>
        </div>

        <Tabs defaultValue="agreements" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="agreements" data-testid="tab-agreements">
              Agreements
              {documentsData?.documents && documentsData.documents.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {documentsData.documents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="school-documents" data-testid="tab-school-documents">
              School Documents
              {schoolDocuments.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {schoolDocuments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="receipts" data-testid="tab-receipts">
              Receipts
              {paymentReceipts.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {paymentReceipts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agreements">
            <Card data-testid="card-agreements">
              <CardHeader>
                <CardTitle>Signed Agreements</CardTitle>
                <CardDescription>
                  All your signed membership agreements and important documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAgreements ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Loading documents...</span>
                  </div>
                ) : isErrorAgreements ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-red-500 mb-2">Unable to load documents.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/parent/documents"] })}
                    >
                      Try again
                    </Button>
                  </div>
                ) : !documentsData?.documents || documentsData.documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg mb-1">No agreements yet</p>
                    <p className="text-sm">Signed agreements will appear here once you complete the membership process.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documentsData.documents.map((doc) => (
                      <div 
                        key={doc.id} 
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border bg-muted/30 gap-4"
                        data-testid={`document-row-${doc.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-lg">{doc.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {doc.schoolName}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                v{doc.agreementVersion}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Signed: {new Date(doc.signedAt).toLocaleDateString()}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                By: {doc.signatoryName}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-16 md:ml-0">
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild
                            data-testid={`button-view-doc-${doc.id}`}
                          >
                            <Link href={`/parent/documents/${doc.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="school-documents">
            <Card data-testid="card-school-documents">
              <CardHeader>
                <CardTitle>School Documents</CardTitle>
                <CardDescription>
                  Important documents shared by your school including policies, handbooks, and forms
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSchoolDocs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Loading school documents...</span>
                  </div>
                ) : schoolDocuments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg mb-1">No school documents yet</p>
                    <p className="text-sm">Documents shared by your school will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {schoolDocuments.map((doc) => (
                      <div 
                        key={doc.id} 
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border bg-muted/30 gap-4"
                        data-testid={`school-doc-row-${doc.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                            {getFileIcon(doc.mimeType)}
                          </div>
                          <div>
                            <p className="font-medium text-lg">{doc.title}</p>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {doc.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {categoryLabels[doc.category] || doc.category}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {formatFileSize(doc.fileSize)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-16 md:ml-0">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSchoolDocDownload(doc.id, doc.fileName)}
                            data-testid={`button-download-school-doc-${doc.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receipts">
            <Card data-testid="card-receipts">
              <CardHeader>
                <CardTitle>Payment Receipts</CardTitle>
                <CardDescription>
                  Download receipts for all your payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingReceipts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Loading receipts...</span>
                  </div>
                ) : paymentReceipts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg mb-1">No payment receipts yet</p>
                    <p className="text-sm">Receipts for your payments will appear here after successful transactions.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentReceipts.map((receipt) => (
                      <div 
                        key={receipt.id} 
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border bg-muted/30 gap-4"
                        data-testid={`receipt-row-${receipt.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                            <Receipt className="h-6 w-6 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-lg">{receipt.description}</p>
                            <p className="text-sm text-muted-foreground">
                              Receipt #{receipt.receiptNumber}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="default" className="text-xs bg-green-600">
                                {formatCurrency(receipt.amount)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {format(new Date(receipt.receiptDate), 'MMM d, yyyy')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-16 md:ml-0">
                          {receipt.filePath ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleReceiptDownload(receipt.filePath!, `receipt-${receipt.receiptNumber}.pdf`)}
                              data-testid={`button-download-receipt-${receipt.id}`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled
                              data-testid={`button-receipt-pending-${receipt.id}`}
                            >
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}
