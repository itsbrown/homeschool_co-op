import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Edit, CreditCard, FileText, Tag, Target, Share2, ExternalLink } from "lucide-react";
import type { KnowledgeBase } from "@shared/schema";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function KnowledgeBaseDetailPage() {
  const [, params] = useRoute("/knowledge-base/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  const knowledgeBaseQuery = useQuery<KnowledgeBase>({
    queryKey: [`/api/knowledge-bases/${id}`],
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/knowledge-bases/${id}/download`, "POST");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Download started successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-bases/${id}`] });
    },
    onError: (error) => {
      console.error("Error downloading knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to download knowledge base",
        variant: "destructive",
      });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/knowledge-bases/${id}/purchase`, "POST");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-bases/${id}`] });
      setShowPurchaseDialog(false);
    },
    onError: (error) => {
      console.error("Error purchasing knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to complete purchase",
        variant: "destructive",
      });
    },
  });

  const isOwner = user && knowledgeBaseQuery.data?.authorId === user.id;
  const hasPurchased = user && knowledgeBaseQuery.data?.purchasedBy?.includes(user.id);
  const canDownload = knowledgeBaseQuery.data?.price === 0 || isOwner || hasPurchased;

  const handleDownload = () => {
    if (canDownload) {
      downloadMutation.mutate();
      
      // Also trigger the actual file downloads
      knowledgeBaseQuery.data?.files?.forEach(file => {
        const link = document.createElement("a");
        link.href = file.url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    } else {
      setShowPurchaseDialog(true);
    }
  };

  const handlePurchase = () => {
    purchaseMutation.mutate();
  };

  if (knowledgeBaseQuery.isLoading) {
    return (
      <div className="container py-10">
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
    );
  }

  if (!knowledgeBaseQuery.data) {
    return (
      <div className="container py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Knowledge Base Not Found</h1>
        <p className="text-muted-foreground mb-6">The knowledge base you're looking for doesn't exist or you don't have permission to view it.</p>
        <Link href="/knowledge-base">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Knowledge Base
          </Button>
        </Link>
      </div>
    );
  }

  const { data } = knowledgeBaseQuery;

  return (
    <div className="container py-10">
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <Link href="/knowledge-base">
            <Button variant="outline" size="sm" className="mr-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{data.title}</h1>
          {isOwner && (
            <Link href={`/knowledge-base/${id}/edit`}>
              <Button variant="outline" size="sm" className="ml-4">
                <Edit className="mr-2 h-4 w-4" /> Edit
              </Button>
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <Badge variant="outline">{data.subject}</Badge>
          <Badge variant="outline">{data.difficulty}</Badge>
          {data.price > 0 ? (
            <Badge>${(data.price / 100).toFixed(2)}</Badge>
          ) : (
            <Badge variant="secondary">Free</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Created on {new Date(data.createdAt).toLocaleDateString()}
          {data.updatedAt !== data.createdAt && 
            ` • Updated on ${new Date(data.updatedAt).toLocaleDateString()}`}
          {` • ${data.downloadCount} downloads`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="prose max-w-none">
              <p>{data.description || "No description provided"}</p>

              {data.metadata?.objectives && data.metadata.objectives.length > 0 && (
                <div className="mt-6">
                  <h3 className="flex items-center text-lg font-semibold mb-2">
                    <Target className="mr-2 h-5 w-5" /> Learning Objectives
                  </h3>
                  <ul>
                    {data.metadata.objectives.map((objective, i) => (
                      <li key={i}>{objective}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.files && data.files.length > 0 && (
                <div className="mt-6">
                  <h3 className="flex items-center text-lg font-semibold mb-2">
                    <FileText className="mr-2 h-5 w-5" /> Files Included
                  </h3>
                  <ul className="space-y-2">
                    {data.files.map((file, i) => (
                      <li key={i} className="flex items-center">
                        <FileText className="mr-2 h-4 w-4" /> {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.metadata?.tags && data.metadata.tags.length > 0 && (
                <div className="mt-6">
                  <h3 className="flex items-center text-lg font-semibold mb-2">
                    <Tag className="mr-2 h-5 w-5" /> Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.metadata.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="bg-muted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full" 
                onClick={handleDownload} 
                disabled={downloadMutation.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadMutation.isPending ? "Downloading..." : canDownload ? "Download Files" : "Purchase to Download"}
              </Button>
              
              {isOwner && (
                <Link href={`/knowledge-base/${id}/edit`} className="w-full">
                  <Button variant="secondary" className="w-full">
                    <Edit className="mr-2 h-4 w-4" /> Edit Knowledge Base
                  </Button>
                </Link>
              )}
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: data.title,
                      text: data.description || "Check out this knowledge base",
                      url: window.location.href,
                    }).catch(console.error);
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    toast({
                      title: "Link copied",
                      description: "Share link has been copied to clipboard",
                    });
                  }
                }}
              >
                <Share2 className="mr-2 h-4 w-4" /> Share
              </Button>
              
              {data.metadata?.externalLinks && data.metadata.externalLinks.length > 0 && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">External Resources</h4>
                  <div className="space-y-2">
                    {data.metadata.externalLinks.map((link, i) => (
                      <a 
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-blue-600 hover:underline"
                      >
                        <ExternalLink className="mr-1 h-3 w-3" /> {link.title || link.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Knowledge Base</DialogTitle>
            <DialogDescription>
              Complete your purchase to download this knowledge base.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex justify-between mb-4">
              <span>Knowledge Base:</span>
              <span className="font-medium">{data.title}</span>
            </div>
            <div className="flex justify-between mb-4">
              <span>Price:</span>
              <span className="font-medium">${(data.price / 100).toFixed(2)}</span>
            </div>
            
            <div className="border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Note: In a production system, this would connect to a payment processor like Stripe.
                For this demo, we'll simulate a successful purchase.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePurchase} disabled={purchaseMutation.isPending}>
              <CreditCard className="mr-2 h-4 w-4" />
              {purchaseMutation.isPending ? "Processing..." : `Pay $${(data.price / 100).toFixed(2)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}