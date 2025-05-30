import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth0";
import { KnowledgeBaseEditDialog } from "@/components/KnowledgeBaseEditDialog";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Edit, FileText } from "lucide-react";
import { Link } from "wouter";
import { type KnowledgeBase } from "@shared/schema";
import PageLayout from "@/components/layout/PageLayout";

export default function KnowledgeBaseEditPage() {
  const [, params] = useRoute("/knowledge-base/:id/edit");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();
  const [showEditDialog, setShowEditDialog] = useState(false);

  const knowledgeBaseQuery = useQuery<KnowledgeBase>({
    queryKey: [`/api/knowledge-bases/${id}`],
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  // Check if the user is the owner of the knowledge base
  useEffect(() => {
    if (knowledgeBaseQuery.data && user) {
      if (knowledgeBaseQuery.data.authorId !== user.id) {
        // Redirect to detail page if not the owner
        setLocation(`/knowledge-base/${id}`);
      }
    }
  }, [knowledgeBaseQuery.data, user, id, setLocation]);

  useEffect(() => {
    // Open the edit dialog automatically when the page loads
    if (knowledgeBaseQuery.data && !knowledgeBaseQuery.isLoading) {
      setShowEditDialog(true);
    }
  }, [knowledgeBaseQuery.data, knowledgeBaseQuery.isLoading]);

  // Handle dialog close - redirect back to detail page
  const handleDialogClose = (open: boolean) => {
    setShowEditDialog(open);
    if (!open) {
      setLocation(`/knowledge-base/${id}`);
    }
  };

  if (knowledgeBaseQuery.isLoading) {
    return (
      <PageLayout title="Loading..." backTo={`/knowledge-base/${id}`}>
        <div className="container py-4">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!knowledgeBaseQuery.data) {
    return (
      <PageLayout title="Not Found" backTo="/knowledge-base">
        <div className="container py-4 text-center">
          <h1 className="text-3xl font-bold mb-4">Knowledge Base Not Found</h1>
          <p className="text-muted-foreground mb-6">The knowledge base you're looking for doesn't exist or you don't have permission to view it.</p>
        </div>
      </PageLayout>
    );
  }

  const { data } = knowledgeBaseQuery;

  return (
    <PageLayout title={`Edit: ${data.title}`} backTo={`/knowledge-base/${id}`}>
      <div className="container py-4">
        <Card>
          <CardHeader>
            <CardTitle>Edit Knowledge Base</CardTitle>
            <CardDescription>
              Update your educational resource information and files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowEditDialog(true)}>
              <Edit className="mr-2 h-4 w-4" /> Open Editor
            </Button>
          </CardContent>
        </Card>

        {knowledgeBaseQuery.data && (
          <KnowledgeBaseEditDialog
            open={showEditDialog}
            onOpenChange={handleDialogClose}
            knowledgeBaseId={id}
          />
        )}
      </div>
    </PageLayout>
  );
}