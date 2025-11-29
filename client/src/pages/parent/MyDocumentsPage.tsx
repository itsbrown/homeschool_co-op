import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, FolderOpen, Loader2, ArrowLeft, Download, Eye } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";
import { queryClient } from "@/lib/queryClient";

interface ParentDocument {
  id: number;
  type: string;
  title: string;
  schoolName: string;
  signedAt: string;
  signatoryName: string;
  agreementVersion: string;
}

export default function MyDocumentsPage() {
  const { user, session } = useAuth();

  const { data: documentsData, isLoading, isError } = useQuery<{ documents: ParentDocument[] }>({
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <FolderOpen className="h-7 w-7" />
          My Documents
        </h1>
        <p className="text-muted-foreground mt-1">
          View and download your signed agreements and important documents
        </p>
      </div>

      <Card data-testid="card-all-documents">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Signed Agreements</CardTitle>
            {documentsData?.documents && documentsData.documents.length > 0 && (
              <Badge variant="secondary">
                {documentsData.documents.length} document{documentsData.documents.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <CardDescription>
            All your signed membership agreements and important documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading documents...</span>
            </div>
          ) : isError ? (
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
              <p className="text-lg mb-1">No documents yet</p>
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
    </div>
  );
}
