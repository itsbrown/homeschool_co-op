import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth0";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Edit, CreditCard, FileText, Tag, Target, Share2, ExternalLink } from "lucide-react";
import type { KnowledgeBase } from "@shared/schema";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import JSZip from 'jszip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageLayout from "@/components/layout/PageLayout";

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

  // We use direct fetch calls in the handler functions instead of mutations

  const isOwner = user && knowledgeBaseQuery.data?.authorId === user.id;
  const hasPurchased = user && knowledgeBaseQuery.data?.purchasedBy?.includes(user.id);
  const canDownload = knowledgeBaseQuery.data?.price === 0 || isOwner || hasPurchased;

  // Helper function to download a single file
  const downloadSingleFile = (file) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper function to create a zip file from multiple files
  const downloadFilesAsZip = async (files, zipName) => {
    try {
      toast({
        title: "Processing",
        description: "Creating your zip file...",
      });
      
      // Create a new JSZip instance
      const zip = new JSZip();
      const fetchPromises = [];
      
      // Add each file to the zip
      for (const file of files) {
        // Fetch the file content
        fetchPromises.push(
          fetch(file.url)
            .then(response => {
              if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);
              return response.blob();
            })
            .then(blob => {
              // Add the file to the zip
              zip.file(file.name, blob);
              console.log(`Added ${file.name} to zip`);
            })
            .catch(error => {
              console.error(`Error fetching file ${file.name}:`, error);
              throw error;
            })
        );
      }
      
      // Wait for all files to be fetched and added to the zip
      await Promise.all(fetchPromises);
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create a download link for the zip file
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${zipName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      URL.revokeObjectURL(link.href);
      
      toast({
        title: "Success",
        description: "Download completed successfully",
      });
    } catch (error) {
      console.error("Error creating zip file:", error);
      toast({
        title: "Error",
        description: "Failed to create zip file. See console for details.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async () => {
    if (canDownload) {
      try {
        console.log("Starting download with direct fetch");
        
        // Use direct fetch with GET method
        const response = await fetch(`/api/knowledge-bases/${id}/download`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        console.log("Download API call successful", data);
        
        let files = [];
        let title = knowledgeBaseQuery.data?.title || "download";
        
        // Get files from either response or query data
        if (data.files && data.files.length > 0) {
          files = data.files;
          if (data.title) title = data.title;
        } else if (knowledgeBaseQuery.data?.files && knowledgeBaseQuery.data.files.length > 0) {
          files = knowledgeBaseQuery.data.files;
        } else {
          toast({
            title: "Warning",
            description: "No files found to download",
            variant: "default",
          });
          return;
        }
        
        // If there's only one file, download it directly
        if (files.length === 1) {
          downloadSingleFile(files[0]);
          toast({
            title: "Success",
            description: "Download started successfully",
          });
        } 
        // If there are multiple files, create a zip file
        else if (files.length > 1) {
          await downloadFilesAsZip(files, title);
        }
        
        // Refresh data
        queryClient.invalidateQueries({ queryKey: [`/api/knowledge-bases/${id}`] });
      } catch (error) {
        console.error("Error downloading knowledge base:", error);
        toast({
          title: "Error",
          description: "Failed to download knowledge base. See console for details.",
          variant: "destructive",
        });
      }
    } else {
      setShowPurchaseDialog(true);
    }
  };

  const [location, navigate] = useLocation();

  // Redirect to Stripe checkout
  const handlePurchase = () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to purchase this knowledge base",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (!data) {
      return;
    }

    // Create URL with query parameters
    const price = data.price || 0;
    const title = encodeURIComponent(data.title);
    
    // Redirect to the Checkout page with necessary parameters
    const checkoutUrl = `/checkout?kb=${id}&amount=${price}&title=${title}`;
    navigate(checkoutUrl);
    
    // Close purchase dialog if open
    setShowPurchaseDialog(false);
  };

  if (knowledgeBaseQuery.isLoading) {
    return (
      <PageLayout title="Loading..." backTo="/knowledge-base">
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
    <PageLayout title={data.title} backTo="/knowledge-base">
      <div className="container py-4">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            {isOwner && (
              <Link href={`/knowledge-base/${id}/edit`}>
                <Button variant="outline" size="sm" className="mr-4">
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
              >
                <Download className="mr-2 h-4 w-4" />
                {canDownload ? "Download Files" : "Purchase to Download"}
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
              <span className="font-medium">${(data.price / 100).toFixed(2)} USD</span>
            </div>
            
            <div className="border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                You'll be redirected to our secure checkout page where you can complete your purchase
                using your preferred payment method.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePurchase}>
              <CreditCard className="mr-2 h-4 w-4" />
              {`Pay $${(data.price / 100).toFixed(2)} USD`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageLayout>
  );
}